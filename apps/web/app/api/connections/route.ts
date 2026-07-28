import { currentUserId, ok, prisma, problem } from "../../../lib/server/store.js";

export async function GET() {
  try {
    const userId = await currentUserId();
    const rows = await prisma.connection.findMany({ where: { userId }, orderBy: { service: "asc" } });
    return ok({
      connections: rows.map((row) => ({
        id: row.id,
        service: row.service,
        label: row.label,
        state: row.enabled ? row.state : "disabled",
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return problem(error);
  }
}
