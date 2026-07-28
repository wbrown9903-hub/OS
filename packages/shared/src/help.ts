/**
 * Tutorial and help content, as data.
 *
 * Nothing here is JSX. The same structure feeds the help centre, the "What is
 * this?" popovers, the onboarding checklist and `GET /api/search`, so a topic is
 * written once and appears everywhere it is relevant. Adding a topic is adding an
 * object to `helpTopics` — there is no component to write.
 *
 * Content rules followed throughout:
 *   - every step is something a person can actually do,
 *   - every warning says what could go wrong and how to avoid it,
 *   - nothing claims a feature exists that has not been built,
 *   - no invented prices, no invented figures.
 */

export type HelpCategory =
  | "Getting started"
  | "Security"
  | "Connections"
  | "AI"
  | "Automation"
  | "Customising"
  | "Data"
  | "Help";

export type HelpLevel = "beginner" | "intermediate" | "advanced";

export interface HelpStep {
  title: string;
  detail: string;
  /** Optional aside — a caveat, a shortcut, or what the person should expect to see. */
  note?: string;
}

export interface HelpSection {
  heading: string;
  body?: string;
  steps?: HelpStep[];
  bullets?: string[];
  /** Rendered as a caution panel. Used sparingly, only where money or data is at risk. */
  warning?: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  category: HelpCategory;
  level: HelpLevel;
  /** Honest reading/doing time in minutes. */
  minutes: number;
  /** Extra words that should find this topic in search. */
  keywords: string[];
  sections: HelpSection[];
  related: string[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: "onboarding",
    title: "Your first ten minutes with Nexus OS",
    summary:
      "What Nexus OS is, what the three parts do, and the shortest path to a desktop that is actually yours.",
    category: "Getting started",
    level: "beginner",
    minutes: 8,
    keywords: ["start", "setup", "first run", "welcome", "new", "install", "tour"],
    sections: [
      {
        heading: "What you are looking at",
        body: "Nexus OS is three programs that cooperate. Knowing which is which makes every other page make sense.",
        bullets: [
          "Nexus Cloud is the interface — pages, widgets, the Brain, workflows. It runs in a window and has no access to your Mac.",
          "Nexus Desktop is the Mac app that hosts that interface so it feels native rather than like a browser tab.",
          "Nexus Bridge is a small local service that performs a fixed list of safe actions on your Mac, such as opening an app. Nothing else can reach your Mac.",
        ],
      },
      {
        heading: "Set up the essentials",
        steps: [
          {
            title: "Name your workspace",
            detail:
              "Open Settings › General and give this workspace a name. Workspaces group pages, so 'Work' and 'Gaming' can look and behave completely differently.",
          },
          {
            title: "Pick a theme and a density",
            detail:
              "Settings › Appearance. Every colour is a token, so switching themes is instant and never breaks a layout you built.",
            note: "If you use Reduce Motion or Increase Contrast in macOS, Nexus honours them automatically. You do not need to change anything.",
          },
          {
            title: "Add one widget you will actually look at",
            detail:
              "Press the Add Widget button on any page, pick something from the gallery, and drop it into a zone. Widgets store intent — which zone, how much room they want — so the same layout works on a laptop and a large display.",
          },
          {
            title: "Connect one service",
            detail:
              "Settings › Connections. Start with the one you use daily. Each connection tells you exactly what it can read and what it can change before you approve it.",
          },
        ],
      },
      {
        heading: "How editing works",
        body:
          "Every change you make is a transaction that knows how to undo itself. That single fact is why Undo, Redo, Version History, 'Reset this component', draft/publish and export all exist and all behave the same way. You cannot get into a state you cannot get out of.",
      },
      {
        heading: "If something is unavailable",
        body:
          "When a widget cannot show data — no connection, no permission, Bridge not running — it tells you why and offers the one action that fixes it. An empty box is a bug; please report it.",
      },
    ],
    related: ["permissions", "visual-editor", "backup-restore", "troubleshooting"],
  },

  {
    id: "permissions",
    title: "Permissions: what Nexus can and cannot do",
    summary:
      "The five permission modes, the four impact levels, and why a Trusted Workspace still asks before anything permanent.",
    category: "Security",
    level: "beginner",
    minutes: 7,
    keywords: ["permission", "security", "trust", "approve", "confirm", "safety", "mode", "deny"],
    sections: [
      {
        heading: "Authority comes from you, never from content",
        body:
          "A web page, an AI reply, a webhook or an imported file can suggest an action. None of them can authorise one. Only something you clicked or typed can. This is the rule the entire product is built around, and it is enforced in code, not by asking a model to behave.",
      },
      {
        heading: "The five modes",
        bullets: [
          "Disabled — nothing from this connection can run.",
          "Read Only — it may look at information, but may not change anything.",
          "Ask Every Time — you are asked before every single action. This is the default.",
          "Allow Selected Actions — only the actions you ticked can run without asking.",
          "Trusted Workspace — routine actions run without asking. Anything permanent still asks.",
        ],
      },
      {
        heading: "The four impact levels",
        bullets: [
          "Reads information — looks at something, changes nothing.",
          "Creates or changes information — writes a file, edits a note.",
          "Changes your Mac or an account — a system-level change.",
          "Permanently removes or sends something — deletion, money, messages. Irreversible.",
        ],
      },
      {
        heading: "Two rules that never bend",
        bullets: [
          "A tool on your deny list is refused in every mode, including Trusted Workspace.",
          "In Trusted Workspace, anything irreversible still asks, and a system-level action requested by an AI rather than by you still asks.",
        ],
        warning:
          "If you are ever asked to approve something you did not initiate, decline it and open Settings › Audit. Every decision Nexus makes is recorded there with who asked and what happened.",
      },
      {
        heading: "Where to change this",
        body:
          "Settings › Permissions for the overall policy, or the Tools tab of an individual connection for per-tool control. Beginner mode hides advanced fields; it never weakens the rules above.",
      },
    ],
    related: ["mcp-beginner", "mcp-advanced", "crypto-safety", "onboarding"],
  },

