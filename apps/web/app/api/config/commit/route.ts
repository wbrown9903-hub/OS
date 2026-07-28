import { z } from "zod";
import { commitOperations, ok, problem } from "../../../../lib/server/store.js";

const bodySchema = z.object({
  operations: z.array(z.record(z.string(), z.unknown())).min(1),
  label: z.string().min(1).max(120),
  baseRevision: z.number().int().nonnegative().optional(),
  channel: z.enum(["live", "draft"]).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return problem(
        {
          message: "That edit could not be understood.",
          recovery: "Reload the page and try the change again.",
          code: "invalidOperations",
          status: 400,
        },
        400,
      );
    }
    const { document, transactionId } = await commitOperations(
      parsed.data.operations as never,
      parsed.data.label,
      parsed.data.baseRevision,
      parsed.data.channel ?? "live",
    );
    return ok({ document, revision: document.revision, transactionId });
  } catch (error) {
    return problem(error);
  }
}
