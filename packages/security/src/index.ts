/**
 * @nexus/security — the TypeScript half of the Nexus OS security model.
 *
 * Every module here is a deliberate counterpart of a file in
 * apps/mac-bridge/Sources/SecurityCore, and the two are expected to behave
 * identically: the same URL is refused on both sides, the same bytes are refused
 * on both sides, and the same permission mode produces the same decision.
 * tests/unit/security.test.ts mirrors Tests/SecurityCoreTests one case at a time.
 */
export * from "./errors.js";
export * from "./redaction.js";
export * from "./url.js";
export * from "./media.js";
export * from "./webhook.js";
export * from "./permissions.js";
export * from "./trust.js";
export * from "./encryption.js";
export * from "./password.js";
