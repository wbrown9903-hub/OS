import { PrismaClient } from "@prisma/client";
import {
  type ConfigDocument,
  type Operation,
  commit,
  configDocumentSchema,
} from "@nexus/schemas";

/**
 * Server-side configuration store.
 *
 * Local mode exists so the double-click experience needs no sign-up: a single
 * local user is provisioned on first request. Hosted deployments set
 * NEXUS_LOCAL_MODE=0 and use real sessions instead.
 */

const globalForPrisma = globalThis as unknown as { nexusPrisma?: PrismaClient };
export const prisma = globalForPrisma.nexusPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.nexusPrisma = prisma;

export const localModeEnabled = process.env.NEXUS_LOCAL_MODE !== "0";

const LOCAL_EMAIL = "local@nexus.os";

export async function currentUserId(): Promise<string> {
  if (!localModeEnabled) {
    throw Object.assign(new Error("Sign in to continue."), {
      recovery: "Open Settings › Account and sign in to your Nexus account.",
    });
  }
  const existing = await prisma.user.findUnique({ where: { email: LOCAL_EMAIL } });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: LOCAL_EMAIL,
      displayName: "This Mac",
      // Local mode never authenticates with a password; the row exists so that
      // every record has an owner and the hosted schema stays identical.
      passwordHash: "local-mode-no-password",
      encryptionSalt: randomHex(32),
    },
  });
  return created.id;
}

function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(array);
  return [...array].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/* Reading and writing the configuration document                              */
/* -------------------------------------------------------------------------- */

export async function loadDocument(channel: "live" | "draft" = "live"): Promise<ConfigDocument> {
  const userId = await currentUserId();
  const record = await prisma.configRecord.findUnique({ where: { userId_channel: { userId, channel } } });

  if (!record) {
    const seeded = defaultDocument();
    await prisma.configRecord.create({
      data: { userId, channel, revision: seeded.revision, document: JSON.stringify(seeded) },
    });
    return seeded;
  }

  const parsed = configDocumentSchema.safeParse(JSON.parse(record.document));
  if (!parsed.success) {
    // A corrupt document must never take the interface down. Fall back to the
    // default layout and leave the stored copy untouched for recovery.
    return defaultDocument();
  }
  return parsed.data;
}

export async function commitOperations(
  operations: Operation[],
  label: string,
  baseRevision: number | undefined,
  channel: "live" | "draft" = "live",
): Promise<{ document: ConfigDocument; transactionId: string }> {
  const userId = await currentUserId();
  const current = await loadDocument(channel);

  if (baseRevision !== undefined && baseRevision !== current.revision) {
    throw Object.assign(new Error("This layout changed in another window."), {
      code: "revisionConflict",
      recovery: "Reload the page to pick up the newest layout, then make your change again.",
      status: 409,
    });
  }

  const result = commit(current, operations, { label });

  await prisma.$transaction([
    prisma.configRecord.upsert({
      where: { userId_channel: { userId, channel } },
      create: {
        userId,
        channel,
        revision: result.document.revision,
        document: JSON.stringify(result.document),
      },
      update: { revision: result.document.revision, document: JSON.stringify(result.document) },
    }),
    prisma.configTransaction.create({
      data: {
        id: result.transaction.id,
        userId,
        label: result.transaction.label,
        author: result.transaction.author,
        revision: result.document.revision,
        operations: JSON.stringify(result.transaction.operations),
        inverse: JSON.stringify(result.transaction.inverse),
      },
    }),
  ]);

  return { document: result.document, transactionId: result.transaction.id };
}

/* -------------------------------------------------------------------------- */
/* The layout a brand-new installation starts with                             */
/* -------------------------------------------------------------------------- */

function widget(
  id: string,
  type: string,
  zone: string,
  order: number,
  columns: number,
  rows: number,
  settings: Record<string, unknown> = {},
  extra: Partial<{ requiresConnection: string | null; requiresBridge: boolean }> = {},
) {
  return {
    id,
    type,
    zone,
    order,
    span: { columns, rows },
    priority: 50,
    pinned: false,
    visibility: {
      requiresConnection: extra.requiresConnection ?? null,
      requiresBridge: extra.requiresBridge ?? false,
      requiresPermission: null,
      hours: null,
      minimumWidth: null,
      hidden: false,
    },
    settings,
    refreshSeconds: 0,
    shortcut: null,
  };
}

