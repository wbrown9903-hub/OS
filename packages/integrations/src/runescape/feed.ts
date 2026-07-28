/**
 * A deliberately forgiving feed parser for the official RuneScape news feeds.
 *
 * DESIGN RULE: **this module can never throw.** Jagex can change their markup
 * at any time and a widget on someone's desktop must not go blank because a tag
 * moved. Every function returns a result object, malformed input produces fewer
 * items plus a warning, and totally unrecognisable input produces zero items
 * plus a warning — which the caller turns into the fallback chain.
 *
 * It handles RSS 2.0, Atom 1.0 and JSON Feed, because the same Jagex endpoint
 * has served more than one of these over the years. There is no XML dependency:
 * a real parser would throw on malformed markup, which is exactly what we are
 * trying to avoid.
 */

export type FeedFormat = "rss" | "atom" | "jsonfeed" | "unknown";

export interface FeedItem {
  /** Stable identifier: guid/id when present, else the link, else the title. */
  id: string;
  title: string;
  /** Absolute https link to the official article. Empty when absent. */
  link: string;
  /** ISO 8601, or "" when the feed gave no usable date. */
  publishedAt: string;
  /** Plain-text summary with markup removed. May be "". */
  summary: string;
  /** Absolute URL of an image the feed offered. Not yet validated. */
  imageUrl: string;
  /** Jagex's own category, e.g. "Game Update". May be "". */
  category: string;
}

export interface FeedParseResult {
  format: FeedFormat;
  items: FeedItem[];
  /** Feed-level title, e.g. "RuneScape News". */
  channelTitle: string;
  /**
   * Human-readable notes about anything unexpected. Surfaced in diagnostics so
   * a markup change is visible before it becomes a support ticket.
   */
  warnings: string[];
}

const EMPTY: FeedParseResult = { format: "unknown", items: [], channelTitle: "", warnings: [] };

/**
 * Parses whatever the feed endpoint returned.
 *
 * @param body Raw response body. May be XML, JSON, an HTML error page, or junk.
 */
export function parseFeed(body: string, options: { maxItems?: number } = {}): FeedParseResult {
  const maxItems = options.maxItems ?? 25;
  try {
    if (typeof body !== "string" || body.trim().length === 0) {
      return { ...EMPTY, warnings: ["The feed was empty."] };
    }
    const trimmed = body.replace(/^﻿/, "").trim();

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseJsonFeed(trimmed, maxItems);
    }
    if (/<entry[\s>]/i.test(trimmed) && /<feed[\s>]/i.test(trimmed)) {
      return parseAtom(trimmed, maxItems);
    }
    if (/<item[\s>]/i.test(trimmed)) {
      return parseRss(trimmed, maxItems);
    }
    if (/<(!doctype\s+html|html)[\s>]/i.test(trimmed)) {
      return { ...EMPTY, warnings: ["The news address returned a web page instead of a news feed."] };
    }
    return { ...EMPTY, warnings: ["The news feed was not in a format Nexus recognises."] };
  } catch (error) {
    // Belt and braces: the contract is "never throws", so even a bug here is a warning.
    return { ...EMPTY, warnings: [`The news feed could not be read (${error instanceof Error ? error.name : "unknown"}).`] };
  }
}

/* -------------------------------------------------------------------------- */
/* RSS                                                                         */
/* -------------------------------------------------------------------------- */

function parseRss(xml: string, maxItems: number): FeedParseResult {
  const warnings: string[] = [];
  const channelTitle = decodeXmlText(firstTag(xml.split(/<item[\s>]/i)[0] ?? xml, "title") ?? "");
  const blocks = blocksFor(xml, "item");
  if (blocks.length === 0) warnings.push("The feed had no news items in it.");

  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, maxItems)) {
    const title = decodeXmlText(firstTag(block, "title") ?? "");
    const link = cleanUrl(firstTag(block, "link") ?? attributeOf(block, "link", "href") ?? "");
    const guid = decodeXmlText(firstTag(block, "guid") ?? "");
    const dateRaw = firstTag(block, "pubDate") ?? firstTag(block, "dc:date") ?? firstTag(block, "date") ?? "";
    const summary = stripMarkup(firstTag(block, "description") ?? firstTag(block, "content:encoded") ?? "");
    const category = decodeXmlText(firstTag(block, "category") ?? "");
    const imageUrl = imageFromBlock(block);

    if (!title && !link) {
      warnings.push("Skipped a news item with no title or link.");
      continue;
    }
    items.push({
      id: guid || link || title,
      title: title || "Untitled",
      link,
      publishedAt: normaliseDate(dateRaw),
      summary,
      imageUrl,
      category,
    });
  }
  if (items.length < blocks.length) warnings.push(`${blocks.length - items.length} item(s) were unreadable and skipped.`);
  return { format: "rss", items, channelTitle, warnings };
}

