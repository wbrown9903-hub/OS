/**
 * The subset of the WordPress REST API Nexus reads, plus the Nexus-side shapes.
 *
 * As with Shopify, everything is optional except identifiers: a site may run an
 * old core version, a security plugin may strip fields, and a theme may filter
 * the REST response. A missing field must produce a smaller answer, never an
 * exception.
 */

export interface WpRenderable {
  rendered?: string;
  raw?: string;
  protected?: boolean;
}

export interface WpPost {
  id?: number;
  date_gmt?: string;
  modified_gmt?: string;
  slug?: string;
  status?: string;
  type?: string;
  link?: string;
  title?: WpRenderable;
  excerpt?: WpRenderable;
  author?: number;
  comment_status?: string;
}

export interface WpComment {
  id?: number;
  post?: number;
  author_name?: string;
  date_gmt?: string;
  content?: WpRenderable;
  status?: string;
  link?: string;
}

export interface WpMedia {
  id?: number;
  date_gmt?: string;
  slug?: string;
  media_type?: string;
  mime_type?: string;
  source_url?: string;
  title?: WpRenderable;
  media_details?: { width?: number; height?: number; filesize?: number };
}

export interface WpPlugin {
  plugin?: string;
  status?: string;
  name?: string;
  version?: string;
  /** Present on WordPress 6.5+ when an update is available. */
  update?: { new_version?: string } | null;
  _links?: Record<string, unknown>;
}

export interface WpTheme {
  stylesheet?: string;
  status?: string;
  name?: WpRenderable;
  version?: string;
  update?: { new_version?: string } | null;
}

export interface WpUser {
  id?: number;
  name?: string;
  slug?: string;
  roles?: string[];
  capabilities?: Record<string, boolean>;
  extra_capabilities?: Record<string, boolean>;
}

/** The root `/wp-json/` discovery document. */
export interface WpDiscovery {
  name?: string;
  description?: string;
  url?: string;
  home?: string;
  gmt_offset?: string | number;
  timezone_string?: string;
  namespaces?: string[];
  authentication?: Record<string, unknown>;
  site_logo?: number;
}

/** A WordPress REST error body. */
export interface WpError {
  code?: string;
  message?: string;
  data?: { status?: number; [key: string]: unknown };
}

export interface WooOrder {
  id?: number;
  number?: string;
  status?: string;
  currency?: string;
  total?: string;
  total_tax?: string;
  date_created_gmt?: string;
  date_paid_gmt?: string;
  line_items?: Array<{ quantity?: number; name?: string }>;
  billing?: { city?: string; country?: string };
}

/* -------------------------------------------------------------------------- */
/* Nexus-side shapes                                                           */
/* -------------------------------------------------------------------------- */

export interface WordPressContentCounts {
  publishedPosts: number;
  draftPosts: number;
  pendingPosts: number;
  scheduledPosts: number;
  publishedPages: number;
  draftPages: number;
  mediaItems: number;
  pendingComments: number;
  spamComments: number;
  fetchedAt: string;
  /** Counts we were not allowed to read, so the widget can say so precisely. */
  unavailable: Array<{ what: string; reason: string; nextStep: string }>;
}

export interface WordPressUpdateCounts {
  plugins: number;
  themes: number;
  /** Names, so the widget can list what needs updating rather than a bare number. */
  pluginNames: string[];
  themeNames: string[];
  fetchedAt: string;
  /** True when the credential lacks `update_plugins`, so counts are unknown not zero. */
  permissionDenied: boolean;
}

export interface WordPressSiteHealth {
  /** "good" | "recommended" | "critical" | "unknown". */
  status: "good" | "recommended" | "critical" | "unknown";
  /** Checks that failed, in plain language. */
  issues: Array<{ label: string; severity: "critical" | "recommended"; description: string }>;
  httpsEnabled: boolean;
  restApiWorking: boolean;
  wordpressVersion: string;
  fetchedAt: string;
}

export interface WordPressRecentPost {
  id: string;
  title: string;
  status: string;
  link: string;
  publishedAt: string;
  modifiedAt: string;
}

export interface WordPressComment {
  id: string;
  postId: string;
  authorName: string;
  excerpt: string;
  status: string;
  link: string;
  postedAt: string;
}

export interface WooCommerceSummary {
  installed: true;
  currency: string;
  orderCount: number;
  revenueMinor: number;
  averageOrderValueMinor: number;
  windowStart: string;
  windowEnd: string;
  fetchedAt: string;
}

export type WooCommerceStatus =
  | WooCommerceSummary
  | { installed: false; reason: "notDetected" | "noPermission"; message: string; nextStep: string; fetchedAt: string };

/** What the site told us it can do, discovered rather than assumed. */
export interface WordPressCapabilities {
  /** REST namespaces the site advertises, e.g. ["wp/v2", "wc/v3"]. */
  namespaces: string[];
  wooCommerce: boolean;
  /** True when the optional Nexus connector plugin is installed. */
  nexusConnector: boolean;
  /** Capabilities of the authenticated user, when readable. */
  userCapabilities: string[];
  canReadPlugins: boolean;
  canReadSiteHealth: boolean;
  canModerateComments: boolean;
  siteName: string;
  siteUrl: string;
  fetchedAt: string;
}
