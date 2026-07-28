/**
 * @nexus/shared — types and content used on both sides of the API boundary.
 *
 * Everything here is pure data or pure functions. Nothing in this package reads
 * the filesystem, opens a database or touches a network, so the browser bundle
 * and the server can both import it without conditionals.
 */
export * from "./envelope.js";
export * from "./ids.js";
export * from "./help.js";
export * from "./settings-index.js";
export * from "./widgets.js";
