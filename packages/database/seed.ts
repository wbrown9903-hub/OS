import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { ConfigDocument } from "@nexus/schemas";

/**
 * Seeds a realistic default Nexus OS.
 *
 * Two rules govern everything in this file:
 *
 *  1. **Seeded content is configuration, never data.** Pages, zones, widget
 *     placement, workspaces, the dock and preferences are all things the product
 *     genuinely ships with. There are no invented orders, no invented balances,
 *     no invented followers and no sample notes pretending to be the user's. A
 *     first run is impressive because the *interface* is complete, not because a
 *     number was made up.
 *  2. **It runs standalone.** The only runtime imports are `node:crypto` and the
 *     Prisma client; the `@nexus/schemas` import is type-only and erases, so
 *     `node --experimental-strip-types packages/database/seed.ts` works without a
 *     bundler or a build step.
 *
 * `packages/database/src` re-exports `buildDefaultConfiguration` so the API can
 * provision a brand-new account with exactly the same document this seed writes.
 */

/* -------------------------------------------------------------------------- */
/* The default configuration document                                          */
/* -------------------------------------------------------------------------- */

export function buildDefaultConfiguration(options: { productName?: string } = {}): ConfigDocument {
  const productName = options.productName ?? "Nexus OS";

  return {
    schemaVersion: 1,
    revision: 0,
    productName,
    themeId: "nexus-obsidian",

    pages: [
      {
        id: "page-home",
        title: "Home",
        icon: "house",
        showInNavigation: true,
        zones: [
          { id: "hero", label: "Overview", layout: "row", collapsed: false },
          { id: "main", label: "Main", layout: "grid", collapsed: false },
          { id: "rail", label: "Side rail", layout: "column", collapsed: false },
        ],
        widgets: [
          {
            id: "w-home-clock",
            type: "essentials.clock",
            zone: "hero",
            order: 0,
            span: { columns: 3, rows: 2 },
            priority: 10,
            pinned: true,
            visibility: emptyVisibility(),
            settings: { title: "", format: "24h", showSeconds: false, showDate: true, timeZone: "" },
            refreshSeconds: 1,
            shortcut: null,
          },
          {
            id: "w-home-onboarding",
            type: "system.onboarding",
            zone: "hero",
            order: 1,
            span: { columns: 6, rows: 2 },
            priority: 5,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Get started", hideWhenComplete: true },
            refreshSeconds: 0,
            shortcut: null,
          },
          {
            id: "w-home-bridge",
            type: "system.bridgeStatus",
            zone: "hero",
            order: 2,
            span: { columns: 3, rows: 2 },
            priority: 30,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Desktop", showVersion: false },
            refreshSeconds: 30,
            shortcut: null,
          },
          {
            id: "w-home-search",
            type: "knowledge.search",
            zone: "main",
            order: 0,
            span: { columns: 7, rows: 4 },
            priority: 15,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Search your Brain", project: "", resultCount: 6, includeArchived: false },
            refreshSeconds: 0,
            shortcut: "cmd+shift+f",
          },
          {
            id: "w-home-recent",
            type: "knowledge.recent",
            zone: "main",
            order: 1,
            span: { columns: 5, rows: 4 },
            priority: 20,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Where you left off", count: 6, favouritesOnly: false },
            refreshSeconds: 120,
            shortcut: null,
          },
          {
            id: "w-home-links",
            type: "essentials.links",
            zone: "rail",
            order: 0,
            span: { columns: 3, rows: 3 },
            priority: 40,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Quick links", links: [], columns: 1 },
            refreshSeconds: 0,
            shortcut: null,
          },
          {
            id: "w-home-note",
            type: "essentials.note",
            zone: "rail",
            order: 1,
            span: { columns: 3, rows: 2 },
            priority: 60,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Scratch", body: "", emphasis: "quiet" },
            refreshSeconds: 0,
            shortcut: null,
          },
        ],
      },

      {
        id: "page-brain",
        title: "Brain",
        icon: "brain",
        showInNavigation: true,
        zones: [
          { id: "main", label: "Knowledge", layout: "grid", collapsed: false },
          { id: "rail", label: "Side rail", layout: "column", collapsed: false },
        ],
        widgets: [
          {
            id: "w-brain-search",
            type: "knowledge.search",
            zone: "main",
            order: 0,
            span: { columns: 8, rows: 6 },
            priority: 10,
            pinned: true,
            visibility: emptyVisibility(),
            settings: { title: "Everything you have filed", project: "", resultCount: 12, includeArchived: false },
            refreshSeconds: 0,
            shortcut: null,
          },
          {
            id: "w-brain-recent",
            type: "knowledge.recent",
            zone: "rail",
            order: 0,
            span: { columns: 4, rows: 4 },
            priority: 20,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Recently touched", count: 10, favouritesOnly: false },
            refreshSeconds: 120,
            shortcut: null,
          },
          {
            id: "w-brain-favourites",
            type: "knowledge.recent",
            zone: "rail",
            order: 1,
            span: { columns: 4, rows: 3 },
            priority: 30,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Favourites", count: 8, favouritesOnly: true },
            refreshSeconds: 300,
            shortcut: null,
          },
        ],
      },

      {
        id: "page-play",
        title: "Play",
        icon: "gamecontroller",
        showInNavigation: true,
        zones: [
          { id: "main", label: "Progress", layout: "grid", collapsed: false },
          { id: "rail", label: "Watching", layout: "column", collapsed: false },
        ],
        widgets: [
          {
            id: "w-play-skills",
            type: "runescape.skills",
            zone: "main",
            order: 0,
            span: { columns: 7, rows: 5 },
            priority: 10,
            pinned: false,
            visibility: { ...emptyVisibility(), requiresConnection: "runescape" },
            settings: { title: "Skills", skills: [], showRemainingXp: true },
            refreshSeconds: 900,
            shortcut: null,
          },
          {
            id: "w-play-ge",
            type: "runescape.grandExchange",
            zone: "rail",
            order: 0,
            span: { columns: 5, rows: 5 },
            priority: 20,
            pinned: false,
            visibility: { ...emptyVisibility(), requiresConnection: "runescape" },
            settings: { title: "Grand Exchange", items: [], showTrend: true },
            refreshSeconds: 1800,
            shortcut: null,
          },
          {
            id: "w-play-launcher",
            type: "system.launcher",
            zone: "main",
            order: 1,
            span: { columns: 5, rows: 2 },
            priority: 40,
            pinned: false,
            visibility: { ...emptyVisibility(), requiresBridge: true },
            settings: { title: "Launch", applications: [] },
            refreshSeconds: 0,
            shortcut: null,
          },
        ],
      },

      {
        id: "page-build",
        title: "Build",
        icon: "hammer",
        showInNavigation: true,
        zones: [
          { id: "main", label: "Automation", layout: "grid", collapsed: false },
          { id: "rail", label: "Repositories", layout: "column", collapsed: false },
        ],
        widgets: [
          {
            id: "w-build-runs",
            type: "automation.workflowRuns",
            zone: "main",
            order: 0,
            span: { columns: 7, rows: 4 },
            priority: 10,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Workflow runs", count: 8, onlyNeedingAttention: false },
            refreshSeconds: 60,
            shortcut: null,
          },
          {
            id: "w-build-issues",
            type: "developer.issues",
            zone: "rail",
            order: 0,
            span: { columns: 5, rows: 4 },
            priority: 20,
            pinned: false,
            visibility: { ...emptyVisibility(), requiresConnection: "github" },
            settings: { title: "Open issues", repository: "", state: "open", count: 8 },
            refreshSeconds: 600,
            shortcut: null,
          },
          {
            id: "w-build-note",
            type: "essentials.note",
            zone: "main",
            order: 1,
            span: { columns: 7, rows: 2 },
            priority: 50,
            pinned: false,
            visibility: emptyVisibility(),
            settings: { title: "Working notes", body: "", emphasis: "normal" },
            refreshSeconds: 0,
            shortcut: null,
          },
        ],
      },

      {
        id: "page-shop",
        title: "Shop",
        icon: "bag",
        // Hidden from navigation until a store is connected, so an empty page is
        // never presented as if it were broken.
        showInNavigation: false,
        zones: [{ id: "main", label: "Store", layout: "grid", collapsed: false }],
        widgets: [
          {
            id: "w-shop-orders",
            type: "commerce.orders",
            zone: "main",
            order: 0,
            span: { columns: 8, rows: 5 },
            priority: 10,
            pinned: false,
            visibility: { ...emptyVisibility(), requiresConnection: "shopify" },
            settings: {
              title: "Recent orders",
              count: 8,
              playSoundOnSale: false,
              sound: { mode: "builtIn", builtInId: "nexus-chime", uploadPath: null, volume: 0.6 },
            },
            refreshSeconds: 300,
            shortcut: null,
          },
        ],
      },
    ],

    workspaces: [
      {
        id: "ws-focus",
        title: "Focus",
        icon: "moon",
        onEnter: [{ type: "switchPage", target: "page-brain" }],
        pageIds: ["page-home", "page-brain", "page-build"],
        silencedCategories: ["commerce", "social"],
      },
      {
        id: "ws-play",
        title: "Play",
        icon: "gamecontroller",
        onEnter: [{ type: "switchPage", target: "page-play" }],
        pageIds: ["page-play", "page-home"],
        silencedCategories: ["workflow"],
      },
      {
        id: "ws-ship",
        title: "Ship",
        icon: "shippingbox",
        onEnter: [{ type: "switchPage", target: "page-build" }],
        pageIds: ["page-build", "page-shop", "page-home"],
        silencedCategories: [],
      },
    ],

    dock: [
      {
        id: "dock-home",
        label: "Home",
        icon: "house",
        action: { type: "switchPage", target: "page-home" },
        requiresApplication: null,
      },
      {
        id: "dock-brain",
        label: "Brain",
        icon: "brain",
        action: { type: "switchPage", target: "page-brain" },
        requiresApplication: null,
      },
      {
        id: "dock-studio",
        label: "Studio",
        icon: "paintbrush",
        action: { type: "openPanel", target: "studio" },
        requiresApplication: null,
      },
      {
        id: "dock-workflows",
        label: "Workflows",
        icon: "arrow.triangle.branch",
        action: { type: "switchPage", target: "page-build" },
        requiresApplication: null,
      },
      {
        id: "dock-help",
        label: "Help",
        icon: "questionmark.circle",
        action: { type: "openPanel", target: "help" },
        requiresApplication: null,
      },
      {
        id: "dock-settings",
        label: "Settings",
        icon: "gearshape",
        action: { type: "openPanel", target: "settings" },
        requiresApplication: null,
      },
    ],

    topBar: {
      enabled: true,
      showClock: true,
      showSearch: true,
      showSystemStatus: true,
      items: [
        { id: "tb-search", label: "Search", action: "openSearch" },
        { id: "tb-workspaces", label: "Workspaces", action: "openWorkspaceSwitcher" },
        { id: "tb-notifications", label: "Notifications", action: "openNotifications" },
      ],
    },

    preferences: {
      experienceLevel: "beginner",
      animationIntensity: 0.8,
      soundVolume: 0.5,
      soundsEnabled: true,
      cornerRadius: 14,
      panelTransparency: 0.72,
      density: "comfortable",
      fontId: "system",
      gamificationEnabled: true,
      quietHours: { enabled: false, from: 22, to: 7 },
    },
  };
}

