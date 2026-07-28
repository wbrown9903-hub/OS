# Nexus OS — engineering contract

Read this before changing anything. It is the shared source of truth for every
agent and contributor working on this repository.

## What this product is

Nexus OS is a hosted desktop experience with a native macOS shell, in three parts:

| Part | Location | What it is |
| --- | --- | --- |
| **Nexus Cloud** | `apps/web` | Next.js app: the OS interface, Nexus Studio, AI workspace, Brain, workflows, MCP centre, integrations |
| **Nexus Desktop** | `apps/desktop-macos` | SwiftUI + WKWebView shell that hosts the Cloud interface and makes it feel native |
| **Nexus Mac Bridge** | `apps/mac-bridge` | Native Swift service exposing a fixed set of validated actions (launch app, open URL, arrange windows, local MCP) |

The web app never gets shell access. The Bridge exposes only predefined,
schema-validated actions, each subject to a permission policy and written to an
audit log.

## Environment reality (read this before claiming anything works)

This repository is developed in a **Linux container with no macOS, no Xcode and
no Apple SDKs**. Therefore:

- TypeScript, the database, and all `NexusKernel` Swift targets **are built and
  tested here for real** (Swift 6.0.3 for Linux is installed at `/opt/swift`).
- SwiftUI/AppKit code in `apps/desktop-macos`, and the macOS-only targets of the
  Bridge, **cannot be compiled here**. They are written to compile on macOS and
  are exercised on the user's Mac by `BUILD_NEXUS.command`.
- **Never claim a macOS build, signing or notarisation succeeded.** Say exactly
  what was verified and where. Unverified claims are the worst failure mode in
  this project.

## Stack and conventions

- TypeScript everywhere, `strict` plus `noUncheckedIndexedAccess`. No `any`
  outside a documented boundary cast.
- Next.js App Router, React 19, server components by default; `"use client"`
  only where interaction genuinely requires it.
- **No CSS framework.** Styling is hand-authored CSS using the design tokens in
  `apps/web/styles`. Every colour comes from a `--nx-*` custom property so
  themes work without recompiling.
- Validation with `zod`, always at the API boundary.
- Database via Prisma (`packages/database/schema.prisma`). SQLite locally,
  PostgreSQL in production — JSON-shaped values are stored as serialised
  `String` columns so one schema is valid on both.
- Tests with `vitest` (unit/integration) and `@playwright/test` (browser).
  Chromium is pre-installed at `/opt/pw-browsers`; never run `playwright install`.
- Swift: SwiftPM, Swift 5.10 language mode, no third-party dependencies.

## The architectural centre — understand this before adding UI

Everything the user can see or arrange lives in **one configuration document**
(`packages/schemas/src/document.ts`).

1. **Layout stores intent, not pixels.** A widget declares its zone, its span in
   a 12-column intent grid, its priority and its visibility rules. Pixels are
   computed by `resolvePage()` for the display actually in use.
2. **Every edit is a transaction of four primitive operations** (`set`, `insert`,
   `remove`, `move`), each of which computes its own exact inverse
   (`packages/schemas/src/operations.ts`). Undo, redo, version history,
   draft/publish, "reset this component", import/export and the editing audit
   trail are all the same mechanism. **Do not add a bespoke undo stack.**
3. **A widget is one file.** Declare a `PropertySchema` and the Studio inspector,
   the zod validator, the defaults, the reset behaviour and the help text are all
   derived (`packages/schemas/src/property.ts`, `registry.ts`). There is no
   per-widget editor code. If you find yourself writing a form for one widget,
   stop — extend the property kinds instead.
4. **Accessibility is resolved, not remembered.** `resolvePage()` clamps
   animation to zero under reduced motion and forces opaque panels under reduced
   transparency/high contrast. Read `--nx-animation-scale`; never hard-code a
   duration.
5. **Unavailable never means invisible.** When a connection, permission or the
   Bridge is missing, the resolver returns an `UnavailableReason` with a
   `nextStep` and a link that fixes it. Render that, never an empty box.

## Security rules — non-negotiable

- **Authority comes from provenance, never from content.** Model output, tool
  results, web pages, webhooks and imported files are `external`/`model` origin
  and can never authorise an action. Only a user action can.
- Secrets live in the macOS Keychain (native) or encrypted with a per-user key
  (server). Never in a config document, an export, a log, a notification or a URL.
- Every inbound webhook is HMAC-verified, freshness-checked and de-duplicated by
  delivery id before any side effect — a sale sound must never play twice.
- Validate every URL before use (`packages/security`): https only for fetches, no
  `javascript:`/`data:`/`file:`, no private or metadata addresses.
- Images are validated by sniffing real bytes, with script-bearing polyglots
  rejected. Never trust `Content-Type` or a file extension.
- Confirm destructive actions even in Trusted Workspace mode.
- Never request, store or log a wallet seed phrase or private key. Wallets are
  watch-only in this version.

## Product rules

- Every error shown to a person has a plain-language message **and a next step**.
- Every button either does something real or does not exist. No placeholder
  handlers, no fake data, no "coming soon".
- Data is labelled `Live`, `Cached`, `Last updated…`, `Not connected` or the
  specific error — never an unqualified number.
- Beginner mode hides advanced fields; it never weakens security.
- The user can always get back to plain macOS: the shell has a visible escape.

## Repository layout

```
apps/web              Next.js app (Cloud) — routes, components, styles
apps/desktop-macos    SwiftUI + WKWebView shell (macOS only)
apps/mac-bridge       Swift package: kernel (portable) + bridge server (macOS)
packages/schemas      Config document, operations, resolver, property schemas, themes
packages/security     URL/media validation, redaction, HMAC, permissions (TS)
packages/database     Prisma schema and typed access helpers
packages/integrations Shopify, WordPress, RuneScape, AI providers
packages/mcp          MCP client, tool discovery, permission enforcement
packages/workflows    Workflow graph model, validation, execution
packages/cloud-brain  Knowledge, search and memory
packages/ui           Shared presentational components
scripts               Double-clickable .command entry points and build tooling
tests                 unit / integration / e2e
docs                  User and developer documentation
```

## Working agreements

- Run `npm run typecheck && npm run test` before reporting work as done. For
  Swift, `cd apps/mac-bridge && swift test` (kernel targets only on Linux).
- Never delete or skip a failing test to make a suite pass. Fix the code.
- Record notable choices in `DECISIONS.md`, open problems in `ISSUES.md`, and
  feature state in `IMPLEMENTATION_STATUS.md`. Anything blocked by a credential,
  an Apple requirement or a service term goes in `KNOWN_LIMITATIONS.md`.
- Never commit a secret. `.env` is ignored; `.env.example` is the template.