  {
    id: "runescape-setup",
    title: "Set up the RuneScape widgets",
    summary:
      "Track levels, XP and Grand Exchange prices using RuneScape's public data. No password, no account link, no third-party client.",
    category: "Connections",
    level: "beginner",
    minutes: 6,
    keywords: ["runescape", "osrs", "rs3", "hiscores", "grand exchange", "ge", "xp", "game"],
    sections: [
      {
        heading: "What you need",
        body:
          "Only your public display name. Nexus reads Jagex's public hiscores and Grand Exchange endpoints — the same information anyone can look up on the website.",
        warning:
          "Nexus will never ask for your RuneScape password, your bank PIN or your authenticator code, and it cannot log in or play for you. Anything that asks for those is not Nexus. Automating gameplay breaks Jagex's rules and Nexus does not do it.",
      },
      {
        heading: "Connect",
        steps: [
          {
            title: "Open Settings › Connections › RuneScape",
            detail: "Choose Set Up.",
          },
          {
            title: "Enter your display name",
            detail:
              "Type it exactly as it appears in game, including spaces. Choose the game version you play — the hiscores are separate for each.",
            note: "If your account is set to private on the hiscores, no data will come back. That is a Jagex setting, not a Nexus one.",
          },
          {
            title: "Choose Test Connection",
            detail:
              "You should see your total level come back. If it says the player was not found, check for a typo or a different game version.",
          },
        ],
      },
      {
        heading: "Add the widgets",
        bullets: [
          "Skills — your levels and XP, with the amount remaining to the next level.",
          "Grand Exchange — prices for the items you choose to watch. Every number is labelled Live, Cached or Last updated, because prices move.",
          "Goals — set a target level and watch progress. Progress is calculated from the hiscores, never estimated.",
        ],
      },
      {
        heading: "How often it refreshes",
        body:
          "Each widget has a refresh interval you control in its inspector. Nexus caches results and always labels how old a number is, so you are never shown a stale figure that looks current. The public endpoints are rate limited; leaving intervals short does not make data arrive faster.",
      },
    ],
    related: ["permissions", "visual-editor", "troubleshooting"],
  },

  {
    id: "claude-setup",
    title: "Connect Claude (Anthropic)",
    summary: "Add an Anthropic API key so the AI workspace can use Claude, and understand what gets sent.",
    category: "AI",
    level: "beginner",
    minutes: 6,
    keywords: ["claude", "anthropic", "api key", "ai", "assistant", "llm", "sk-ant"],
    sections: [
      {
        heading: "Get a key",
        steps: [
          {
            title: "Create an API key in the Anthropic Console",
            detail:
              "Sign in at console.anthropic.com, open the API keys section and create a key. Anthropic shows the key once — copy it before you close the dialog.",
            note: "An Anthropic API key starts with sk-ant-. API access is billed separately from a Claude subscription; you need credit on the API account for requests to succeed.",
          },
          {
            title: "Paste it into Nexus",
            detail:
              "Settings › Connections › Claude › Set Up. Paste the key and choose Save. Nexus encrypts it immediately with a key derived from this server's master key and your own salt.",
          },
          {
            title: "Choose Test Connection",
            detail:
              "Nexus makes one small request. A success means the key is valid and has credit. An authentication failure means the key was mistyped, revoked, or belongs to a different organisation.",
          },
        ],
      },
      {
        heading: "What Nexus does with the key",
        bullets: [
          "It is stored encrypted. The plaintext exists only in memory for the duration of one outbound request.",
          "It is never written into a configuration document, an export, a backup, a log, a notification or a URL.",
          "The interface only ever shows you the last four characters, so you can tell two keys apart without either being usable.",
        ],
      },
      {
        heading: "What gets sent to Anthropic",
        body:
          "Only what you include in a conversation, plus any memory you have explicitly allowed to be shared. Open Brain › Memory › Sharing to see exactly which memories have been sent to which provider — that list is recorded per item, not estimated.",
        warning:
          "Text from a web page, a document or a tool result is data, not instructions. If such content tries to tell the assistant to take an action, Nexus flags it and still refuses to act on it without your approval.",
      },
      {
        heading: "Removing the key",
        body:
          "Settings › Connections › Claude › Remove deletes the encrypted record from the database. Revoke the key in the Anthropic Console as well if you believe it was exposed — deleting it here does not disable it upstream.",
      },
    ],
    related: ["chatgpt-setup", "permissions", "mcp-beginner", "crypto-safety"],
  },