function emptyVisibility() {
  return {
    requiresConnection: null,
    requiresBridge: false,
    requiresPermission: null,
    hours: null,
    minimumWidth: null,
    hidden: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Password hashing (kept local so this file has no package dependencies)      */
/* -------------------------------------------------------------------------- */

/**
 * The identical format `@nexus/security` produces and verifies:
 * `scrypt$N$r$p$salt$hash`, all base64. Duplicated here — rather than imported —
 * so the seed stays runnable by plain `node` with no resolver configuration.
 */
function hashPasswordForSeed(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return ["scrypt", "16384", "8", "1", salt.toString("base64"), hash.toString("base64")].join("$");
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

export interface SeedUserOptions {
  email: string;
  displayName: string;
  /** Omitted in local single-user mode, where a random unusable value is stored. */
  password?: string;
}

export interface SeedResult {
  userId: string;
  created: boolean;
  revision: number;
}

/**
 * Creates the account if it does not exist and gives it the default live and
 * draft configuration. Safe to run repeatedly: an existing account keeps its own
 * document untouched.
 */
export async function seedUser(prisma: PrismaClient, options: SeedUserOptions): Promise<SeedResult> {
  const email = options.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        displayName: options.displayName,
        passwordHash: hashPasswordForSeed(options.password ?? randomBytes(24).toString("base64")),
        encryptionSalt: randomBytes(16).toString("base64"),
        experience: "beginner",
      },
    }));

  const document = buildDefaultConfiguration();
  const serialised = JSON.stringify(document);

  const live = await prisma.configRecord.findUnique({
    where: { userId_channel: { userId: user.id, channel: "live" } },
  });

  if (!live) {
    await prisma.configRecord.create({
      data: {
        userId: user.id,
        channel: "live",
        schemaVersion: document.schemaVersion,
        revision: document.revision,
        document: serialised,
      },
    });
    await prisma.configRecord.create({
      data: {
        userId: user.id,
        channel: "draft",
        schemaVersion: document.schemaVersion,
        revision: document.revision,
        document: serialised,
      },
    });
    await prisma.notificationRecord.create({
      data: {
        userId: user.id,
        category: "system",
        priority: "normal",
        title: "Welcome to Nexus OS",
        body: "Six short steps on the Home page will get you to a workspace that is genuinely yours. Nothing is set up behind your back — every connection asks first.",
        href: "/help/onboarding",
      },
    });
    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        subject: "config.seed",
        summary: "Created the default configuration for a new account.",
        impact: "write",
        requestOrigin: "system",
        outcome: "completed",
        detail: `${document.pages.length} pages, ${document.workspaces.length} workspaces, ${document.dock.length} dock items.`,
      },
    });
  }

  return {
    userId: user.id,
    created: existing === null,
    revision: live?.revision ?? document.revision,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI entry point                                                             */
/* -------------------------------------------------------------------------- */

export async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const email = process.env.NEXUS_SEED_EMAIL ?? "local@nexus.os";
    const result = await seedUser(prisma, {
      email,
      displayName: process.env.NEXUS_SEED_NAME ?? "Local",
      ...(process.env.NEXUS_SEED_PASSWORD ? { password: process.env.NEXUS_SEED_PASSWORD } : {}),
    });
    const document = buildDefaultConfiguration();
    process.stdout.write(
      `Seeded ${email} (${result.created ? "created" : "already existed"}): ` +
        `${document.pages.length} pages, ${document.workspaces.length} workspaces, ` +
        `${document.dock.length} dock items, ` +
        `${document.pages.reduce((total, page) => total + page.widgets.length, 0)} widgets.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Runs only when executed directly, so importing this module in a test is free
// of side effects.
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Seeding failed: ${error instanceof Error ? error.message : String(error)}\n` +
        "Check that DATABASE_URL points at a database and that `npm run db:push` has been run.\n",
    );
    process.exitCode = 1;
  });
}
