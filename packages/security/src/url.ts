import { NexusError } from "./errors.js";

/**
 * Guards every URL that reaches a browser, an image downloader, a widget data
 * fetch or a workflow action. Anything a model, a plugin, a webhook or a news
 * feed produced is treated as hostile until it passes here.
 *
 * Port of apps/mac-bridge/Sources/SecurityCore/URLValidator.swift — same policies,
 * same blocked schemes, same error codes and the same recovery wording.
 */

export interface UrlPolicy {
  allowedSchemes: ReadonlySet<string>;
  /** Empty means "any public host". Non-empty restricts to these hosts and their subdomains. */
  allowedHosts: ReadonlySet<string>;
  allowLocalNetwork: boolean;
  requireTLS: boolean;
  maximumLength: number;
}

export function makeUrlPolicy(overrides: Partial<{
  allowedSchemes: Iterable<string>;
  allowedHosts: Iterable<string>;
  allowLocalNetwork: boolean;
  requireTLS: boolean;
  maximumLength: number;
}> = {}): UrlPolicy {
  return {
    allowedSchemes: new Set(overrides.allowedSchemes ?? ["https"]),
    allowedHosts: new Set(overrides.allowedHosts ?? []),
    allowLocalNetwork: overrides.allowLocalNetwork ?? false,
    requireTLS: overrides.requireTLS ?? true,
    maximumLength: overrides.maximumLength ?? 2048,
  };
}

export const urlPolicies = {
  /** Links opened in the user's default browser. */
  web: makeUrlPolicy({ allowedSchemes: ["https", "http"], requireTLS: false }),
  /** Strict policy for anything fetched by Nexus itself (news, images, APIs). */
  remoteFetch: makeUrlPolicy({ allowedSchemes: ["https"], requireTLS: true }),
  /** Local MCP servers and self-hosted WordPress instances may be on the LAN. */
  localService: makeUrlPolicy({
    allowedSchemes: ["https", "http"],
    allowLocalNetwork: true,
    requireTLS: false,
  }),
} as const;

export type UrlPolicyName = keyof typeof urlPolicies;

/**
 * Schemes that can execute code, mount volumes or reach internal handlers.
 * Rejected everywhere, regardless of policy.
 */
export const NEVER_ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "data",
  "vbscript",
  "file",
  "about",
  "blob",
  "jar",
  "smb",
  "afp",
  "ftp",
  "telnet",
  "ssh",
  "x-apple-helpscript",
  "applescript",
]);

/** Blocks loopback, link-local, RFC1918 and metadata-service addresses. */
export function isLocalOrPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"].includes(bare)) return true;
  if (bare.endsWith(".local") || bare.endsWith(".internal") || bare.endsWith(".localhost")) return true;
  if (bare === "169.254.169.254" || bare.startsWith("169.254.")) return true;
  // IPv6 unique-local and loopback forms that reach the same machine.
  if (bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80:")) return true;

  const parts = bare.split(".");
  if (parts.length !== 4) return false;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    if (value > 255) return false;
    octets.push(value);
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Flags a host that mixes Latin with another script — the visual-spoofing case
 * that makes `аpple.com` (Cyrillic а) indistinguishable from the real thing.
 */
export function containsMixedScripts(host: string): boolean {
  let hasLatin = false;
  let hasNonLatin = false;
  for (const character of host) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 128) {
      if (/[a-zA-Z]/.test(character)) hasLatin = true;
    } else if (/\p{L}/u.test(character)) {
      hasNonLatin = true;
    }
  }
  return hasLatin && hasNonLatin;
}

export function hostMatchesAny(host: string, allowed: ReadonlySet<string>): boolean {
  for (const candidate of allowed) {
    const normalised = candidate.toLowerCase();
    if (host === normalised || host.endsWith(`.${normalised}`)) return true;
  }
  return false;
}

/**
 * The authority part exactly as the user typed it, before `new URL` punycodes it.
 * Homograph detection has to run on this, because normalisation would turn
 * `аpple.com` into `xn--pple-43d.com` and hide the mixed script.
 */