  {
    id: "chatgpt-setup",
    title: "Connect ChatGPT (OpenAI)",
    summary: "Add an OpenAI API key, and know the difference between an API key and your ChatGPT subscription.",
    category: "AI",
    level: "beginner",
    minutes: 5,
    keywords: ["chatgpt", "openai", "gpt", "api key", "ai", "assistant"],
    sections: [
      {
        heading: "An API key is not your ChatGPT login",
        body:
          "A ChatGPT Plus subscription and OpenAI API credit are separate products with separate billing. Nexus needs an API key from platform.openai.com; your chat.openai.com password will not work and Nexus will never ask for it.",
      },
      {
        heading: "Get a key",
        steps: [
          {
            title: "Create the key",
            detail:
              "Sign in at platform.openai.com, open API keys, and create a secret key. It is shown once — copy it immediately.",
            note: "OpenAI keys begin with sk-. If your account is part of an organisation you may also need to select the right project when creating the key.",
          },
          {
            title: "Add billing if the account is new",
            detail:
              "A brand-new API account with no credit returns a quota error on the first request. That is an OpenAI account state, not a Nexus fault — Nexus will tell you exactly which of the two it saw.",
          },
          {
            title: "Paste and test",
            detail:
              "Settings › Connections › ChatGPT › Set Up, paste the key, choose Test Connection.",
          },
        ],
      },
      {
        heading: "Same storage rules as every other credential",
        bullets: [
          "Encrypted at rest with a per-user key.",
          "Only the last four characters are ever displayed.",
          "Never included in an export, a backup, a log or a shared link.",
        ],
      },
    ],
    related: ["claude-setup", "permissions", "crypto-safety"],
  },

  {
    id: "mcp-beginner",
    title: "MCP for beginners: giving the assistant tools",
    summary:
      "What the Model Context Protocol is, in plain language, and how to add your first server safely.",
    category: "AI",
    level: "beginner",
    minutes: 9,
    keywords: ["mcp", "model context protocol", "tools", "server", "connector", "plugin"],
    sections: [
      {
        heading: "The idea in one paragraph",
        body:
          "On its own, an assistant can only talk. MCP is a common language that lets it use tools — read a file, search a database, create an issue. An MCP server is a small program that offers a fixed list of tools. You choose which servers exist and which of their tools may run.",
      },
      {
        heading: "Two kinds of server",
        bullets: [
          "Local — a program on your Mac that Nexus starts and talks to over its own input and output. Nothing leaves your machine.",
          "Remote — an HTTPS address run by someone else. Nexus validates the address before contacting it and refuses private or internal addresses unless you have explicitly allowed a local service.",
        ],
      },
      {
        heading: "Add your first server",
        steps: [
          {
            title: "Open Settings › MCP › Add Server",
            detail: "Give it a name you will recognise later. The name is only for you.",
          },
          {
            title: "Choose the transport",
            detail:
              "Pick Local Program if you were given a command to run, or Remote Address if you were given an https:// URL.",
          },
          {
            title: "Leave the mode on Ask Every Time",
            detail:
              "This is the default and it is the right starting point. You will be shown each tool the first time it is used, with a plain description of what it does and what it can reach.",
          },
          {
            title: "Review the discovered tools",
            detail:
              "Nexus lists every tool the server offers with its impact level. Turn off anything you do not want available at all — a tool that is off cannot be re-enabled by the server or by the assistant.",
            note: "A server that changes its tool list later cannot silently gain permission. New tools arrive disabled and you are told they appeared.",
          },
        ],
      },
      {
        heading: "How to think about safety",
        bullets: [
          "Only add servers from a source you trust. A server can do whatever its tools say it can.",
          "Read the impact label, not the tool name. 'Sync' can mean delete.",
          "Start in Ask Every Time. Move to Allow Selected Actions once you know which tools you actually use.",
        ],
        warning:
          "An MCP server can return text that tries to instruct the assistant. Nexus treats every tool result as untrusted data and will flag suspicious content, but the real protection is that a tool result can never grant permission by itself.",
      },
    ],
    related: ["mcp-advanced", "permissions", "claude-setup", "workflows"],
  },

