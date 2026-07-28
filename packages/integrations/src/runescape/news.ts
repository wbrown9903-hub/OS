/**
 * Official RuneScape and Old School RuneScape news.
 *
 * Rules this module exists to enforce:
 *  - only the **official** Jagex feed is ever fetched. There is no scraping, no
 *    unofficial mirror, no authenticated page, and no scraping of the website
 *    HTML — only the feed Jagex publishes for this purpose;
 *  - a markup change can never throw (see `feed.ts`);
 *  - an image is validated by sniffing its real bytes before it is cached, and
 *    it is stored with its source URL and attribution so the UI can credit it;
 *  - HTTP cache headers are honoured, so polling is cheap and polite;
 *  - when there is no usable banner the fallback chain runs in a fixed order:
 *      (1) the banner the user set manually,
 *      (2) built-in original Nexus artwork.
 *    There is no step that borrows an image from somewhere else.
 */

import { HttpClient, type FetchLike, type HttpLogEntry } from "../core/http.js";
import { IntegrationError } from "../core/errors.js";
import { type CacheStore, MemoryCacheStore, conditionalHeaders, isFresh, readCacheDirectives } from "../core/cache.js";
import type { Fetched } from "../core/types.js";
import { sniffImage, validateOutboundUrl } from "../security-port.js";
import { parseFeed, type FeedItem, type FeedParseResult } from "./feed.js";
import { builtInArtworkFor, type BuiltInArtwork } from "./artwork.js";

export type RuneScapeGame = "runescape" | "osrs";

/**
 * The official feeds, as published by Jagex. These are the only addresses this
 * module will fetch; a caller may override them (for a locale-specific official
 * feed) but the override still goes through the https-only URL policy and must
 * be on a jagex-operated host.
 */
export const OFFICIAL_FEEDS: Record<RuneScapeGame, string> = {
  runescape: "https://secure.runescape.com/m=news/latest_news.rss",
  osrs: "https://secure.runescape.com/m=news/latest_news.rss?oldschool=true",
};

/** Hosts Jagex operates. An override outside this list is refused. */
export const OFFICIAL_HOSTS = [
  "secure.runescape.com",
  "www.runescape.com",
  "runescape.com",
  "oldschool.runescape.com",
  "services.runescape.com",
  "www.jagex.com",
  "jagex.com",
];

export interface NewsArticle {
  id: string;
  game: RuneScapeGame;
  title: string;
  /** Official article link, or "" if the feed omitted it. */
  link: string;
  publishedAt: string;
  summary: string;
  category: string;
  /** The validated banner for this article, or null. */
  image: NewsImage | null;
}

export interface NewsImage {
  /** Where Nexus stores or serves it from. For a cached remote image this is the original URL. */
  url: string;
  /** The URL it was fetched from, kept for attribution and re-fetching. */
  sourceUrl: string;
  mimeType: string;
  byteSize: number;
  attribution: string;
  alt: string;
}

export type BannerSource = "feed" | "manual" | "builtIn";

export interface ResolvedBanner {
  source: BannerSource;
  /** A URL or data URI the UI can render directly. */
  url: string;
  alt: string;
  attribution: string;
  /** Why the earlier steps of the chain did not apply. Shown in diagnostics. */
  reason: string;
}

export interface NewsResult {
  game: RuneScapeGame;
  articles: NewsArticle[];
  banner: ResolvedBanner;
  /** Parser notes — a markup change shows up here before it breaks anything. */
  warnings: string[];
  fetchedAt: string;
  fromCache: boolean;
  /** Set when the whole fetch failed and cached/fallback content is showing. */
  degraded: { reason: string; nextStep: string } | null;
}

export interface RuneScapeNewsOptions {
  game: RuneScapeGame;
  /** Override the official feed URL. Must still be an official Jagex host. */
  feedUrl?: string;
  maxItems?: number;
  /** Largest banner Nexus will download and cache. */
  maxImageBytes?: number;
  /** The banner the user chose by hand, step (1) of the fallback chain. */
  manualBanner?: { url: string; alt?: string; attribution?: string } | null;
  /** Whether to download and validate feed images at all. */
  fetchImages?: boolean;
  cache?: CacheStore<CachedFeed>;
  imageCache?: CacheStore<NewsImage>;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onLog?: (entry: HttpLogEntry) => void;
}

/** What is kept between polls. */
export interface CachedFeed {
  articles: NewsArticle[];
  warnings: string[];
  channelTitle: string;
}

