# Nexus OS — security model and threat model

Nexus OS launches applications, reads and writes files, holds API credentials,
talks to AI models, runs tool servers and receives webhooks. That is a large
attack surface, so the design assumes compromise of every external input.

**One principle underpins everything:** authority is derived from *provenance*,
never from *content*. Only a person can authorise an action. Text — however
persuasive, wherever it came from — cannot.

## 1. Threat model

### T1 — Malicious or compromised MCP server
*Risk:* a tool server exfiltrates data, reads files outside its remit, or performs
destructive work.
*Controls:* per-server permission mode defaulting to Ask Every Time; per-tool
enable/disable with a deny list that wins in every mode; impact classification
defaulting conservatively to `write`; destructive actions confirm even in Trusted
Workspace; path confinement and URL validation applied to every argument; audit
record for every decision including denials; connection timeouts and retry caps;
one-switch disable.

### T2 — Prompt injection
*Risk:* content inside a document, web page, email or tool result talks the model
into using its tools against the user.
*Controls:* tool output and fetched content are `external` origin and can never
authorise a call; the model may only *propose*, and proposal → authorisation →
execution → audit are distinct stages; a `system`-impact action proposed by a
model always confirms; injection heuristics surface a warning in the UI but are
never the control itself.

### T3 — Compromised plugin or theme
*Risk:* an extension escalates privileges or crashes the shell.
*Controls:* declarative extensions only in this version (themes, widgets,
workflows, tutorials) — no arbitrary code execution; permissions are recorded at
install and an update requesting more must be approved again, so silent
escalation is rejected; signature state is surfaced and unsigned extensions warn;
Safe Mode disables all extensions; failures are isolated so one extension cannot
take down the interface.

### T4 — Hostile remote image or feed
*Risk:* the RuneScape news banner (or any remote image) delivers script,
a decompression bomb, or an SSRF probe.
*Controls:* https only; private, loopback, link-local and cloud-metadata
addresses refused; format decided by magic bytes rather than `Content-Type`;
SVG and HTML refused outright; script-bearing polyglots detected by byte scan;
size cap; images cached locally with their source URL and attribution; a
built-in original fallback means a broken source can never break the dashboard.

### T5 — Secret leakage
*Risk:* a credential reaches a log, an export, a notification, a crash report or
a repository.
*Controls:* redaction applied at the logging sink so a missed wrap at a call site
cannot leak; credential-shaped keys dropped entirely from JSON; secrets stored in
the Keychain or encrypted with AES-256-GCM under a per-user derived key; only a
four-character hint is ever displayed; exports contain secret *references*, never
values; `.gitignore` covers key material and a secret scan runs before packaging.

### T6 — Webhook forgery and replay
*Risk:* a forged Shopify delivery invents a sale; a captured delivery is replayed
to play the sound repeatedly or corrupt metrics.
*Controls:* HMAC-SHA256 verified with a constant-time comparison; timestamp
freshness window; delivery ids recorded under a unique index so a repeat is
rejected at the database level; de-duplication also by order id; every delivery
recorded before any side effect runs.

### T7 — Over-broad desktop control
*Risk:* Accessibility permission is used far beyond what the user intended.
*Controls:* a closed set of sixteen typed actions with validated parameters and
no shell action at all; dry-run and preview modes; per-workflow and
per-application permissions; confirmation for destructive work; full audit
history; an emergency stop that disables every action at once.

### T8 — Cloud session compromise driving the Mac
*Risk:* a stolen cookie lets an attacker launch applications or read files.
*Controls:* the Bridge accepts loopback origins only; every request carries a
per-device signature and a monotonic nonce inside a freshness window; pairing is
explicit and revocable per device; the Bridge's own permission policy applies
independently of the cloud session.

### T9 — Update channel or supply chain compromise
*Risk:* a malicious update or dependency.
*Controls:* signed update artifacts with signature verification before install;
pinned dependencies with an audit step in CI; no third-party Swift dependencies
(SHA-256/HMAC implemented in-repo and verified against NIST and RFC 4231
vectors); checksums published for every artifact; release verification refuses to
claim signing succeeded without real credentials.

### T10 — Accidental publication of private data
*Risk:* the GitHub sync backend publishes a repository containing knowledge or
credentials.
*Controls:* private repository by default; secret patterns added to `.gitignore`
at setup; likely-secret detection before every commit; an explicit warning before
a repository is made public; commit history and rollback exposed in the UI.

### T11 — Wallet phishing and malicious approvals
*Risk:* the user is induced to reveal a seed phrase or approve a hostile
transaction.
*Controls:* the wallet centre is watch-only; there is no field anywhere in the
product that accepts a seed phrase or private key, and the redactor actively
detects and strips BIP-39-shaped text; signing always stays inside the user's own
wallet; a security tutorial covers phishing, address poisoning, unlimited
approvals and network mismatch.

### T12 — Data loss through migration or corruption
*Risk:* an upgrade destroys a layout or knowledge base.
*Controls:* every document write snapshots the previous revision; a migration
takes a backup before its first step and refuses files written by a newer
version; corrupt files produce an actionable error rather than a crash; Safe Mode
can start with extensions, workflows and MCP disabled; backups are checksummed
and verified.

## 2. Standing rules

Nexus OS does **not**, under any circumstance:

- disable System Integrity Protection, Gatekeeper or the hardened runtime
- use private Apple APIs, kernel extensions, or code injection into other apps
- circumvent `X-Frame-Options`, Content Security Policy or any authentication flow
- read browser cookies or copy authentication tokens from other applications
- request, store or log a seed phrase or private key
- execute a shell command proposed by a model
- present cached, estimated or sample data as live

## 3. What is verified, and how

| Property | Verified by |
| --- | --- |
| Secret redaction across provider key shapes, JWTs, PEM blocks, phrases | Unit tests (Swift + TypeScript) |
| SHA-256 / HMAC correctness | NIST and RFC 4231 published vectors |
| URL policy: schemes, private ranges, homographs, credentials-in-URL | Unit tests |
| Path traversal and symlink escape | Unit tests, including a symlink pointing outside a root |
| Script-bearing image polyglot rejection | Unit test with a valid PNG header followed by `<script>` |
| Webhook forgery, tampering, replay and staleness | Unit tests |
| Permission matrix across all five modes and four impacts | Unit tests |
| Trusted Workspace still confirming destructive and model-origin system actions | Unit tests |
| Untrusted content cannot act without authorisation | Unit tests |

Reporting a vulnerability: open a private security advisory on the repository.
Please do not file a public issue for an exploitable defect.