/**
 * Seeded content is configuration only — headings, links and panel choices.
 * It deliberately contains no invented business figures, because a first run
 * must never show a number the product cannot source.
 */
export function defaultDocument(): ConfigDocument {
  return configDocumentSchema.parse({
    schemaVersion: 1,
    revision: 0,
    productName: "Nexus OS",
    themeId: "nexus-obsidian",
    pages: [
      {
        id: "home",
        title: "Home",
        icon: "square.grid.2x2",
        showInNavigation: true,
        zones: [
          { id: "hero", label: "Featured", layout: "grid" },
          { id: "main", label: "Dashboard", layout: "grid" },
          { id: "rail", label: "Side rail", layout: "column" },
        ],
        widgets: [
          widget("w-hero", "runescape.hero", "hero", 0, 7, 3, {
            title: "RuneScape",
            subtitle: "Continue your adventure",
          }, { requiresBridge: true }),
          widget("w-onboarding", "essentials.onboardingChecklist", "hero", 1, 5, 3, {
            title: "Finish setting up",
          }),
          widget("w-clock", "essentials.clock", "main", 0, 3, 1, { title: "Time" }),
          widget("w-notes", "essentials.notes", "main", 1, 5, 2, { title: "Scratchpad" }),
          widget("w-links", "essentials.quickLinks", "main", 2, 4, 2, { title: "Quick links" }),
          widget("w-status", "essentials.systemStatus", "main", 3, 4, 2, { title: "System" }),
          widget("w-news", "runescape.news", "rail", 0, 4, 3, { title: "Game news" }),
        ],
      },
    ],
    workspaces: [
      { id: "ws-default", title: "Everyday", icon: "rectangle.3.group", pageIds: ["home"], onEnter: [], silencedCategories: [] },
      { id: "ws-gaming", title: "Gaming", icon: "gamecontroller", pageIds: ["home"], onEnter: [], silencedCategories: ["commerce"] },
      { id: "ws-ai", title: "AI", icon: "sparkles", pageIds: ["home"], onEnter: [], silencedCategories: [] },
    ],
    dock: [
      { id: "d-runescape", label: "RuneScape", icon: "gamecontroller", action: { type: "launchApplication", target: "jagex-launcher" }, requiresApplication: "jagex-launcher" },
      { id: "d-claude", label: "Claude", icon: "sparkles", action: { type: "launchApplication", target: "claude" }, requiresApplication: "claude" },
      { id: "d-chatgpt", label: "ChatGPT", icon: "bubble.left", action: { type: "launchApplication", target: "chatgpt" }, requiresApplication: "chatgpt" },
      { id: "d-brain", label: "Nexus Brain", icon: "brain", action: { type: "openPanel", target: "brain" }, requiresApplication: null },
      { id: "d-studio", label: "Nexus Studio", icon: "paintbrush", action: { type: "openURL", target: "/studio" }, requiresApplication: null },
      { id: "d-help", label: "Help", icon: "questionmark.circle", action: { type: "openPanel", target: "help" }, requiresApplication: null },
    ],
    topBar: { enabled: true, showClock: true, showSearch: true, showSystemStatus: true, items: [] },
    preferences: {},
  });
}

/* -------------------------------------------------------------------------- */
/* Response helpers                                                            */
/* -------------------------------------------------------------------------- */

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function problem(error: unknown, fallbackStatus = 500): Response {
  const anyError = error as { message?: string; recovery?: string; code?: string; status?: number };
  return Response.json(
    {
      error: {
        message: anyError?.message ?? "Something went wrong.",
        recovery: anyError?.recovery ?? "Try again. If it keeps happening, reload the page.",
        code: anyError?.code ?? "unexpected",
      },
    },
    { status: anyError?.status ?? fallbackStatus },
  );
}