/* -------------------------------------------------------------------------- */
/* Atom                                                                        */
/* -------------------------------------------------------------------------- */

function parseAtom(xml: string, maxItems: number): FeedParseResult {
  const warnings: string[] = [];
  const channelTitle = decodeXmlText(firstTag(xml.split(/<entry[\s>]/i)[0] ?? xml, "title") ?? "");
  const blocks = blocksFor(xml, "entry");
  if (blocks.length === 0) warnings.push("The feed had no news items in it.");

  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, maxItems)) {
    const title = decodeXmlText(firstTag(block, "title") ?? "");
    // Atom links live in an attribute; prefer rel="alternate", accept the first.
    const link = cleanUrl(
      attributeOf(block, "link", "href", (tag) => /rel\s*=\s*["']?alternate/i.test(tag)) ??
        attributeOf(block, "link", "href") ??
        firstTag(block, "id") ??
        "",
    );
    const id = decodeXmlText(firstTag(block, "id") ?? "");
    const dateRaw = firstTag(block, "published") ?? firstTag(block, "updated") ?? "";
    const summary = stripMarkup(firstTag(block, "summary") ?? firstTag(block, "content") ?? "");
    const category = attributeOf(block, "category", "term") ?? "";

    if (!title && !link) {
      warnings.push("Skipped a news item with no title or link.");
      continue;
    }
    items.push({
      id: id || link || title,
      title: title || "Untitled",
      link,
      publishedAt: normaliseDate(dateRaw),
      summary,
      imageUrl: imageFromBlock(block),
      category,
    });
  }
  return { format: "atom", items, channelTitle, warnings };
}

/* -------------------------------------------------------------------------- */
/* JSON Feed                                                                   */
/* -------------------------------------------------------------------------- */

function parseJsonFeed(json: string, maxItems: number): FeedParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...EMPTY, warnings: ["The news feed looked like data but could not be read."] };
  }

  const root = (Array.isArray(parsed) ? { items: parsed } : parsed) as Record<string, unknown>;
  const rawItems = Array.isArray(root.items) ? root.items : Array.isArray(root.news) ? (root.news as unknown[]) : [];
  if (rawItems.length === 0) {
    return { format: "jsonfeed", items: [], channelTitle: asString(root.title), warnings: ["The feed had no news items in it."] };
  }

  const warnings: string[] = [];
  const items: FeedItem[] = [];
  for (const entry of rawItems.slice(0, maxItems)) {
    if (!entry || typeof entry !== "object") {
      warnings.push("Skipped an unreadable news item.");
      continue;
    }
    const record = entry as Record<string, unknown>;
    const title = asString(record.title);
    const link = cleanUrl(asString(record.url) || asString(record.link) || asString(record.external_url));
    if (!title && !link) {
      warnings.push("Skipped a news item with no title or link.");
      continue;
    }
    items.push({
      id: asString(record.id) || link || title,
      title: title || "Untitled",
      link,
      publishedAt: normaliseDate(asString(record.date_published) || asString(record.published) || asString(record.date)),
      summary: stripMarkup(asString(record.summary) || asString(record.content_text) || asString(record.content_html)),
      imageUrl: cleanUrl(asString(record.image) || asString(record.banner_image) || asString(record.thumbnail)),
      category: Array.isArray(record.tags) ? asString(record.tags[0]) : asString(record.category),
    });
  }
  return { format: "jsonfeed", items, channelTitle: asString(root.title), warnings };
}

/* -------------------------------------------------------------------------- */
/* Tolerant primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Returns the inner text of each `<name>…</name>` block.
 *
 * Unclosed tags are tolerated: the block simply runs to the next opening tag of
 * the same name, or to the end of the document.
 */