  {
    id: "mcp-advanced",
    title: "MCP in depth: transports, scopes and hardening",
    summary:
      "Environment variables, allow and deny lists, timeouts, retries, and how to audit what a server actually did.",
    category: "AI",
    level: "advanced",
    minutes: 12,
    keywords: ["mcp", "advanced", "stdio", "http", "env", "scopes", "timeout", "audit", "hardening"],
    sections: [
      {
        heading: "Transports",
        bullets: [
          "stdio — Nexus launches the command you name and speaks over its standard input and output. The process inherits only the environment variables you list, nothing else.",
          "http — Nexus contacts an https:// endpoint. The URL is validated on every call, not just at setup: no http, no embedded credentials, no private, loopback or link-local addresses, and no cloud metadata endpoints.",
        ],
      },
      {
        heading: "Secrets for a server",
        body:
          "List the environment variable names the server needs, then store each value as a credential. Nexus injects them at launch and nowhere else. The values never appear in the server record, an export, a backup or a log — only the variable names do.",
        warning:
          "Never put a secret in the command line or in an argument. Arguments are visible to other processes on the machine and are recorded in the audit trail; environment values are not.",
      },
      {
        heading: "Allow and deny lists",
        bullets: [
          "The deny list is absolute. A denied tool is refused before the mode is even consulted, in every mode including Trusted Workspace.",
          "The allow list only has meaning in Allow Selected Actions. Anything not ticked falls back to asking — it is not silently refused, so you always find out a tool wanted to run.",
          "'Confirm destructive actions' stays on unless you deliberately turn it off, and it applies even to tools you allowed.",
        ],
      },
      {
        heading: "Timeouts and retries",
        body:
          "A slow server should fail visibly rather than hang the interface. Set a timeout that reflects what the tool really does — a file read is not a build. Retries only apply to connection failures, never to a tool that already ran, because retrying a completed write is how duplicates happen.",
      },
      {
        heading: "Auditing",
        body:
          "Every permission decision writes an audit event: what was requested, what impact it had, where the request came from (you, the system, a model, or an outside source), and what was decided. Open Settings › Audit and filter by the server name. Audit text is redacted before it is written, so a tool that echoed a key back does not leak it into the log.",
      },
      {
        heading: "When a server misbehaves",
        steps: [
          {
            title: "Set the mode to Disabled",
            detail: "This stops everything from that server immediately, without deleting your configuration.",
          },
          {
            title: "Read the audit trail",
            detail: "Filter by the server and look for anything with a destructive or system impact.",
          },
          {
            title: "Rotate anything it could reach",
            detail:
              "If the server had credentials in its environment, treat those credentials as exposed and rotate them at the source.",
          },
        ],
      },
    ],
    related: ["mcp-beginner", "permissions", "workflows", "troubleshooting"],
  },

  {
    id: "shopify-setup",
    title: "Connect a Shopify store",
    summary:
      "Create a custom app, choose the smallest scopes that work, and verify webhooks so a sale is never counted twice.",
    category: "Connections",
    level: "intermediate",
    minutes: 11,
    keywords: ["shopify", "store", "commerce", "orders", "webhook", "shpat", "sales"],
    sections: [
      {
        heading: "Create a custom app",
        steps: [
          {
            title: "Open your Shopify admin",
            detail: "Settings › Apps and sales channels › Develop apps › Create an app. Name it something you will recognise, such as 'Nexus OS'.",
          },
          {
            title: "Configure Admin API scopes",
            detail:
              "Grant only what the widgets you want actually need. Read access to orders and products covers the dashboard widgets. Do not grant write access unless you are going to use a workflow that writes.",
            note: "You can add a scope later. Removing one after the fact requires reinstalling the app, so start small.",
          },
          {
            title: "Install the app and copy the access token",
            detail:
              "Shopify shows the Admin API access token once. It starts with shpat_. Copy it before leaving the page.",
          },
          {
            title: "Add it to Nexus",
            detail:
              "Settings › Connections › Shopify › Set Up. Enter your shop domain (the myshopify.com one, not a custom domain) and paste the token. Choose Test Connection.",
          },
        ],
      },
      {
        heading: "Webhooks and the duplicate-sale problem",
        body:
          "If you want live order notifications, Shopify sends a signed webhook for each event. Nexus verifies three independent things before anything happens: the HMAC signature matches the shared secret, the delivery is recent enough to be genuine, and the delivery identifier has not been seen before.",
        bullets: [
          "A forged delivery fails the signature check and is dropped.",
          "A replayed delivery is recognised by its identifier and ignored.",
          "A delivery that arrived far too late is refused, because a stale event is usually a captured one.",
        ],
        warning:
          "That third check is why a sale sound never plays twice. If you ever see a duplicate, it is a bug worth reporting — do not work around it by disabling the sound.",
      },
      {
        heading: "What the numbers mean",
        body:
          "Every commerce figure is labelled with where it came from and when: Live, Cached, or Last updated at a specific time. Nexus never shows a total without saying how current it is, and it never estimates a figure it could not fetch.",
      },
    ],
    related: ["wordpress-setup", "workflows", "permissions", "troubleshooting"],
  },

  {
    id: "wordpress-setup",
    title: "Connect a WordPress site",
    summary:
      "Use an application password over HTTPS, and what to do when your site is self-hosted on your own network.",
    category: "Connections",
    level: "intermediate",
    minutes: 8,
    keywords: ["wordpress", "wp", "site", "application password", "rest api", "blog", "cms"],
    sections: [
      {
        heading: "Use an application password, not your login",
        body:
          "WordPress has built in application passwords since version 5.6. They are per-application, individually revocable, and cannot be used to sign into the admin area — which is exactly what you want for a connection like this.",
        steps: [
          {
            title: "Open your WordPress profile",
            detail: "Users › Profile, then scroll to Application Passwords.",
          },
          {
            title: "Create one named 'Nexus OS'",
            detail:
              "WordPress shows a password made of groups of characters separated by spaces. Copy it exactly, spaces included.",
            note: "If the section is missing, your site is being served over plain http, or a security plugin has disabled the feature. Both are worth fixing regardless of Nexus.",
          },
          {
            title: "Add the connection",
            detail:
              "Settings › Connections › WordPress › Set Up. Enter the site address, your username, and the application password. Choose Test Connection.",
          },
        ],
      },
      {
        heading: "Self-hosted on your own network",
        body:
          "By default Nexus refuses to contact private, loopback and link-local addresses — that restriction is what stops a malicious link or feed from making the server probe your internal network. A WordPress install on your LAN is the legitimate exception, so mark the connection as a local service when you add it. That permission applies to that connection only.",
        warning:
          "Do not disable the local-address restriction globally to make one site work. Grant it per connection so an unrelated widget cannot inherit it.",
      },
      {
        heading: "Revoking access",
        body:
          "Delete the application password in WordPress and the connection in Nexus. Deleting only the Nexus side leaves a working credential on your site.",
      },
    ],
    related: ["shopify-setup", "permissions", "troubleshooting"],
  },

