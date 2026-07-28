/**
 * WordPress REST client.
 *
 * Authentication is an **application password** (core since 5.6) sent as HTTP
 * Basic, or optionally a JWT `Bearer` token if the site runs a JWT plugin. Both
 * are stored encrypted and only held in memory for one request.
 *
 * Self-hosted reality this client is built around:
 *  - the site may be at `http://192.168.1.20` or `http://nexus.local`, so URL
 *    checking goes through the *localService* policy, not the https-only one;
 *  - WordPress may live in a subdirectory (`https://example.com/blog`);
 *  - the REST API may be disabled, or pretty permalinks may be off (in which
 *    case `/wp-json/` 404s and `/?rest_route=/` works);
 *  - WooCommerce may or may not be installed — that is *detected*, never assumed;
 *  - the credential may be an Editor rather than an Administrator, so plugin
 *    and site-health reads must degrade to "not permitted", not to zero.
 */

import { HttpClient, type FetchLike, type HttpLogEntry, type HttpResponse } from "../core/http.js";
import { IntegrationError } from "../core/errors.js";
import { connected, connectionStateFromError, notConfigured, type ConnectionState } from "../core/connection.js";
import { type Fetched, type MetricSnapshotInput, metricSnapshot, toIso, toMinorUnits } from "../core/types.js";
import { validateLocalServiceUrl } from "../security-port.js";
import type {
  WooCommerceStatus,
  WooOrder,
  WordPressCapabilities,
  WordPressComment,
  WordPressContentCounts,
  WordPressRecentPost,
  WordPressSiteHealth,
  WordPressUpdateCounts,
  WpComment,
  WpDiscovery,
  WpError,
  WpMedia,
  WpPlugin,
  WpPost,
  WpTheme,
  WpUser,
} from "./types.js";

export interface WordPressClientConfig {
  connectionId: string;
  /** Site address, with or without a trailing slash. May be http on a LAN. */
  siteUrl: string;
  /** WordPress username the application password belongs to. */
  username?: string;
  /** The application password, spaces and all — WordPress accepts either form. */
  applicationPassword?: string;
  /** Optional JWT. When present it is used instead of Basic auth. */
  jwt?: string;
  /** Set true only when the user ticked "this site is on my own network". */
  allowLocalNetwork?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onLog?: (entry: HttpLogEntry) => void;
}

/** Marker the optional Nexus connector plugin adds to `/wp-json/` namespaces. */
export const NEXUS_CONNECTOR_NAMESPACE = "nexus/v1";

export class WordPressClient {
  private readonly http: HttpClient;
  private readonly config: WordPressClientConfig;
  private readonly base: string;
  private readonly nowMs: () => number;
  private discovery: WpDiscovery | null = null;
  /** Set once the first request proves whether pretty permalinks are on. */
  private routeStyle: "pretty" | "query" | null = null;