export function blocksFor(xml: string, name: string): string[] {
  const blocks: string[] = [];
  const open = new RegExp(`<${name}(?:\\s[^>]*)?>`, "gi");
  const close = new RegExp(`</${name}\\s*>`, "i");
  let match: RegExpExecArray | null;
  const starts: number[] = [];
  while ((match = open.exec(xml)) !== null) {
    starts.push(match.index + match[0].length);
    if (starts.length > 500) break; // hard cap; a feed with 500+ items is broken
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] ?? 0;
    const nextStart = starts[index + 1];
    const scope = xml.slice(start, nextStart === undefined ? undefined : nextStart);
    const closeMatch = close.exec(scope);
    blocks.push(closeMatch ? scope.slice(0, closeMatch.index) : scope);
  }
  return blocks;
}

/** Inner text of the first `<name>` in `xml`, or null. Handles CDATA. */
export function firstTag(xml: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withClose = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}\\s*>`, "i");
  const match = withClose.exec(xml);
  if (match?.[1] !== undefined) return unwrapCdata(match[1]);
  // Self-closing or unclosed: take everything up to the next tag.
  const loose = new RegExp(`<${escaped}(?:\\s[^>]*)?>([^<]*)`, "i");
  const looseMatch = loose.exec(xml);
  return looseMatch?.[1] !== undefined ? unwrapCdata(looseMatch[1]) : null;
}

/** Value of `attribute` on the first matching `<name …>` tag, or null. */
export function attributeOf(xml: string, name: string, attribute: string, predicate?: (tag: string) => boolean): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<${escaped}(\\s[^>]*)?/?>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xml)) !== null) {
    const tag = match[0];
    if (predicate && !predicate(tag)) continue;
    const attrPattern = new RegExp(`${attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const attrMatch = attrPattern.exec(tag);
    const value = attrMatch?.[2] ?? attrMatch?.[3] ?? attrMatch?.[4];
    if (value) return decodeXmlText(value);
  }
  return null;
}

/**
 * Finds an image for an item in whichever of the four common places it lives:
 * `<enclosure url>`, `<media:content url>`, `<media:thumbnail url>`, or the
 * first `<img src>` inside the description.
 */
function imageFromBlock(block: string): string {
  const candidates = [
    attributeOf(block, "enclosure", "url", (tag) => /type\s*=\s*["']?image/i.test(tag) || !/type\s*=/i.test(tag)),
    attributeOf(block, "media:content", "url"),
    attributeOf(block, "media:thumbnail", "url"),
    attributeOf(block, "image", "href"),
    firstTag(block, "image"),
  ];
  for (const candidate of candidates) {
    const url = cleanUrl(candidate ?? "");
    if (url) return url;
  }
  const description = firstTag(block, "description") ?? firstTag(block, "content:encoded") ?? firstTag(block, "content") ?? "";
  const img = /<img[^>]+src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(decodeXmlText(description));
  return cleanUrl(img?.[2] ?? img?.[3] ?? img?.[4] ?? "");
}

function unwrapCdata(value: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(value);
  return (cdata?.[1] ?? value).trim();
}

/** Removes tags and decodes entities, so a widget renders text not markup. */
export function stripMarkup(value: string): string {
  return decodeXmlText(unwrapCdata(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function decodeXmlText(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return unwrapCdata(value)
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, entity: string) => {
      const lower = entity.toLowerCase();
      const direct = named[lower];
      if (direct) return direct;
      if (lower.startsWith("#x")) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      if (lower.startsWith("#")) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return whole;
    })
    .trim();
}

/**
 * Accepts only absolute http(s) URLs. Anything else — `javascript:`, `data:`,
 * a relative path, or junk — becomes "", which the caller treats as "no image".
 */
export function cleanUrl(value: string): string {
  const trimmed = decodeXmlText(value).trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

/** Turns whatever date dialect the feed used into ISO 8601, or "". */
export function normaliseDate(value: string): string {
  const trimmed = decodeXmlText(value).trim();
  if (!trimmed) return "";
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  // "2024-05-06 14:00:00" (no T, no zone) is common in hand-rolled feeds.
  const relaxed = Date.parse(trimmed.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed) ? "" : "Z"));
  return Number.isFinite(relaxed) ? new Date(relaxed).toISOString() : "";
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "name" in (value as Record<string, unknown>)) {
    const name = (value as Record<string, unknown>).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}