  {
    id: "google-drive-setup",
    title: "Connect Google Drive",
    summary: "What Nexus asks for, why it asks for the narrower scope, and how to disconnect completely.",
    category: "Connections",
    level: "intermediate",
    minutes: 7,
    keywords: ["google", "drive", "docs", "oauth", "files", "cloud storage"],
    sections: [
      {
        heading: "How the sign-in works",
        body:
          "Google Drive uses OAuth: you sign in on Google's own page and approve a specific list of permissions. Nexus never sees your Google password. What comes back is a token that can be revoked from your Google account at any time.",
      },
      {
        heading: "Connect",
        steps: [
          {
            title: "Open Settings › Connections › Google Drive › Set Up",
            detail: "Nexus opens Google's consent page in your browser.",
          },
          {
            title: "Read the permission list before approving",
            detail:
              "Nexus asks for read access to file metadata and content it needs to index for search. If a screen asks for more than you expected, cancel — nothing is stored until you approve.",
          },
          {
            title: "Return to Nexus",
            detail: "The connection card moves to Connected and tells you what it can see.",
          },
        ],
      },
      {
        heading: "What is indexed",
        body:
          "Only file names, locations and the text Nexus needs to answer 'where is that file'. Indexed text lives in your own Brain database. It is not sent to any AI provider unless you ask a question that includes it, and Brain › Memory › Sharing records every time that happens.",
      },
      {
        heading: "Disconnecting",
        steps: [
          {
            title: "Remove the connection in Nexus",
            detail: "Settings › Connections › Google Drive › Remove. This deletes the stored token and the index.",
          },
          {
            title: "Revoke at Google as well",
            detail:
              "Visit your Google Account's security settings and remove Nexus from third-party access. Removing the connection here cannot revoke a token upstream.",
          },
        ],
      },
    ],
    related: ["github-setup", "permissions", "crypto-safety"],
  },

  {
    id: "github-setup",
    title: "Connect GitHub",
    summary: "Fine-grained tokens, choosing repositories deliberately, and why read access is usually enough.",
    category: "Connections",
    level: "intermediate",
    minutes: 8,
    keywords: ["github", "git", "repository", "token", "pat", "issues", "pull request"],
    sections: [
      {
        heading: "Prefer a fine-grained token",
        body:
          "GitHub offers classic tokens and fine-grained personal access tokens. Use fine-grained: you choose exactly which repositories the token can reach and exactly which permissions it has, and it expires on a date you set.",
        steps: [
          {
            title: "Create the token",
            detail:
              "GitHub › Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token.",
            note: "Fine-grained tokens begin with github_pat_. Classic tokens begin with ghp_ and grant access to everything your account can reach, which is why they are the second choice.",
          },
          {
            title: "Select only the repositories you want visible",
            detail:
              "'All repositories' is convenient and almost never what you actually need. Pick them explicitly.",
          },
          {
            title: "Grant read permissions first",
            detail:
              "Contents: read and Issues: read cover the dashboard widgets. Add write only when you set up a workflow that genuinely writes, and expect Nexus to confirm each write.",
          },
          {
            title: "Add it to Nexus",
            detail: "Settings › Connections › GitHub › Set Up, paste the token, choose Test Connection.",
          },
        ],
      },
      {
        heading: "Expiry is a feature",
        body:
          "When the token expires the connection card changes to 'Sign-in failed' with the next step, rather than failing silently. Set a reasonable expiry and rotate it — a token that never expires is a token you will forget you created.",
      },
      {
        heading: "If a token leaks",
        warning:
          "Revoke it at GitHub first, then remove the connection here. Revoking upstream is the only action that actually stops it being used. GitHub also scans public repositories for leaked tokens and may revoke one automatically — if a connection suddenly fails, check your GitHub email.",
      },
    ],
    related: ["google-drive-setup", "mcp-advanced", "permissions"],
  },

  {
    id: "crypto-safety",
    title: "Crypto safety: watch-only, always",
    summary:
      "Nexus tracks wallet balances you paste in as public addresses. It never asks for a seed phrase or a private key, and never will.",
    category: "Security",
    level: "beginner",
    minutes: 6,
    keywords: ["crypto", "wallet", "seed phrase", "private key", "bitcoin", "ethereum", "scam", "recovery phrase"],
    sections: [
      {
        heading: "The one rule",
        body:
          "Nexus is watch-only. You give it a public address — the one you would give someone to receive funds — and it shows you the balance. It cannot move funds, sign a transaction, or connect to a wallet application, because it never holds anything capable of doing so.",
        warning:
          "Nexus will never ask for a recovery phrase, a seed phrase, a private key or a keystore file. Any screen that does is not Nexus. Close it, and do not type the words anywhere.",
      },
      {
        heading: "What Nexus does if it sees a phrase anyway",
        body:
          "The redaction layer recognises the shape of a BIP-39 recovery phrase. If one appears in a note, a log, a diagnostic export or an AI payload, it is replaced before it is written anywhere, and you are warned. This is a safety net for an accidental paste, not permission to store one.",
      },
      {
        heading: "Adding an address to watch",
        steps: [
          {
            title: "Open Settings › Connections › Wallets",
            detail: "Choose Add Address.",
          },
          {
            title: "Paste the public address",
            detail:
              "Give it a label you will recognise. Check the first and last few characters against the source — address-swapping malware is real and Nexus cannot detect it for you.",
          },
          {
            title: "Confirm what is shown",
            detail:
              "Balances come from a public block explorer and are labelled with how fresh they are. A balance is never presented as a live figure when it was cached.",
          },
        ],
      },
      {
        heading: "Recognising the common scam",
        bullets: [
          "'Validate' or 'sync' your wallet — no legitimate tool needs your phrase to read a balance.",
          "Support that contacts you first and asks for a phrase to 'restore' access.",
          "A site that asks for a phrase to claim an airdrop or unlock funds.",
        ],
      },
    ],
    related: ["permissions", "claude-setup", "backup-restore"],
  },

