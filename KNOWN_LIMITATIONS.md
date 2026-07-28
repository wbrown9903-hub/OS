# Known limitations

Every entry states the limitation exactly, why it exists, and what Nexus OS does
instead. Nothing here is hidden behind an optimistic status elsewhere in the
documentation.

## 1. Build environment: no macOS in this container

This repository was developed in a Linux container with **no macOS, no Xcode and
no Apple SDKs**. Consequently:

| Area | Verified here | Awaiting a Mac |
| --- | --- | --- |
| TypeScript packages, database, web build | Yes | — |
| Swift portable kernel (security, validation, permissions, persistence) | Yes — built and tested with Swift 6.0.3 for Linux | — |
| Swift macOS service (NSWorkspace, Accessibility, Keychain, notifications) | No | Compile and run |
| SwiftUI desktop shell (`apps/desktop-macos`) | No | Compile and run |
| `.app` bundle, DMG, signing, notarisation, Gatekeeper | No | Run `BUILD_NEXUS.command` then `PACKAGE_NEXUS.command` |

**No claim is made anywhere that macOS code has been compiled or executed.**
`BUILD_NEXUS.command` performs those steps on the user's Mac and writes an
honest report of what actually happened.

## 2. Apple requirements that need a human

These cannot be automated by anyone, including Apple's own tooling:

- Signing in to an Apple ID and accepting Apple's agreements
- Purchasing Apple Developer Program membership (required for Developer ID
  signing and notarisation)
- Two-factor authentication during notarisation
- Approving Accessibility, Notifications, Screen Recording, Automation, Files and
  Login Item permissions in System Settings

Without a paid Developer ID, the packaging scripts produce a correctly built but
**unsigned development artifact**, clearly labelled as such. macOS will show a
Gatekeeper warning for it; the installation guide explains the right-click →
Open path. The scripts never fabricate a signing or notarisation result.

## 3. Integrations that require the user's own credentials

The integration code, connection wizard, connection test, error handling and
widgets are complete, but no live data can flow until the user supplies a
credential. Each shows **Configuration required** rather than being described as
finished:

- Shopify — Admin API access token and webhook signing secret
- WordPress / WooCommerce — site URL and application password
- Anthropic / OpenAI / other AI providers — API key
- Google Drive, GitHub — account authorisation
- Crypto watch-only balances — a public address and a balance provider

## 4. Third-party embedding

Claude and ChatGPT web interfaces set `X-Frame-Options`/CSP headers that prevent
embedding, and Nexus OS **will not** circumvent them. Those cards therefore offer
Open App, Open in Browser, and a native API workspace when the user supplies a
key. This is deliberate and is presented as an intentional design, not an error.

## 5. RuneScape news banner

Nexus OS reads the official public news feed, and caches an accompanying image
**only where the source permits it**. Because a publisher may change markup or
terms at any time, the banner uses a fallback chain: official feed image → manual
banner the user chose → built-in original artwork. Automatic updating can be
turned off entirely. Nexus OS never scrapes behind authentication, never uses
unofficial mirrors, and never handles RuneScape credentials. Direct launch of a
*specific* game is attempted where the official launcher supports it and
otherwise falls back to opening the launcher.

## 6. Deliberate functional boundaries

- **No shell execution from the web layer.** By design (see `DECISIONS.md` D2).
- **Wallets are watch-only.** No transaction signing, no seed phrases, no private
  keys. Signing stays in the user's own wallet application.
- **Extensions are declarative in this version.** Themes, widgets, workflows and
  tutorials only. Native executable extensions require a stronger validation and
  approval story than this version ships.
- **Nexus OS does not replace macOS.** It is a layer above it. The macOS Dock,
  menu bar and window server continue to work, and there is always a visible
  escape back to plain macOS.

## 7. Scale and performance caveats

Performance figures in `PERFORMANCE_RESULTS.md` were measured in this Linux
container, which is **not** representative of an Apple Silicon Mac. Launch time,
frame rate and memory figures for the desktop shell can only be measured on real
hardware; they are recorded as pending rather than estimated.
