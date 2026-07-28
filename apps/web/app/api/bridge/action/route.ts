import { z } from "zod";
import { currentUserId, ok, prisma, problem } from "../../../../lib/server/store.js";

/**
 * The web layer can only ever name an action from this closed set. There is no
 * shell action, by design. Every request is recorded in the audit log — including
 * the ones that are refused.
 */
const ALLOWED_ACTIONS = [
  "launchApplication", "openURL", "openFile", "openFolder", "focusApplication",
  "quitApplication", "moveWindow", "resizeWindow", "tileWindows", "restoreWorkspace",
  "showNotification", "copyApprovedText", "runApprovedShortcut", "invokeApprovedMCPServer",
  "detectApplications", "bridgeStatus",
] as const;

const bodySchema = z.object({
  action: z.enum(ALLOWED_ACTIONS),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return problem(
        {
          message: "That action is not one Nexus OS is allowed to perform.",
          recovery: "Only the built-in desktop actions can run. Report this if you did not expect it.",
          code: "actionNotAllowed",
          status: 400,
        },
        400,
      );
    }

    const userId = await currentUserId();
    const endpoint = process.env.NEXUS_BRIDGE_URL;

    if (!endpoint) {
      await prisma.auditEvent.create({
        data: {
          userId,
          subject: `bridge.${parsed.data.action}`,
          summary: `Requested ${parsed.data.action} while Nexus Desktop was not running`,
          impact: "system",
          requestOrigin: "user",
          outcome: "failed",
        },
      });
      return problem(
        {
          message: "Nexus Desktop is not running, so this could not be done on your Mac.",
          recovery: "Open the Nexus OS app on your Mac, then try again.",
          code: "bridgeUnavailable",
          status: 503,
        },
        503,
      );
    }

    const response = await fetch(`${endpoint}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = (await response.json()) as Record<string, unknown>;

    await prisma.auditEvent.create({
      data: {
        userId,
        subject: `bridge.${parsed.data.action}`,
        summary: `Ran ${parsed.data.action}`,
        impact: "system",
        requestOrigin: "user",
        outcome: response.ok ? "completed" : "failed",
      },
    });

    return ok({ ok: response.ok, result });
  } catch (error) {
    return problem(error);
  }
}
