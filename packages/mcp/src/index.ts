/**
 * @nexus/mcp — the Model Context Protocol client and the rules around it.
 *
 * The split matters:
 *   • `protocol.ts` and `transport.ts` move bytes and know nothing about safety;
 *   • `client.ts` owns the session, timeouts, retries and health;
 *   • `classify.ts` decides how dangerous a tool is, conservatively;
 *   • `pipeline.ts` is the only path that may actually invoke a tool, and it runs
 *     suggestion → proposal → authorisation → execution → audit in that order.
 *
 * Nothing in this package can grant authority. Only `@nexus/security`'s
 * permission engine, evaluating a policy the user configured, can do that.
 */
export * from "./protocol.js";
export * from "./transport.js";
export * from "./classify.js";
export * from "./audit.js";
export * from "./client.js";
export * from "./pipeline.js";
export * from "./config.js";
export * from "./console.js";
export * from "./explain.js";
