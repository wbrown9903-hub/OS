# Nexus OS

A customisable command centre that runs **on top of** macOS — launcher, AI
workspace, knowledge base, workflows and store dashboards in one editable
surface. It never replaces macOS, and there is always a visible way back.

## Getting started

Double-click **`START_NEXUS.command`**. It checks your Mac, installs what it
needs, prepares the database, builds the interface and opens Nexus. If anything
fails it writes a plain-English explanation to `dist/DIAGNOSTIC-REPORT.md`.

| File | What it does |
| --- | --- |
| `START_NEXUS.command` | Runs Nexus |
| `BUILD_NEXUS.command` | Builds and verifies everything, writes a build report |
| `TEST_NEXUS.command` | Runs every test, writes the real numbers |
| `PACKAGE_NEXUS.command` | Produces the installable `.dmg` |

No Terminal commands, no Xcode configuration, no manual file creation.

## What makes it different

**Your layout is intent, not pixels.** A panel says which zone it belongs to and
how much room it wants — so one layout is correct on a laptop, a 5K display and a
phone-width window, and reduced motion or high contrast are honoured everywhere
by construction.

**Every edit is reversible by design.** Undo, version history, draft/publish,
"reset just this panel" and import/export are one mechanism, not six features
that can disagree.

**Everything on screen is editable** in Nexus Studio — wording, images, links,
buttons, colours, spacing, pages — without touching code.

**Nothing pretends.** Data is labelled Live, Cached, Last updated or Not
connected. A panel that cannot reach a service explains why and links to the fix
instead of vanishing or inventing a number.

## Safety

The web layer has **no shell access**. The native bridge exposes sixteen typed
actions and nothing else. Authority comes from provenance: text from a model, a
web page, a document or a webhook can never authorise an action — only you can.
Destructive work is confirmed even in Trusted Workspace mode.

Full detail in [`SECURITY.md`](SECURITY.md).

## Documentation

| Document | Contents |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the three parts fit together |
| [`SECURITY.md`](SECURITY.md) | Threat model and what is actually verified |
| [`DECISIONS.md`](DECISIONS.md) | Choices made, and what they were chosen over |
| [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) | Verified state, feature by feature |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Constraints stated plainly |
| [`CLAUDE.md`](CLAUDE.md) | Engineering contract for contributors |

## Verification

Built and tested on Linux: **355 TypeScript tests**, **150 Swift tests**, clean
typechecks, a passing production build, and a runtime smoke test of the running
server. macOS-only code is source-complete but **not** compiled here, and no
claim is made that it was — see `KNOWN_LIMITATIONS.md`.
