import { currentUserId, ok, prisma, problem } from "../../../lib/server/store.js";

export async function GET() {
  try {
    const userId = await currentUserId();
    const rows = await prisma.notificationRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({
      notifications: rows.map((row) => ({
        id: row.id,
        category: row.category,
        priority: row.priority,
        title: row.title,
        body: row.body,
        href: row.href,
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return problem(error);
  }
}