  {
    id: "workflows",
    title: "Build a workflow",
    summary:
      "Trigger, steps, and approval. How to test one safely with a dry run before it can touch anything real.",
    category: "Automation",
    level: "intermediate",
    minutes: 10,
    keywords: ["workflow", "automation", "trigger", "schedule", "steps", "dry run", "approval"],
    sections: [
      {
        heading: "A workflow is three things",
        bullets: [
          "A trigger — a schedule, a webhook, an event inside Nexus, or you pressing a button.",
          "Steps — each one names an action that already exists and is already validated. There is no free-form command step, deliberately.",
          "An approval policy — which steps run on their own and which stop and ask you first.",
        ],
      },
      {
        heading: "Build one",
        steps: [
          {
            title: "Open Workflows › New",
            detail: "Name it after what it achieves, not how it works. 'Morning briefing' beats 'GET then notify'.",
          },
          {
            title: "Pick the trigger",
            detail:
              "A schedule is the easiest to reason about. A webhook trigger is verified and de-duplicated exactly like a Shopify delivery, so the same event cannot fire your workflow twice.",
          },
          {
            title: "Add steps",
            detail:
              "Each step shows its impact level as you add it. The editor totals them, so you can see at a glance whether this workflow can delete or send anything.",
          },
          {
            title: "Dry run it",
            detail:
              "Choose Dry Run. Every step is evaluated and every input is validated, but nothing that changes the world actually runs. You get the full step-by-step result to read before committing.",
            note: "A dry run is the only safe way to test a workflow that sends messages or spends money. Use it every time you change one.",
          },
          {
            title: "Enable it",
            detail: "A workflow stays disabled until you turn it on. Nothing runs by accident because you saved a draft.",
          },
        ],
      },
      {
        heading: "Approvals",
        body:
          "Any step with a destructive impact pauses and asks, and the run waits in 'Waiting for approval' until you answer. That is true regardless of the workspace's trust setting. If nobody answers, the run expires rather than proceeding.",
      },
      {
        heading: "When a run fails",
        body:
          "Open the run in Workflows › History. Every step records what it received, what it decided and what happened, with secrets redacted. Failed runs never partially commit a transaction against your configuration — the whole edit applies or none of it does.",
      },
    ],
    related: ["mcp-advanced", "permissions", "shopify-setup", "troubleshooting"],
  },

  {
    id: "visual-editor",
    title: "Nexus Studio: change anything you can see",
    summary:
      "The inspector, the intent grid, version history, and draft versus live. Nothing you do here can be lost.",
    category: "Customising",
    level: "beginner",
    minutes: 9,
    keywords: ["studio", "editor", "layout", "widget", "inspector", "theme", "undo", "publish", "draft"],
    sections: [
      {
        heading: "Layout stores intent, not pixels",
        body:
          "A widget declares which zone it belongs to, how many of twelve columns it wants, how important it is, and when it should be visible. Nexus computes actual pixels for the display you are on. That is why one layout is correct on a laptop, an external display and a narrow window without you maintaining three of them.",
      },
      {
        heading: "The inspector",
        body:
          "Select a widget and the right panel shows every setting it has, grouped and explained. There is no per-widget editor code anywhere in Nexus — the panel is generated from the widget's own declaration, which is why the editor and the widget can never disagree about what a setting means.",
        bullets: [
          "Beginner mode hides advanced fields. It never hides a security setting.",
          "Every field has a 'What is this?' explanation written for a person, not a developer.",
          "Reset returns one setting, one widget, or a whole page to its defaults — and that reset is itself undoable.",
        ],
      },
      {
        heading: "Undo, history and publish",
        steps: [
          {
            title: "Undo and redo",
            detail:
              "Every edit knows its own exact inverse, so undo is not an approximation. The tooltip names the edit you are about to undo.",
          },
          {
            title: "Version history",
            detail:
              "Settings › Version History lists every committed change with a label and a time. Restoring an old version is itself a normal edit, so you can undo the restore.",
          },
          {
            title: "Draft and publish",
            detail:
              "Work in a draft when you are rebuilding a page you rely on. The live version stays exactly as it was until you choose Publish.",
          },
        ],
      },
      {
        heading: "Accessibility is resolved, not remembered",
        body:
          "If macOS is set to reduce motion, animation is clamped to zero. If it is set to reduce transparency or increase contrast, panels become opaque. You do not toggle anything and you cannot accidentally build a layout that ignores those settings.",
      },
      {
        heading: "Two windows, one document",
        body:
          "If the layout changed in another window while you were editing, saving returns a clear conflict message rather than silently overwriting. Reload and reapply — your edit is described in the message so you know what to redo.",
      },
    ],
    related: ["onboarding", "backup-restore", "troubleshooting"],
  },

