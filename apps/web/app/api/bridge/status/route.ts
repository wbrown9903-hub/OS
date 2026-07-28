import { ok } from "../../../../lib/server/store.js";

/**
 * The Mac Bridge runs as a native process on the user's Mac and publishes its
 * loopback port. When Nexus is open in a plain browser there is no bridge, and
 * saying so plainly is the correct answer — every widget that needs it then
 * explains what to do instead of failing silently.
 */
export async function GET() {
  const endpoint = process.env.NEXUS_BRIDGE_URL;
  if (!endpoint) {
    return ok({
      available: false,
      reason: "Nexus Desktop is not running on this Mac.",
      nextStep: "Open the Nexus OS app to launch applications and arrange windows from here.",
    });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${endpoint}/status`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { deviceName?: string; version?: string };
    return ok({ available: true, deviceName: body.deviceName ?? "This Mac", version: body.version ?? "" });
  } catch {
    return ok({
      available: false,
      reason: "Nexus Desktop did not respond.",
      nextStep: "Make sure the Nexus OS app is running, then choose Retry.",
    });
  }
}
