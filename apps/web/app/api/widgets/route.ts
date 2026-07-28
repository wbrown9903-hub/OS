import { builtInWidgets } from "@nexus/widgets";
import { ok, problem } from "../../../lib/server/store.js";

export async function GET() {
  try {
    return ok({ definitions: builtInWidgets });
  } catch (error) {
    return problem(error);
  }
}