  {
    id: "backup-restore",
    title: "Back up and restore",
    summary:
      "What a backup contains, what it deliberately does not, and how to verify one before you rely on it.",
    category: "Data",
    level: "beginner",
    minutes: 7,
    keywords: ["backup", "restore", "export", "import", "checksum", "recovery", "migrate"],
    sections: [
      {
        heading: "What is in a backup",
        bullets: [
          "Your configuration document — pages, zones, widgets, workspaces, dock and preferences.",
          "Your Brain — knowledge items with their version history, tags and links.",
          "Your memory records, workflow definitions and connection settings.",
        ],
      },
      {
        heading: "What is deliberately not in a backup",
        body:
          "No credentials, no API keys, no tokens, no session cookies. A backup is a file you might email to yourself, so it must be safe if it ends up somewhere it should not. After restoring, you re-enter credentials once. That is the trade, and it is the right one.",
      },
      {
        heading: "Make one",
        steps: [
          {
            title: "Settings › Backup › Create Backup",
            detail:
              "Nexus writes the file, records its size, and computes a SHA-256 checksum of the exact bytes.",
          },
          {
            title: "Verify it",
            detail:
              "Choose Verify. Nexus re-reads the file, recomputes the checksum and compares. A backup you have not verified is a hope, not a backup.",
            note: "Verification also parses the contents, so a file that is intact but structurally wrong is caught here rather than during a restore.",
          },
          {
            title: "Copy it somewhere else",
            detail:
              "A backup on the same disk as the original protects you from mistakes, not from disk failure.",
          },
        ],
      },
      {
        heading: "Restore",
        steps: [
          {
            title: "Settings › Backup › Restore",
            detail: "Pick a backup. Nexus verifies the checksum before reading anything from it.",
          },
          {
            title: "Read the summary",
            detail:
              "You are told exactly what will be replaced and how many items of each kind the file contains, before anything changes.",
          },
          {
            title: "Confirm",
            detail:
              "The restore is applied as one transaction. If any part fails, nothing is changed — you never end up half-restored.",
          },
        ],
        warning:
          "Restoring replaces your current configuration. Nexus takes an automatic backup immediately before it does, so the state you are leaving is always recoverable.",
      },
    ],
    related: ["uninstall", "visual-editor", "troubleshooting"],
  },

  {
    id: "uninstall",
    title: "Uninstall Nexus OS completely",
    summary: "How to leave, take your data with you, and be certain nothing is left behind.",
    category: "Data",
    level: "beginner",
    minutes: 5,
    keywords: ["uninstall", "remove", "delete", "leave", "wipe", "erase", "cleanup"],
    sections: [
      {
        heading: "Take your data first",
        steps: [
          {
            title: "Export a backup",
            detail: "Settings › Backup › Create Backup, then verify it and copy it somewhere you control.",
          },
          {
            title: "Export your Brain separately if you want plain files",
            detail:
              "Brain › Export produces readable files rather than a Nexus-shaped archive, so your notes remain useful without Nexus.",
          },
        ],
      },
      {
        heading: "Revoke access at each service",
        body:
          "Deleting Nexus does not revoke a token upstream. For each connection you set up, go to that service and revoke the key or application password. This is the step people skip and it is the one that matters.",
        bullets: [
          "Anthropic and OpenAI — delete the API key in the provider's console.",
          "GitHub — revoke the personal access token.",
          "Google — remove Nexus from third-party access in your account security settings.",
          "Shopify — uninstall the custom app. WordPress — delete the application password.",
        ],
      },
      {
        heading: "Remove the software",
        steps: [
          {
            title: "Quit Nexus Desktop and the Bridge",
            detail: "Quit from the menu bar. The Bridge stops with it; nothing keeps running in the background.",
          },
          {
            title: "Delete the application",
            detail: "Drag Nexus from your Applications folder to the Trash and empty it.",
          },
          {
            title: "Delete the local data",
            detail:
              "Nexus keeps its database, uploaded media and backups in a single .nexus folder. Deleting that folder removes everything local. Nothing is stored anywhere else on the machine.",
            note: "If you want to be sure before deleting: Settings › About shows the exact path in use.",
          },
        ],
      },
      {
        heading: "You can always get back to plain macOS",
        body:
          "You never need to uninstall to escape the interface. Nexus Desktop has a visible exit that returns you to a normal desktop immediately, and it does not require a password or a confirmation.",
      },
    ],
    related: ["backup-restore", "troubleshooting", "permissions"],
  },