export class RuneScapeNewsService {
  private readonly http: HttpClient;
  private readonly options: RuneScapeNewsOptions;
  private readonly cache: CacheStore<CachedFeed>;
  private readonly imageCache: CacheStore<NewsImage>;
  private readonly nowMs: () => number;
  private readonly feedUrl: string;

  constructor(options: RuneScapeNewsOptions) {
    this.options = options;
    this.nowMs = options.now ?? (() => Date.now());
    this.cache = options.cache ?? new MemoryCacheStore<CachedFeed>();
    this.imageCache = options.imageCache ?? new MemoryCacheStore<NewsImage>();
    this.feedUrl = resolveFeedUrl(options.game, options.feedUrl);
    this.http = new HttpClient({
      service: "RuneScape news",
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
      ...(options.random ? { random: options.random } : {}),
      defaultTimeoutMs: 10_000,
      defaultMaxAttempts: 3,
      ...(options.onLog ? { onLog: options.onLog } : {}),
    });
  }

  /**
   * Fetches the news, honouring the cache. Never throws: a failure returns the
   * last good copy (or nothing) with `degraded` explaining what happened.
   */
  async fetchNews(): Promise<NewsResult> {
    const cacheKey = `runescape:news:${this.options.game}:${this.feedUrl}`;
    const cached = await this.cache.get(cacheKey);
    const now = new Date(this.nowMs());

    if (isFresh(cached, now) && cached) {
      return this.assemble(cached.value.articles, cached.value.warnings, cached.storedAt, true, null);
    }

    try {
      const response = await this.http.request(this.feedUrl, {
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/json;q=0.9, text/xml;q=0.8",
          "user-agent": "NexusOS/0.1 (+https://nexus.os)",
          ...conditionalHeaders(cached),
        },
        maxAttempts: 3,
      });

      // 304: the feed has not changed. Re-stamp the cache and reuse it.
      if (response.notModified && cached) {
        const directives = readCacheDirectives(response.headers, now);
        await this.cache.set(cacheKey, {
          ...cached,
          storedAt: cached.storedAt,
          ...(directives.expiresAt ? { expiresAt: directives.expiresAt } : {}),
        });
        return this.assemble(cached.value.articles, cached.value.warnings, cached.storedAt, true, null);
      }

      const parsed: FeedParseResult = parseFeed(response.body, { maxItems: this.options.maxItems ?? 12 });
      if (parsed.items.length === 0 && cached) {
        // Markup changed and we got nothing usable — keep showing the last good copy.
        return this.assemble(cached.value.articles, [...cached.value.warnings, ...parsed.warnings], cached.storedAt, true, {
          reason: "The official news feed could not be read this time, so the last copy is showing.",
          nextStep: "Nothing to do — Nexus will try again on the next refresh.",
        });
      }

      const articles = await this.buildArticles(parsed.items);
      const fetchedAt = now.toISOString();
      const directives = readCacheDirectives(response.headers, now);
      if (!directives.noStore) {
        await this.cache.set(cacheKey, {
          value: { articles, warnings: parsed.warnings, channelTitle: parsed.channelTitle },
          storedAt: fetchedAt,
          sourceUrl: this.feedUrl,
          attribution: "Jagex Ltd — official RuneScape news",
          ...(directives.etag ? { etag: directives.etag } : {}),
          ...(directives.lastModified ? { lastModified: directives.lastModified } : {}),
          // Never poll harder than every 10 minutes, whatever the feed says.
          expiresAt: directives.expiresAt ?? new Date(now.getTime() + 600_000).toISOString(),
        });
      }
      return this.assemble(articles, parsed.warnings, fetchedAt, false, null);
    } catch (error) {
      const message = error instanceof IntegrationError ? error.message : "The official news feed could not be reached.";
      const nextStep = error instanceof IntegrationError ? error.nextStep : "Check your internet connection; Nexus will try again automatically.";
      if (cached) {
        return this.assemble(cached.value.articles, cached.value.warnings, cached.storedAt, true, { reason: message, nextStep });
      }
      return this.assemble([], [], now.toISOString(), false, { reason: message, nextStep });
    }
  }

  /**
   * The fallback chain, in the fixed order (a) feed image, (b) manual banner,
   * (c) built-in original artwork. Exposed separately so the widget can resolve
   * a banner without re-fetching.
   */
  resolveBanner(articles: NewsArticle[]): ResolvedBanner {
    const fromFeed = articles.find((article) => article.image !== null)?.image;
    if (fromFeed) {
      return {
        source: "feed",
        url: fromFeed.url,
        alt: fromFeed.alt,
        attribution: fromFeed.attribution,
        reason: "Using the image from the official news feed.",
      };
    }

    const manual = this.options.manualBanner;
    if (manual?.url) {
      const check = validateOutboundUrl(manual.url);
      if (check.ok) {
        return {
          source: "manual",
          url: check.url.toString(),
          alt: manual.alt ?? "Banner chosen by you",
          attribution: manual.attribution ?? "Chosen by you",
          reason: "The news feed had no usable image, so your own banner is showing.",
        };
      }
    }

    const artwork: BuiltInArtwork = builtInArtworkFor(this.options.game);
    return {
      source: "builtIn",
      url: artwork.dataUri,
      alt: artwork.alt,
      attribution: artwork.attribution,
      reason: manual?.url
        ? "The news feed had no usable image and your banner address could not be used, so Nexus artwork is showing."
        : "The news feed had no usable image and no banner is set, so Nexus artwork is showing.",
    };
  }

  private assemble(
    articles: NewsArticle[],
    warnings: string[],
    fetchedAt: string,
    fromCache: boolean,
    degraded: NewsResult["degraded"],
  ): NewsResult {
    return {
      game: this.options.game,
      articles,
      banner: this.resolveBanner(articles),
      warnings,
      fetchedAt,
      fromCache,
      degraded,
    };
  }

  private async buildArticles(items: FeedItem[]): Promise<NewsArticle[]> {
    const articles: NewsArticle[] = [];
    for (const item of items) {
      const image = this.options.fetchImages === false ? null : await this.resolveImage(item.imageUrl);
      articles.push({
        id: item.id,
        game: this.options.game,
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        summary: item.summary,
        category: item.category,
        image,
      });
    }
    return articles;
  }

  /**
   * Downloads a feed image, sniffs its real bytes, enforces a size limit and
   * caches it with its source and attribution. Anything that fails returns
   * null, which sends the caller down the fallback chain.
   */
  async resolveImage(imageUrl: string): Promise<NewsImage | null> {
    if (!imageUrl) return null;
    const policy = validateOutboundUrl(imageUrl);
    if (!policy.ok) return null;

    const key = `runescape:image:${policy.url.toString()}`;
    const cached = await this.imageCache.get(key);
    if (isFresh(cached, new Date(this.nowMs())) && cached) return cached.value;

    const maxBytes = this.options.maxImageBytes ?? 2 * 1024 * 1024;
    try {
      const response = await this.http.request(policy.url.toString(), {
        headers: { accept: "image/*", "user-agent": "NexusOS/0.1 (+https://nexus.os)" },
        maxAttempts: 2,
        timeoutMs: 8000,
      });
      // `body` is text; convert with latin1 so every byte survives round-tripping.
      const bytes = Buffer.from(response.body, "latin1");
      const sniff = sniffImage(bytes, { maxBytes });
      if (!sniff.ok) return null;

      const image: NewsImage = {
        url: policy.url.toString(),
        sourceUrl: policy.url.toString(),
        mimeType: sniff.mimeType,
        byteSize: sniff.byteSize,
        attribution: `Jagex Ltd — ${policy.url.hostname}`,
        alt: "Image from the official RuneScape news feed",
      };
      const directives = readCacheDirectives(response.headers, new Date(this.nowMs()));
      if (!directives.noStore) {
        await this.imageCache.set(key, {
          value: image,
          storedAt: new Date(this.nowMs()).toISOString(),
          sourceUrl: image.sourceUrl,
          attribution: image.attribution,
          ...(directives.etag ? { etag: directives.etag } : {}),
          ...(directives.lastModified ? { lastModified: directives.lastModified } : {}),
          expiresAt: directives.expiresAt ?? new Date(this.nowMs() + 86_400_000).toISOString(),
        });
      }
      return image;
    } catch {
      return null;
    }
  }
}

/**
 * Resolves and guards the feed address. An override must be an official Jagex
 * host — this is the code-level guarantee that Nexus never reads a mirror.
 */
export function resolveFeedUrl(game: RuneScapeGame, override?: string): string {
  if (!override) return OFFICIAL_FEEDS[game];
  const check = validateOutboundUrl(override);
  if (!check.ok) return OFFICIAL_FEEDS[game];
  const host = check.url.hostname.toLowerCase();
  if (!OFFICIAL_HOSTS.includes(host)) return OFFICIAL_FEEDS[game];
  return check.url.toString();
}

/** Convenience wrapper matching the `Fetched<T>` shape widgets consume. */
export async function fetchRuneScapeNews(options: RuneScapeNewsOptions): Promise<Fetched<NewsResult>> {
  const service = new RuneScapeNewsService(options);
  const result = await service.fetchNews();
  return { data: result, fetchedAt: result.fetchedAt, fromCache: result.fromCache };
}
