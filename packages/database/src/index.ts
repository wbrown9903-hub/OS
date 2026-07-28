/**
 * @nexus/database — the Prisma client and the typed access helpers.
 *
 * Rule for the whole product: JSON-shaped columns are read and written through
 * the helpers in `./columns.js`, never with a bare `JSON.parse` at a call site.
 * That is what makes a corrupt row produce a message with a next step instead of
 * a stack trace, and what keeps one schema valid on both SQLite and PostgreSQL.
 */
export * from "./client.js";
export * from "./columns.js";

// The default configuration document lives in the seed so that the seed can run
// under plain `node --experimental-strip-types` with no resolver configuration.
// The API imports it from here, so a new account and a fresh seed are identical.
export { buildDefaultConfiguration, seedUser, type SeedResult, type SeedUserOptions } from "../seed.js";
