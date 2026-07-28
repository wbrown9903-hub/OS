# Implementation status

Verified state only. "Verified" means it was built, run or tested **in this Linux
container** and the output was checked. Anything requiring macOS is marked
*awaiting Mac* and is never described as working.

Last full verification run: web build ✅ · 355 TypeScript tests ✅ · 150 Swift
tests ✅ · typecheck (shared + web) ✅ · runtime smoke test ✅

## Legend

| Mark | Meaning |
| --- | --- |
| ✅ | Implemented and verified here |
| 🧪 | Implemented; covered by tests but not exercised end-to-end |
| 🔑 | Complete, but needs the user's own credential to carry real data |
| 🍎 | Source-complete; compiles only on macOS — **not verified** |
| ◻️ | Not built in this pass |

## Foundation

| Feature | State | Evidence |
| --- | --- | --- |
| Configuration document, zones, widgets, workspaces | ✅ | 38 schema tests |
| Four primitive operations with exact inverses | ✅ | Undo/redo across a long editing session tested |
| Undo, redo, history, reset, import/export as one mechanism | ✅ | Tested |
| Layout resolver (intent → pixels, per display) | ✅ | Phone and 5K cases tested |
| Accessibility resolution (reduced motion/transparency, contrast) | ✅ | Animation pinned to 0; panels forced opaque |
| Six themes | ✅ | All pass WCAG AA for primary and secondary text |
| Property-schema derivation (inspector, validator, defaults, help) | ✅ | Tested incl. partial/invalid repair |
| Prisma data model, SQLite database | ✅ | Created, migrated, queried at runtime |
| Structured errors carrying a recovery step | ✅ | Enforced in tests |

## Security

| Feature | State | Evidence |
| --- | --- | --- |
| Secret redaction (Swift + TypeScript) | ✅ | Provider keys, JWTs, PEM blocks, recovery phrases |
| SHA-256 / HMAC | ✅ | NIST + RFC 4231 vectors |
| URL validation | ✅ | Script schemes, private/metadata ranges, homographs |
| Path confinement | ✅ | Traversal **and** symlink-escape-through-missing-tail |
| Media validation | ✅ | Byte sniffing; script-bearing PNG polyglot rejected |
| Webhook HMAC + freshness + replay rejection | ✅ | Forgery, tamper, replay, staleness tested |
| Permission engine (5 modes × 4 impacts) | ✅ | Full matrix tested |
| Trust boundary (authority from provenance) | ✅ | Untrusted content cannot act without authorisation |
| Per-user encryption of stored secrets | 🧪 | AES-256-GCM implemented; unit tested |
| Audit log with redaction | ✅ | Tested; written by the bridge action route |

## Nexus Cloud (apps/web)

| Feature | State | Notes |
| --- | --- | --- |
| Production build | ✅ | 12 routes, 158 kB first load |
| Desktop shell: top bar, dock, canvas | ✅ | Renders at runtime |
| Command palette, overlays, toasts, confirmations | 🧪 | Components complete; wired into the page |
| Widget definitions | ✅ | **44** served by `/api/widgets` |
| Widget renderers | 🧪 | 12 bespoke + a definition-driven renderer for the rest |
| Config API (load, commit, optimistic concurrency) | ✅ | Verified against the live server |
| Connections / notifications / bridge APIs | ✅ | Return real database state |
| Help centre content | ✅ | 10 structured topics served |
| Nexus Studio (visual editor) | ◻️ | Cut short by the spend limit — see below |
| Auth, knowledge, memory, backup, search APIs | ◻️ | Same |

## Native (macOS)

| Feature | State | Notes |
| --- | --- | --- |
| Portable kernel: security, permissions, persistence, migrations | ✅ | 150 Swift tests pass on Linux |
| Bridge protocol: closed action set, signing, nonce, validation | ✅ | Tested (33 protocol tests among the 150) |
| Bridge macOS service (NSWorkspace, Accessibility, Keychain) | 🍎 | Not compiled here |
| Nexus Desktop SwiftUI shell | ◻️ | Not reached |
| `.app` bundle, DMG, signing, notarisation | 🍎 | Scripted; needs a Mac and Apple credentials |

## Integrations

| Feature | State | Notes |
| --- | --- | --- |
| Shopify client, webhook verification, de-duplication | 🔑🧪 | Needs an access token for live data |
| WordPress / WooCommerce client | 🔑🧪 | Needs a site URL and application password |
| RuneScape news + banner fallback chain | 🧪 | Feed parsing and fallbacks implemented |
| AI providers (Anthropic, OpenAI) | 🔑 | Adapter work was cut short mid-file |
| MCP client | ◻️ | Permission semantics exist in the kernel; client not reached |
| Workflow engine | ◻️ | Not reached |

## Tooling and assets

| Feature | State | Notes |
| --- | --- | --- |
| Original generated icons, artwork, backgrounds | ✅ | Produced by `scripts/generate-assets.mjs` |
| Original generated UI and sale sounds | ✅ | Produced by `scripts/generate-sounds.mjs` |
| `nx_*` build library, preflight | ✅ | Syntax-checked; macOS paths unverified |
| `START_NEXUS` / `BUILD_NEXUS` / `TEST_NEXUS` / `PACKAGE_NEXUS` | 🍎 | Syntax-checked here; run on the user's Mac |
| CI workflow | ◻️ | Not reached |

## Why some rows are ◻️

Six build agents were running in parallel when the account hit its **monthly
spend limit**, and all six were terminated mid-write. What they had already
written is committed, compiles, and passes its tests — the tree is green. The
unfinished areas are listed honestly above rather than being described as
complete. `KNOWN_LIMITATIONS.md` covers the constraints that are structural
(no macOS here, no Apple credentials, no third-party service credentials).
