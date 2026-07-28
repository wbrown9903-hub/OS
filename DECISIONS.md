# Decision log

Each entry records what was chosen, what it was chosen over, and why. Later
contributors should read this before proposing a reversal.

---

## D1 — Hybrid hosted app + native shell + native bridge
**Chosen:** Next.js interface hosted in a SwiftUI/WKWebView shell, with a separate
native Swift bridge for anything touching macOS.
**Over:** a pure native SwiftUI application; an Electron application.
**Why:** the interface is the part that changes constantly and benefits from web
iteration speed and cross-device reach; the part that can touch the user's Mac
should be as small and auditable as possible. Electron was rejected because
SwiftUI + WKWebView delivers native chrome, menus, notifications and permissions
without shipping a second browser engine. This also draws a clean security line:
the web layer has no shell access, by construction.

## D2 — The Bridge exposes a closed action set with no shell action
**Chosen:** sixteen typed, schema-validated actions.
**Over:** a generic "run command" endpoint gated by permissions.
**Why:** a generic executor makes the permission system the only thing standing
between model output and arbitrary code. A closed set means the *worst case* is
bounded by what the actions can express. Advanced users who need scripting get an
explicitly-approved, checksummed script action with a restricted working
directory — not a shell.

## D3 — Layout stores intent, never coordinates
**Chosen:** zone + 12-column intent span + priority + visibility rules, resolved
per display at render time.
**Over:** stored pixel or grid coordinates per breakpoint.
**Why:** coordinates force the user to maintain a layout per display, make
"reset one component" awkward, and scatter accessibility handling into every
widget. Resolving at render time makes multi-display support, reduced motion,
reduced transparency, low-power behaviour and unavailable-state explanations
structural rather than a matter of per-widget discipline.

## D4 — Four primitive operations with exact inverses
**Chosen:** `set`, `insert`, `remove`, `move`, each computing its own inverse;
gestures compose them into labelled transactions.
**Over:** bespoke handlers per gesture with a separate undo stack, and over a
full CRDT.
**Why:** undo/redo, version history, draft/publish, reset, import/export and the
editing audit trail collapse into one mechanism, so they cannot disagree. A CRDT
was rejected as unnecessary for a single-user document; optimistic concurrency on
a revision number covers multi-window editing with a clear conflict message.

## D5 — Property schema is the single source of truth for a widget
**Chosen:** one declaration derives the inspector, validator, type, defaults,
reset behaviour and help.
**Over:** hand-written editor forms per widget.
**Why:** hand-written editors drift from renderers. Deriving them means adding a
widget touches exactly one file and can never ship an uneditable property.

## D6 — No CSS framework
**Chosen:** hand-authored CSS driven entirely by `--nx-*` custom properties.
**Over:** Tailwind or a component library.
**Why:** the product's whole premise is a bespoke, theme-able operating-system
aesthetic where the user can restyle everything at runtime. Utility classes
compiled at build time fight that; custom properties let a theme change without
recompiling, which is exactly what the theme editor needs.

## D7 — SQLite locally, PostgreSQL in production, one Prisma schema
**Chosen:** one schema; JSON-shaped values stored as serialised `String` columns;
a script switches the provider for production.
**Over:** requiring PostgreSQL (or Docker) for local development; two schema files.
**Why:** the zero-manual-work requirement means double-clicking one file must
work on a stock Mac. Requiring a database install or Docker breaks that promise
outright. Avoiding native JSON columns keeps a single schema valid on both
engines, so the two environments cannot drift apart.

## D8 — No third-party Swift dependencies
**Chosen:** SHA-256 and HMAC implemented in-repo, verified against NIST and
RFC 4231 vectors.
**Over:** swift-crypto.
**Why:** these primitives are needed on both macOS and Linux CI (CryptoKit does
not exist on Linux), they are small and fully specified, and removing the
dependency removes a supply-chain link from the security-critical path.

## D9 — Kernel split: portable Swift vs macOS-only Swift
**Chosen:** security, validation, permissions, persistence and migrations live in
Foundation-only targets that build and test on Linux; AppKit/SwiftUI/Accessibility
code is isolated in macOS-only targets.
**Over:** one macOS-only package.
**Why:** the highest-risk code is the security core, and this split means it is
continuously compiled and tested in CI even though the container has no macOS
SDK. Without it, none of the security logic could be verified before reaching a
Mac.

## D10 — Local single-user mode with no login wall
**Chosen:** when `NEXUS_LOCAL_MODE` is not `0`, the server auto-provisions and
signs in a local user; full authentication applies to hosted deployments.
**Over:** requiring account creation before first use.
**Why:** the user's stated requirement is that they double-click once and the
product runs. A sign-up form before the first screen is exactly the manual work
that was ruled out. Hosted multi-user deployments still get real sessions,
password hashing and per-user encryption.

## D11 — App bundle assembled from SwiftPM output, no checked-in Xcode project
**Chosen:** `PACKAGE_NEXUS.command` assembles `NexusOS.app` from `swift build`
output plus a generated `Info.plist`, icon set and resources.
**Over:** committing an `.xcodeproj` the user must open and configure.
**Why:** it removes Xcode project configuration from the user's hands entirely
and needs only Apple's free Command Line Tools rather than the full Xcode
install. Developers who want an Xcode workspace can still open the package
directly.

## D12 — Generated original assets, no third-party artwork or sounds
**Chosen:** icons, background artwork, fallback banners and all UI sounds are
generated procedurally by scripts in this repository.
**Over:** bundling stock assets or imitating a known product's notification sound.
**Why:** it guarantees every asset is original and legally safe to redistribute,
keeps the repository free of licence encumbrance, and makes the visual language
reproducible and themeable. In particular the sale sound is original and
deliberately does not imitate any commercial product's recording.

## D13 — Unavailable widgets explain themselves rather than disappearing
**Chosen:** the resolver returns a reason, a next step and a link that fixes it.
**Over:** hiding widgets whose connection is missing.
**Why:** silent disappearance is indistinguishable from a bug and leaves the user
with no path forward. An explanatory card turns every unconfigured integration
into onboarding.

## D14 — Data freshness is always labelled
**Chosen:** every data-bearing widget renders Live / Cached / Last updated /
Not connected / the specific error, never a bare number.
**Over:** showing the most recent value available.
**Why:** an unlabelled stale figure is worse than no figure when the user is
making decisions about their business. This also makes it structurally impossible
to present sample or cached data as live.