  {
    id: "troubleshooting",
    title: "When something is not working",
    summary: "The messages you might see, what each actually means, and the first thing to try.",
    category: "Help",
    level: "beginner",
    minutes: 9,
    keywords: ["troubleshoot", "error", "problem", "broken", "fix", "not working", "bridge", "offline"],
    sections: [
      {
        heading: "Nexus Desktop is not running",
        body:
          "A widget or action needs the Bridge and cannot reach it. The Bridge only runs while Nexus Desktop is open, and it only listens on your own machine — nothing on the network can reach it.",
        steps: [
          { title: "Open Nexus Desktop", detail: "Launch it from Applications. The Bridge starts with it." },
          {
            title: "Check the status dot",
            detail: "Settings › Bridge shows Connected, or the exact reason it is not.",
          },
          {
            title: "If it says the port is in use",
            detail:
              "Another copy of Nexus Desktop is probably already running. Quit both and open one.",
          },
        ],
      },
      {
        heading: "That address points at your own machine or local network",
        body:
          "A URL was rejected because it targets a private, loopback or link-local address. That protection is what stops a malicious feed from using the server to probe your network. If it is genuinely your own service, add it under Settings › Connections and mark it as a local service — that permission applies to that connection only.",
      },
      {
        heading: "The layout changed in another window",
        body:
          "You saved an edit based on a version that is no longer current. Nothing was lost and nothing was overwritten. Reload the page and make the edit again — the message names the change you were trying to save.",
      },
      {
        heading: "A connection says Sign-in failed",
        bullets: [
          "The credential expired — most tokens have an expiry date.",
          "The credential was revoked at the source.",
          "The credential was pasted with a trailing space or a missing character.",
        ],
        body: "Re-enter it and choose Test Connection. The result tells you which of the three it was.",
      },
      {
        heading: "That image file contains embedded web code",
        body:
          "An image was rejected because its actual bytes contain markup that would run if it were ever displayed as a page. Nexus checks bytes, not file extensions or the server's content type. Use a different image; this can indicate a tampered file.",
      },
      {
        heading: "Nothing here matches",
        steps: [
          {
            title: "Read the audit trail",
            detail:
              "Settings › Audit records every decision with its reason. Secrets are redacted before anything is written, so it is safe to read and safe to share.",
          },
          {
            title: "Export diagnostics",
            detail:
              "Settings › About › Export Diagnostics produces a file with versions, recent errors and connection states — with every credential-shaped value removed.",
          },
          {
            title: "Restore a known-good version",
            detail:
              "Settings › Version History, or Settings › Backup › Restore. Both are reversible, so trying one costs you nothing.",
          },
        ],
      },
    ],
    related: ["backup-restore", "permissions", "onboarding", "mcp-advanced"],
  },
];

const topicsById = new Map(helpTopics.map((topic) => [topic.id, topic]));

export function getHelpTopic(id: string): HelpTopic | undefined {
  return topicsById.get(id);
}

export function helpTopicIds(): string[] {
  return helpTopics.map((topic) => topic.id);
}

/** Category ordering used by the help centre and by search grouping. */
export const helpCategoryOrder: HelpCategory[] = [
  "Getting started",
  "Security",
  "Connections",
  "AI",
  "Automation",
  "Customising",
  "Data",
  "Help",
];

export function helpTopicsByCategory(): Array<{ category: HelpCategory; topics: HelpTopic[] }> {
  return helpCategoryOrder
    .map((category) => ({
      category,
      topics: helpTopics.filter((topic) => topic.category === category),
    }))
    .filter((group) => group.topics.length > 0);
}

/** Flattens a topic into the plain text used by the search index. */
export function helpTopicSearchText(topic: HelpTopic): string {
  const parts: string[] = [topic.title, topic.summary, topic.category, ...topic.keywords];
  for (const section of topic.sections) {
    parts.push(section.heading);
    if (section.body) parts.push(section.body);
    if (section.warning) parts.push(section.warning);
    for (const bullet of section.bullets ?? []) parts.push(bullet);
    for (const step of section.steps ?? []) {
      parts.push(step.title, step.detail);
      if (step.note) parts.push(step.note);
    }
  }
  return parts.join("\n");
}

/**
 * The first-run checklist. Each entry points at a real topic and a real place in
 * the interface — there is no step here that does not lead somewhere.
 */
export interface OnboardingTask {
  id: string;
  label: string;
  detail: string;
  topicId: string;
  href: string;
}

export const onboardingChecklist: OnboardingTask[] = [
  {
    id: "tour",
    label: "Take the two-minute tour",
    detail: "Learn what the three parts of Nexus OS are and which one does what.",
    topicId: "onboarding",
    href: "/help/onboarding",
  },
  {
    id: "appearance",
    label: "Choose how it looks",
    detail: "Pick a theme, a density and a corner radius. You can change any of it later.",
    topicId: "visual-editor",
    href: "/settings/appearance",
  },
  {
    id: "permissions",
    label: "Review what Nexus is allowed to do",
    detail: "The default is to ask before every action. Confirm that suits you.",
    topicId: "permissions",
    href: "/settings/permissions",
  },
  {
    id: "connection",
    label: "Connect your first service",
    detail: "Start with the one you use every day. Each connection shows exactly what it can reach.",
    topicId: "onboarding",
    href: "/settings/connections",
  },
  {
    id: "widget",
    label: "Add a widget to your home page",
    detail: "Open the gallery, pick something useful, and drop it into a zone.",
    topicId: "visual-editor",
    href: "/studio",
  },
  {
    id: "backup",
    label: "Make and verify a backup",
    detail: "Two minutes now saves an afternoon later. Verification is one click.",
    topicId: "backup-restore",
    href: "/settings/backup",
  },
];
