import { loadDocument, ok, problem } from "../../../lib/server/store.js";

export async function GET(request: Request) {
  try {
    const channel = new URL(request.url).searchParams.get("channel") === "draft" ? "draft" : "live";
    const document = await loadDocument(channel);
    return ok({ document, revision: document.revision });
  } catch (error) {
    return problem(error);
  }
}
