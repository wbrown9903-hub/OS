import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process.
 *
 * Next.js reloads modules on every edit in development, so a plain module-level
 * `new PrismaClient()` opens a new connection pool on every save until SQLite
 * refuses. Caching on `globalThis` survives module reloading; the client is also
 * created lazily so a test can point `DATABASE_URL` at a temporary file before the
 * first query without racing module evaluation order.
 */

const GLOBAL_KEY = Symbol.for("nexus.prisma");

interface PrismaHolder {
  client: PrismaClient | null;
  url: string | undefined;
}

function holder(): PrismaHolder {
  const globalWithPrisma = globalThis as unknown as Record<symbol, PrismaHolder | undefined>;
  let current = globalWithPrisma[GLOBAL_KEY];
  if (!current) {
    current = { client: null, url: undefined };
    globalWithPrisma[GLOBAL_KEY] = current;
  }
  return current;
}

export function getPrisma(): PrismaClient {
  const store = holder();
  const url = process.env.DATABASE_URL;
  // A changed DATABASE_URL means a different database; reuse would silently read
  // the wrong one. Tests rely on this to switch to a temporary file.
  if (store.client && store.url === url) return store.client;
  store.client = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
  store.url = url;
  return store.client;
}

export async function disconnectPrisma(): Promise<void> {
  const store = holder();
  if (!store.client) return;
  const client = store.client;
  store.client = null;
  store.url = undefined;
  await client.$disconnect();
}

export type { PrismaClient };