  constructor(config: WordPressClientConfig) {
    this.config = config;
    this.base = normaliseSiteUrl(config.siteUrl);
    this.nowMs = config.now ?? (() => Date.now());
    this.http = new HttpClient({
      service: "WordPress",
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.now ? { now: config.now } : {}),
      ...(config.sleep ? { sleep: config.sleep } : {}),
      ...(config.random ? { random: config.random } : {}),
      defaultTimeoutMs: config.timeoutMs ?? 12_000,
      defaultMaxAttempts: config.maxAttempts ?? 3,
      ...(config.onLog ? { onLog: config.onLog } : {}),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Connection                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Tells apart, precisely:
   *   wrong address        — nothing WordPress-shaped answered
   *   REST disabled        — the site answered but the API is switched off
   *   bad credentials      — the API answered but rejected the login
   *   missing permission   — logged in, but the role cannot read what we need
   *   connected            — with the facts the Connections screen shows
   */
  async testConnection(): Promise<ConnectionState> {
    const checkedAt = new Date(this.nowMs()).toISOString();

    if (!this.base) {
      return notConfigured("No website address has been saved yet.", "Enter your site's address, for example https://example.com.", checkedAt);
    }
    const policy = validateLocalServiceUrl(this.base);
    if (!policy.ok) {
      return { kind: "blocked", ok: false, message: policy.message, nextStep: policy.nextStep, checkedAt };
    }
    if (policy.url.protocol === "http:" && !this.config.allowLocalNetwork) {
      return {
        kind: "blocked",
        ok: false,
        message: "That address uses http, so your password would travel unencrypted.",
        nextStep: "Tick “this site is on my own network” if it is, or use the https:// address.",
        checkedAt,
      };
    }
    if (!this.config.jwt && (!this.config.username || !this.config.applicationPassword)) {
      return notConfigured(
        "No WordPress username and application password have been saved yet.",
        "In WordPress go to Users › Profile › Application Passwords, create one named “Nexus”, and paste it here with your username.",
        checkedAt,
      );
    }

    // Step 1: is there a REST API at all? This call is unauthenticated on
    // purpose, so a credential problem cannot be mistaken for a missing API.
    let discovery: WpDiscovery;
    let discoveryResponse: HttpResponse;
    try {
      const result = await this.fetchDiscovery();
      discovery = result.discovery;
      discoveryResponse = result.response;
    } catch (error) {
      if (error instanceof IntegrationError && (error.code === "notFound" || error.code === "badResponse")) {
        return {
          kind: "apiDisabled",
          ok: false,
          message: "That address answered, but its WordPress REST API is switched off or blocked.",
          nextStep: "Ask whoever manages the site to allow /wp-json/ — a security plugin such as Wordfence or a firewall rule is the usual cause.",
          checkedAt,
        };
      }
      if (error instanceof IntegrationError && (error.code === "unreachable" || error.code === "timeout")) {
        return {
          kind: "unreachable",
          ok: false,
          message: "Nexus could not reach that address at all.",
          nextStep: "Check the address is right and the site is online. If it is on your own network, make sure this Mac is on the same network.",
          checkedAt,
        };
      }
      return connectionStateFromError(error, checkedAt);
    }

    if (!discovery.namespaces || !discovery.namespaces.some((namespace) => namespace.startsWith("wp/v"))) {
      return {
        kind: "wrongAddress",
        ok: false,
        message: "Something answered at that address, but it is not a WordPress site.",
        nextStep: "Check the address. If WordPress is in a subfolder, include it — for example https://example.com/blog.",
        checkedAt,
      };
    }
    this.discovery = discovery;

    // Step 2: do the saved credentials work?
    try {
      const { data: user, response } = await this.get<WpUser>("wp/v2/users/me", { context: "edit" });
      const capabilities = capabilityList(user);
      const missing: string[] = [];
      if (!capabilities.includes("edit_posts")) missing.push("author or editor access");

      return connected(`${discovery.name ?? this.base} (${user.name ?? "unknown user"})`, {
        grantedScopes: (user.roles ?? []).slice(),
        missingScopes: missing,
        latencyMs: response.durationMs + discoveryResponse.durationMs,
        checkedAt,
        facts: {
          siteName: discovery.name ?? "",
          restRoute: this.routeStyle ?? "pretty",
          wooCommerce: (discovery.namespaces ?? []).some(isWooNamespace),
          nexusConnector: (discovery.namespaces ?? []).includes(NEXUS_CONNECTOR_NAMESPACE),
          canReadPlugins: capabilities.includes("activate_plugins") || capabilities.includes("update_plugins"),
          canModerateComments: capabilities.includes("moderate_comments"),
        },
      });
    } catch (error) {
      if (error instanceof IntegrationError && error.code === "invalidCredentials") {
        return {
          kind: "invalidCredentials",
          ok: false,
          message: "WordPress did not accept that username and application password.",
          nextStep: "Check the username is exactly right, then create a fresh application password under Users › Profile › Application Passwords and paste it in again.",
          checkedAt,
        };
      }
      if (error instanceof IntegrationError && error.code === "insufficientPermission") {
        return {
          kind: "insufficientPermission",
          ok: false,
          message: "Those credentials work, but that account is not allowed to read the site's content over the API.",
          nextStep: "Use an account with at least the Editor role, or ask an administrator to raise this account's role.",
          checkedAt,
        };
      }
      return connectionStateFromError(error, checkedAt);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Discovery                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Reads `/wp-json/`, falling back to `/?rest_route=/` for sites without
   * pretty permalinks. Remembers which style worked for later calls.
   */
  async fetchDiscovery(): Promise<{ discovery: WpDiscovery; response: HttpResponse }> {
    const attempts: Array<{ style: "pretty" | "query"; url: string }> = [
      { style: "pretty", url: `${this.base}/wp-json/` },
      { style: "query", url: `${this.base}/?rest_route=/` },
    ];
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        const { data, response } = await this.http.json<WpDiscovery>(attempt.url, {
          headers: this.headers(),
          allowLocalService: true,
          maxAttempts: 2,
        });
        if (!data || typeof data !== "object" || (!data.namespaces && !data.name)) {
          lastError = new IntegrationError("WordPress", "badResponse", "That address answered, but not with WordPress API information.", "Check the address points at your WordPress site.");
          continue;
        }
        this.routeStyle = attempt.style;
        return { discovery: data, response };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof IntegrationError
      ? lastError
      : new IntegrationError("WordPress", "notFound", "No WordPress REST API answered at that address.", "Check the address, and that /wp-json/ is not blocked by a security plugin.");
  }

  /** What this site and this credential can actually do. Never assumed. */
  async fetchCapabilities(): Promise<WordPressCapabilities> {
    const { discovery } = this.discovery ? { discovery: this.discovery } : await this.fetchDiscovery();
    this.discovery = discovery;
    const namespaces = discovery.namespaces ?? [];

    let userCapabilities: string[] = [];
    try {
      const { data } = await this.get<WpUser>("wp/v2/users/me", { context: "edit" });
      userCapabilities = capabilityList(data);
    } catch {
      // A site can hide /users/me; that is a smaller answer, not a failure.
      userCapabilities = [];
    }

    return {
      namespaces,
      wooCommerce: namespaces.some(isWooNamespace),
      nexusConnector: namespaces.includes(NEXUS_CONNECTOR_NAMESPACE),
      userCapabilities,
      canReadPlugins: userCapabilities.includes("activate_plugins") || userCapabilities.includes("update_plugins"),
      canReadSiteHealth: userCapabilities.includes("view_site_health_checks") || userCapabilities.includes("manage_options"),
      canModerateComments: userCapabilities.includes("moderate_comments"),
      siteName: discovery.name ?? "",
      siteUrl: discovery.url ?? discovery.home ?? this.base,
      fetchedAt: new Date(this.nowMs()).toISOString(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Content                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Counts come from the `X-WP-Total` header of a `per_page=1` query, which is
   * one cheap request per count rather than downloading every post.
   */
  async fetchContentCounts(): Promise<WordPressContentCounts> {
    const unavailable: WordPressContentCounts["unavailable"] = [];
    const count = async (what: string, path: string, query: Record<string, string | number>): Promise<number> => {
      try {
        return await this.total(path, query);
      } catch (error) {
        unavailable.push({
          what,
          reason: error instanceof IntegrationError ? error.message : "That information could not be read.",
          nextStep: error instanceof IntegrationError ? error.nextStep : "Check the connection in Settings › Connections.",
        });
        return 0;
      }
    };

    const [publishedPosts, draftPosts, pendingPosts, scheduledPosts, publishedPages, draftPages, mediaItems, pendingComments, spamComments] = await Promise.all([
      count("published posts", "wp/v2/posts", { status: "publish", per_page: 1 }),
      count("draft posts", "wp/v2/posts", { status: "draft", per_page: 1 }),
      count("posts awaiting review", "wp/v2/posts", { status: "pending", per_page: 1 }),
      count("scheduled posts", "wp/v2/posts", { status: "future", per_page: 1 }),
      count("published pages", "wp/v2/pages", { status: "publish", per_page: 1 }),
      count("draft pages", "wp/v2/pages", { status: "draft", per_page: 1 }),
      count("media items", "wp/v2/media", { per_page: 1 }),
      count("comments awaiting moderation", "wp/v2/comments", { status: "hold", per_page: 1 }),
      count("spam comments", "wp/v2/comments", { status: "spam", per_page: 1 }),
    ]);

    return {
      publishedPosts, draftPosts, pendingPosts, scheduledPosts,
      publishedPages, draftPages, mediaItems, pendingComments, spamComments,
      fetchedAt: new Date(this.nowMs()).toISOString(),
      unavailable,
    };
  }

  async fetchRecentPosts(options: { limit?: number; status?: string } = {}): Promise<Fetched<WordPressRecentPost[]>> {
    const { data } = await this.get<WpPost[]>("wp/v2/posts", {
      per_page: Math.min(50, Math.max(1, options.limit ?? 10)),
      status: options.status ?? "publish",
      orderby: "date",
      order: "desc",
      _fields: "id,date_gmt,modified_gmt,status,link,title",
    });
    const posts = Array.isArray(data) ? data : [];
    return {
      data: posts.map((post) => ({
        id: String(post.id ?? ""),
        title: decodeEntities(stripTags(post.title?.rendered ?? "")) || "(no title)",
        status: post.status ?? "unknown",
        link: post.link ?? "",
        publishedAt: post.date_gmt ? toIso(`${post.date_gmt}Z`.replace(/Z+$/, "Z")) : "",
        modifiedAt: post.modified_gmt ? toIso(`${post.modified_gmt}Z`.replace(/Z+$/, "Z")) : "",
      })),
      fetchedAt: new Date(this.nowMs()).toISOString(),
      fromCache: false,
    };
  }

  async fetchDrafts(limit = 10): Promise<Fetched<WordPressRecentPost[]>> {
    return this.fetchRecentPosts({ limit, status: "draft" });
  }

  async fetchPages(limit = 20): Promise<Fetched<WordPressRecentPost[]>> {
    const { data } = await this.get<WpPost[]>("wp/v2/pages", {
      per_page: Math.min(100, Math.max(1, limit)),
      orderby: "modified",
      order: "desc",
      _fields: "id,date_gmt,modified_gmt,status,link,title",
    });
    const pages = Array.isArray(data) ? data : [];
    return {
      data: pages.map((page) => ({
        id: String(page.id ?? ""),
        title: decodeEntities(stripTags(page.title?.rendered ?? "")) || "(no title)",
        status: page.status ?? "unknown",
        link: page.link ?? "",
        publishedAt: page.date_gmt ?? "",
        modifiedAt: page.modified_gmt ?? "",
      })),
      fetchedAt: new Date(this.nowMs()).toISOString(),
      fromCache: false,
    };
  }

  async fetchComments(options: { status?: string; limit?: number } = {}): Promise<Fetched<WordPressComment[]>> {
    const { data } = await this.get<WpComment[]>("wp/v2/comments", {
      status: options.status ?? "hold",
      per_page: Math.min(50, Math.max(1, options.limit ?? 10)),
      orderby: "date_gmt",
      order: "desc",
    });
    const comments = Array.isArray(data) ? data : [];
    return {
      data: comments.map((comment) => ({
        id: String(comment.id ?? ""),
        postId: String(comment.post ?? ""),
        authorName: decodeEntities(comment.author_name ?? "Someone"),
        excerpt: decodeEntities(stripTags(comment.content?.rendered ?? "")).slice(0, 240),
        status: comment.status ?? "unknown",
        link: comment.link ?? "",
        postedAt: comment.date_gmt ?? "",
      })),
      fetchedAt: new Date(this.nowMs()).toISOString(),
      fromCache: false,
    };
  }

  async fetchMedia(limit = 12): Promise<Fetched<Array<{ id: string; title: string; url: string; mimeType: string; width: number; height: number }>>> {
    const { data } = await this.get<WpMedia[]>("wp/v2/media", {
      per_page: Math.min(50, Math.max(1, limit)),
      orderby: "date",
      order: "desc",
      media_type: "image",
    });
    const media = Array.isArray(data) ? data : [];
    return {
      data: media.map((item) => ({
        id: String(item.id ?? ""),
        title: decodeEntities(stripTags(item.title?.rendered ?? "")),
        url: item.source_url ?? "",
        mimeType: item.mime_type ?? "",
        width: item.media_details?.width ?? 0,
        height: item.media_details?.height ?? 0,
      })),
      fetchedAt: new Date(this.nowMs()).toISOString(),
      fromCache: false,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Maintenance                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Plugin and theme update counts. `wp/v2/plugins` needs `activate_plugins`,
   * which an Editor does not have — in that case the result says "not
   * permitted", never "0 updates", because a false all-clear is worse than a
   * blank.
   */
  async fetchUpdateCounts(): Promise<WordPressUpdateCounts> {
    const fetchedAt = new Date(this.nowMs()).toISOString();
    try {
      const [pluginsResult, themesResult] = await Promise.all([
        this.get<WpPlugin[]>("wp/v2/plugins", { context: "edit" }),
        this.get<WpTheme[]>("wp/v2/themes", { context: "edit" }).catch(() => ({ data: [] as WpTheme[] })),
      ]);
      const plugins = Array.isArray(pluginsResult.data) ? pluginsResult.data : [];
      const themes = Array.isArray(themesResult.data) ? themesResult.data : [];
      const pluginNames = plugins.filter((plugin) => plugin.update?.new_version).map((plugin) => plugin.name ?? plugin.plugin ?? "a plugin");
      const themeNames = themes.filter((theme) => theme.update?.new_version).map((theme) => theme.name?.rendered ?? theme.stylesheet ?? "a theme");
      return { plugins: pluginNames.length, themes: themeNames.length, pluginNames, themeNames, fetchedAt, permissionDenied: false };
    } catch (error) {
      if (error instanceof IntegrationError && (error.code === "insufficientPermission" || error.code === "invalidCredentials" || error.code === "notFound")) {
        return { plugins: 0, themes: 0, pluginNames: [], themeNames: [], fetchedAt, permissionDenied: true };
      }
      throw error;
    }
  }

  /**
   * Site health. Core exposes `wp-site-health/v1` from WordPress 5.6, but only
   * to users with `view_site_health_checks`; when it is unavailable we still
   * report the two facts we can prove ourselves (HTTPS and a working REST API).
   */
  async fetchSiteHealth(): Promise<WordPressSiteHealth> {
    const fetchedAt = new Date(this.nowMs()).toISOString();
    const httpsEnabled = this.base.startsWith("https://");
    const issues: WordPressSiteHealth["issues"] = [];
    if (!httpsEnabled) {
      issues.push({
        label: "The site is not using HTTPS",
        severity: "critical",
        description: "Visitors' connections to this site are not encrypted.",
      });
    }

    let version = "";
    let status: WordPressSiteHealth["status"] = httpsEnabled ? "good" : "critical";
    try {
      const { data } = await this.get<Record<string, unknown>>("wp-site-health/v1/tests/background-updates", {});
      const testStatus = typeof data.status === "string" ? data.status : "";
      const label = typeof data.label === "string" ? data.label : "Background updates";
      if (testStatus === "critical" || testStatus === "recommended") {
        issues.push({ label, severity: testStatus, description: stripTags(String(data.description ?? "")) });
      }
    } catch {
      // Not permitted or not present — reported through `status: "unknown"` below.
      status = httpsEnabled ? "unknown" : "critical";
    }

    try {
      const { discovery } = this.discovery ? { discovery: this.discovery } : await this.fetchDiscovery();
      version = typeof discovery.description === "string" ? "" : "";
    } catch {
      version = "";
    }

    if (issues.some((issue) => issue.severity === "critical")) status = "critical";
    else if (issues.length > 0 && status !== "unknown") status = "recommended";

    return { status, issues, httpsEnabled, restApiWorking: true, wordpressVersion: version, fetchedAt };
  }

  /* ------------------------------------------------------------------ */
  /* WooCommerce (detected, never assumed)                               */
  /* ------------------------------------------------------------------ */

  async detectWooCommerce(): Promise<boolean> {
    const capabilities = await this.fetchCapabilities();
    return capabilities.wooCommerce;
  }

  /**
   * WooCommerce orders and revenue for a window, but only if WooCommerce is
   * actually installed *and* the credential may read it. Returns a discriminated
   * result rather than throwing, because "no shop here" is a normal answer.
   */
  async fetchWooCommerceSummary(window: { start: Date | string; end: Date | string }): Promise<WooCommerceStatus> {
    const fetchedAt = new Date(this.nowMs()).toISOString();
    if (!(await this.detectWooCommerce())) {
      return {
        installed: false,
        reason: "notDetected",
        message: "WooCommerce is not installed on this site.",
        nextStep: "Install and activate WooCommerce if you want shop figures here, or hide this widget.",
        fetchedAt,
      };
    }

    try {
      const { data } = await this.get<WooOrder[]>("wc/v3/orders", {
        after: toIso(window.start),
        before: toIso(window.end),
        per_page: 100,
        status: "processing,completed",
      });
      const orders = Array.isArray(data) ? data : [];
      const currency = (orders.find((order) => order.currency)?.currency ?? "").toUpperCase();
      const revenueMinor = orders.reduce((sum, order) => sum + toMinorUnits(order.total, currency), 0);
      return {
        installed: true,
        currency,
        orderCount: orders.length,
        revenueMinor,
        averageOrderValueMinor: orders.length === 0 ? 0 : Math.round(revenueMinor / orders.length),
        windowStart: toIso(window.start),
        windowEnd: toIso(window.end),
        fetchedAt,
      };
    } catch (error) {
      if (error instanceof IntegrationError && (error.code === "insufficientPermission" || error.code === "invalidCredentials")) {
        return {
          installed: false,
          reason: "noPermission",
          message: "WooCommerce is installed, but this account cannot read its orders.",
          nextStep: "Use an account with the Shop Manager or Administrator role, or create WooCommerce API keys for Nexus.",
          fetchedAt,
        };
      }
      throw error;
    }
  }

  /** Everything above, shaped as `MetricSnapshot` rows for the widget cache. */
  async fetchMetrics(window: { start: Date | string; end: Date | string }): Promise<MetricSnapshotInput[]> {
    const counts = await this.fetchContentCounts();
    const updates = await this.fetchUpdateCounts();
    const rows: MetricSnapshotInput[] = [
      metric(this.config.connectionId, "wordpress.posts.published", window, counts.fetchedAt, counts.publishedPosts),
      metric(this.config.connectionId, "wordpress.posts.draft", window, counts.fetchedAt, counts.draftPosts),
      metric(this.config.connectionId, "wordpress.pages.published", window, counts.fetchedAt, counts.publishedPages),
      metric(this.config.connectionId, "wordpress.comments.pending", window, counts.fetchedAt, counts.pendingComments),
      metric(this.config.connectionId, "wordpress.media.items", window, counts.fetchedAt, counts.mediaItems),
    ];
    if (!updates.permissionDenied) {
      rows.push(metric(this.config.connectionId, "wordpress.updates.plugins", window, updates.fetchedAt, updates.plugins));
      rows.push(metric(this.config.connectionId, "wordpress.updates.themes", window, updates.fetchedAt, updates.themes));
    }
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  /** Builds a REST URL in whichever route style this site supports. */
  restUrl(path: string, query: Record<string, string | number | undefined> = {}): string {
    const clean = path.replace(/^\/+/, "");
    if (this.routeStyle === "query") {
      const url = new URL(this.base);
      url.searchParams.set("rest_route", `/${clean}`);
      for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
      return url.toString();
    }
    const url = new URL(`${this.base}/wp-json/${clean}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    return url.toString();
  }

  private async get<T>(path: string, query: Record<string, string | number | undefined>): Promise<{ data: T; response: HttpResponse }> {
    const response = await this.http.request(this.restUrl(path, query), {
      headers: this.headers(),
      allowLocalService: true,
    });
    return { data: parseWpJson<T>(response.body), response };
  }

  /** Reads `X-WP-Total`, falling back to counting the returned array. */
  private async total(path: string, query: Record<string, string | number>): Promise<number> {
    const response = await this.http.request(this.restUrl(path, { ...query, _fields: "id" }), {
      headers: this.headers(),
      allowLocalService: true,
    });
    const header = response.headers.get("x-wp-total");
    if (header !== null && Number.isFinite(Number(header))) return Number(header);
    const parsed = parseWpJson<unknown>(response.body);
    return Array.isArray(parsed) ? parsed.length : 0;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "NexusOS/0.1 (+https://nexus.os)",
    };
    if (this.config.jwt) {
      headers.authorization = `Bearer ${this.config.jwt}`;
    } else if (this.config.username && this.config.applicationPassword) {
      // WordPress accepts the password with or without its display spaces.
      const credential = `${this.config.username}:${this.config.applicationPassword.replace(/\s+/g, "")}`;
      headers.authorization = `Basic ${Buffer.from(credential, "utf8").toString("base64")}`;
    }
    return headers;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function normaliseSiteUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function metric(connectionId: string, name: string, window: { start: Date | string; end: Date | string }, fetchedAt: string, value: number): MetricSnapshotInput {
  return metricSnapshot(connectionId, name, window, fetchedAt, { valueMinor: value, valueText: String(value) });
}

/** WordPress returns errors with a 200 in a few plugin-mangled setups. */
function parseWpJson<T>(body: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new IntegrationError("WordPress", "badResponse", "The site replied with a page instead of API data.", "A caching or security plugin is probably intercepting /wp-json/. Ask whoever manages the site to allow it.");
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "code" in parsed && "message" in parsed) {
    throw errorForWpCode(parsed as WpError);
  }
  return parsed as T;
}

/** Maps WordPress's own error codes, which are more precise than the status. */
export function errorForWpCode(error: WpError): IntegrationError {
  const code = error.code ?? "";
  const status = error.data?.status;
  const message = stripTags(error.message ?? "");
  switch (code) {
    case "rest_disabled":
    case "rest_no_route":
      return new IntegrationError("WordPress", "notFound", "That part of the WordPress API is switched off or missing.", "Ask whoever manages the site to enable the REST API, or update WordPress.", { ...(status === undefined ? {} : { status }) });
    case "rest_not_logged_in":
    case "incorrect_password":
    case "invalid_username":
    case "rest_cannot_access":
      return new IntegrationError("WordPress", "invalidCredentials", "WordPress did not accept the saved username and application password.", "Create a new application password under Users › Profile and paste it in again.", { ...(status === undefined ? {} : { status }) });
    case "rest_forbidden":
    case "rest_forbidden_context":
    case "rest_cannot_view":
    case "rest_cannot_manage_plugins":
    case "rest_user_cannot_view":
      return new IntegrationError("WordPress", "insufficientPermission", "That account is not allowed to read this information.", "Use an account with a higher role, or ask an administrator to grant it.", { ...(status === undefined ? {} : { status }) });
    case "application_passwords_disabled":
      return new IntegrationError("WordPress", "insufficientPermission", "Application passwords are switched off on this site.", "Ask whoever manages the site to enable application passwords, or use a JWT plugin instead.", { ...(status === undefined ? {} : { status }) });
    default:
      return new IntegrationError("WordPress", "badResponse", message || "WordPress reported a problem.", "Check the connection in Settings › Connections, then try again.", { ...(status === undefined ? {} : { status }), detail: code });
  }
}

function capabilityList(user: WpUser): string[] {
  const capabilities = { ...(user.capabilities ?? {}), ...(user.extra_capabilities ?? {}) };
  return Object.entries(capabilities)
    .filter(([, granted]) => granted === true)
    .map(([name]) => name);
}

function isWooNamespace(namespace: string): boolean {
  return namespace === "wc/v3" || namespace === "wc/v2" || namespace.startsWith("wc/");
}

/** WordPress renders titles with markup and entities; widgets want plain text. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'", "#8217": "’", "#8216": "‘", "#8211": "–", "#8212": "—", hellip: "…" };
  return text.replace(/&(#?\w+);/g, (whole, entity: string) => {
    const direct = named[entity];
    if (direct) return direct;
    if (entity.startsWith("#")) {
      const code = Number(entity.slice(1));
      if (Number.isFinite(code) && code > 0 && code < 0x10ffff) return String.fromCodePoint(code);
    }
    return whole;
  });
}