function rawAuthority(candidate: string): string {
  const match = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/([^/?#]*)/.exec(candidate);
  if (!match?.[1]) return "";
  let authority = match[1];
  const at = authority.lastIndexOf("@");
  if (at !== -1) authority = authority.slice(at + 1);
  if (authority.startsWith("[")) return authority.slice(0, authority.indexOf("]") + 1);
  const colon = authority.indexOf(":");
  return colon === -1 ? authority : authority.slice(0, colon);
}

export class UrlValidator {
  constructor(readonly policy: UrlPolicy) {}

  static forPolicy(name: UrlPolicyName): UrlValidator {
    return new UrlValidator(urlPolicies[name]);
  }

  /** Throws a `NexusError` describing exactly what was wrong and what to do next. */
  validate(candidate: string): URL {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      throw NexusError.validation(
        "emptyURL",
        "No web address was provided.",
        "Enter a full address beginning with https://",
      );
    }
    if (trimmed.length > this.policy.maximumLength) {
      throw NexusError.validation(
        "urlTooLong",
        "That web address is unusually long and was rejected.",
        "Use a shorter link, or open it manually in your browser.",
      );
    }
    for (const character of trimmed) {
      const code = character.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) {
        throw NexusError.security(
          "controlCharacters",
          "That web address contains hidden characters.",
          "Retype the address by hand rather than pasting it.",
        );
      }
    }

    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(trimmed);
    const declaredScheme = schemeMatch?.[1]?.toLowerCase();
    if (declaredScheme && NEVER_ALLOWED_SCHEMES.has(declaredScheme)) {
      throw NexusError.security(
        "blockedScheme",
        `Nexus OS will not open ${declaredScheme}: links.`,
        "Only standard web links can be opened. Report this if you did not expect it.",
      );
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw NexusError.validation(
        "malformedURL",
        "That is not a valid web address.",
        "Check for typos. A full address looks like https://example.com/page",
      );
    }

    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    if (NEVER_ALLOWED_SCHEMES.has(scheme)) {
      throw NexusError.security(
        "blockedScheme",
        `Nexus OS will not open ${scheme}: links.`,
        "Only standard web links can be opened. Report this if you did not expect it.",
      );
    }
    if (!this.policy.allowedSchemes.has(scheme)) {
      throw NexusError.security(
        "schemeNotAllowed",
        `Links of type ${scheme}: are not permitted here.`,
        "Use an https:// address instead.",
      );
    }
    if (this.policy.requireTLS && scheme === "http") {
      throw NexusError.security(
        "insecureTransport",
        "That address is not encrypted.",
        "Use the https:// version of the address.",
      );
    }

    const host = url.hostname.toLowerCase();
    if (host.length === 0) {
      throw NexusError.validation(
        "missingHost",
        "That web address has no site name.",
        "Include the site, for example https://example.com",
      );
    }
    if (url.username.length > 0 || url.password.length > 0) {
      throw NexusError.security(
        "credentialsInURL",
        "That address contains an embedded username or password.",
        "Remove the credentials from the link. Nexus OS never sends them.",
      );
    }
    if (!this.policy.allowLocalNetwork && isLocalOrPrivateHost(host)) {
      throw NexusError.security(
        "privateAddress",
        "That address points at your own machine or local network.",
        "If this is a self-hosted service, add it under Settings › Connections where local addresses are allowed.",
      );
    }
    const typedHost = rawAuthority(trimmed).toLowerCase();
    if (containsMixedScripts(typedHost) || containsMixedScripts(host)) {
      throw NexusError.security(
        "homographHost",
        "The site name mixes character sets, which is a common disguise for a fake site.",
        "Type the address manually to be sure you reach the real site.",
      );
    }
    if (this.policy.allowedHosts.size > 0 && !hostMatchesAny(host, this.policy.allowedHosts)) {
      throw NexusError.security(
        "hostNotAllowed",
        `Nexus OS is not configured to contact ${host}.`,
        "Add that site to the allowed list for this connection, or use the official address.",
      );
    }
    return url;
  }

  isValid(candidate: string): boolean {
    try {
      this.validate(candidate);
      return true;
    } catch {
      return false;
    }
  }
}

/** Convenience for the common cases so call sites read as a sentence. */
export function validateWebLink(candidate: string): URL {
  return UrlValidator.forPolicy("web").validate(candidate);
}

export function validateFetchTarget(candidate: string): URL {
  return UrlValidator.forPolicy("remoteFetch").validate(candidate);
}

export function validateLocalService(candidate: string): URL {
  return UrlValidator.forPolicy("localService").validate(candidate);
}
