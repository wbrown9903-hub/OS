/**
 * Removes credential-shaped material from anything on its way to a log, a
 * notification, a diagnostics export, an audit record or an AI provider payload.
 *
 * The rule Nexus OS follows: redaction is applied at the *sink*, not at the call
 * site, so a future contributor cannot leak a secret by forgetting to wrap it.
 *
 * This is a direct port of `SecretRedactor` in
 * apps/mac-bridge/Sources/SecurityCore/Redaction.swift. The pattern list, the
 * ordering and the placeholder text are intentionally identical, so a value that
 * is safe to log on the Mac is safe to log on the server and vice versa.
 */

export const REDACTION_PLACEHOLDER = "«redacted»";
export const RECOVERY_PHRASE_PLACEHOLDER = "«recovery phrase removed»";

/**
 * Ordered so the most specific shapes match before the generic high-entropy rule.
 * Each entry is recreated per call site via `new RegExp` to avoid `lastIndex`
 * state leaking between calls on the shared `g` flag.
 */
const PATTERNS: ReadonlyArray<{ name: string; source: string; flags: string }> = [
  { name: "anthropic", source: String.raw`sk-ant-[A-Za-z0-9_\-]{16,}`, flags: "g" },
  { name: "openai", source: String.raw`sk-(?:proj-)?[A-Za-z0-9_\-]{20,}`, flags: "g" },
  { name: "github", source: String.raw`gh[pousr]_[A-Za-z0-9]{16,}`, flags: "g" },
  { name: "githubFineGrained", source: String.raw`github_pat_[A-Za-z0-9_]{20,}`, flags: "g" },
  { name: "shopify", source: String.raw`shp(?:at|ca|pa|ss)_[A-Fa-f0-9]{16,}`, flags: "g" },
  { name: "google", source: String.raw`ya29\.[A-Za-z0-9_\-]{20,}`, flags: "g" },
  { name: "slack", source: String.raw`xox[abposr]-[A-Za-z0-9\-]{10,}`, flags: "g" },
  { name: "awsAccessKey", source: String.raw`AKIA[0-9A-Z]{16}`, flags: "g" },
  {
    name: "jwt",
    source: String.raw`eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}`,
    flags: "g",
  },
  {
    name: "privateKeyBlock",
    source: String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`,
    flags: "g",
  },
  { name: "bearer", source: String.raw`(bearer|authorization:)\s+[A-Za-z0-9_\-\.=]{12,}`, flags: "gi" },
  {
    name: "assignedSecret",
    source: String.raw`\b(api[_\-]?key|apikey|secret|token|password|passwd|client[_\-]?secret|access[_\-]?token|refresh[_\-]?token)\b\s*[:=]\s*["']?[^\s"',;}]{6,}`,
    flags: "gi",
  },
  {
    name: "basicAuthURL",
    source: String.raw`[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^\s:@\/]+:[^\s@\/]+@`,
    flags: "g",
  },
  { name: "hexSecret", source: String.raw`\b[A-Fa-f0-9]{40,}\b`, flags: "g" },
  { name: "wordPressAppPassword", source: String.raw`\b(?:[A-Za-z0-9]{4} ){5}[A-Za-z0-9]{4}\b`, flags: "g" },
];

/**
 * BIP-39 style recovery phrases are never accepted or stored by Nexus OS.
 * Detecting them lets the wallet centre warn instead of silently logging one.
 */
const MNEMONIC_SOURCE = String.raw`\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b`;

const SENSITIVE_KEY_FRAGMENTS = [
  "secret",
  "token",
  "password",
  "passwd",
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "privatekey",
  "private_key",
  "seed",
  "mnemonic",
  "clientsecret",
  "client_secret",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "signingkey",
  "webhooksecret",
  "webhook_secret",
];

export class SecretRedactor {
  static readonly placeholder = REDACTION_PLACEHOLDER;

  /** Replaces every credential-shaped run in `input`. Safe on any string. */
  redact(input: string): string {
    if (!input) return input;
    let output = input;
    for (const pattern of PATTERNS) {
      output = output.replace(new RegExp(pattern.source, pattern.flags), REDACTION_PLACEHOLDER);
    }
    const mnemonic = new RegExp(MNEMONIC_SOURCE, "gi");
    if (this.looksLikeMnemonic(output)) {
      output = output.replace(mnemonic, RECOVERY_PHRASE_PLACEHOLDER);
    }
    return output;
  }

  redactRecord(record: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key] = this.isSensitiveKey(key) ? REDACTION_PLACEHOLDER : this.redact(value);
    }
    return out;
  }

  /**
   * Recursively redacts a JSON value, dropping values under credential-shaped keys
   * entirely rather than trying to pattern-match them.
   */
  redactJSON(value: unknown): unknown {
    if (typeof value === "string") return this.redact(value);
    if (Array.isArray(value)) return value.map((item) => this.redactJSON(item));
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = this.isSensitiveKey(key) ? REDACTION_PLACEHOLDER : this.redactJSON(child);
      }
      return out;
    }
    return value;
  }

  isSensitiveKey(key: string): boolean {
    const lowered = key.toLowerCase();
    return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment));
  }

  /**
   * A long run of lowercase words is only treated as a mnemonic when the words are
   * short and uniform, so ordinary prose is not mangled.
   */
  private looksLikeMnemonic(text: string): boolean {
    const match = new RegExp(MNEMONIC_SOURCE, "i").exec(text);
    if (!match) return false;
    const words = match[0].trim().split(/\s+/);
    if (words.length < 12 || words.length > 24) return false;
    const total = words.reduce((sum, word) => sum + word.length, 0);
    const average = Math.floor(total / Math.max(words.length, 1));
    if (average > 7) return false;
    return words.every((word) => /^[a-z]+$/.test(word));
  }
}

/** Process-wide instance. Sinks use this; call sites never need their own. */
export const secretRedactor = new SecretRedactor();

/** Convenience wrapper so a sink can be written as `log(redact(message))`. */
export function redact(input: string): string {
  return secretRedactor.redact(input);
}

export function redactJSON(value: unknown): unknown {
  return secretRedactor.redactJSON(value);
}
