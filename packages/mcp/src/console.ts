import { type ContentOrigin, secretRedactor, toNexusError } from "@nexus/security";
import type { McpAuditRecord } from "./audit.js";
import type { McpContentBlock } from "./protocol.js";
import { type InjectionWarning, type ToolCallPipeline } from "./pipeline.js";

/**
 * The test console.
 *
 * It exists so a person can try a tool once, deliberately, and see exactly what
 * came back before deciding whether to leave the tool switched on. Because the
 * person pressed the button, the request origin is `user` — but it still goes
 * through the same pipeline, so a destructive tool still asks, and a denied tool
 * is still refused.
 *
 * Two views of the answer come back: `raw`, for the caller that owns the data,
 * and `redacted`, which is the only one that may be logged, exported or rendered.
 */

export interface TestConsoleRequest {
  toolName: string;
  args?: Record<string, unknown>;
  /** Defaults to `user` — the console is a button, not a model. */
  origin?: ContentOrigin;
  /** Called when the tool needs approval. Returning false cancels the run. */
  confirm?: (prompt: string) => Promise<boolean>;
}

export interface TestConsoleOutcome {
  ok: boolean;
  toolName: string;
  durationMs: number;
  /** Exactly what the server sent. Never logged. */
  raw: {
    text: string;
    content: McpContentBlock[];
    structured: unknown;
  };
  /** Safe to display, log and export. */
  redacted: {
    text: string;
    content: Array<{ type: string; text: string }>;
    structured: unknown;
  };
  warning: InjectionWarning | null;
  audit: McpAuditRecord[];
  error: { message: string; recovery: string; code: string } | null;
}

export async function runTestConsole(
  pipeline: ToolCallPipeline,
  request: TestConsoleRequest,
): Promise<TestConsoleOutcome> {
  const before = pipeline.audit.all.length;
  const origin = request.origin ?? "user";
  const suggestion =
    origin === "user"
      ? pipeline.requestByUser({
          toolName: request.toolName,
          args: request.args ?? {},
          rationale: "You ran this from the test console.",
        })
      : pipeline.suggestFromModel({
          toolName: request.toolName,
          args: request.args ?? {},
          rationale: "Test console, running as an AI model would.",
        });

  const empty: TestConsoleOutcome["raw"] = { text: "", content: [], structured: null };

  try {
    const result = await pipeline.run(suggestion, async (proposal) =>
      request.confirm ? request.confirm(proposal.prompt ?? "") : false,
    );
    const content = result.output.forDisplay.content;
    return {
      ok: result.ok,
      toolName: result.toolName,
      durationMs: result.durationMs,
      raw: { text: result.text, content, structured: result.output.forDisplay.structured },
      redacted: {
        text: result.redactedText,
        content: content.map((block) => ({ type: block.type, text: secretRedactor.redact(block.text) })),
        structured: secretRedactor.redactJSON(result.output.forDisplay.structured),
      },
      warning: result.warning,
      audit: pipeline.audit.all.slice(before),
      error: null,
    };
  } catch (error) {
    const failure = toNexusError(error);
    return {
      ok: false,
      toolName: request.toolName,
      durationMs: 0,
      raw: empty,
      redacted: { text: "", content: [], structured: null },
      warning: null,
      audit: pipeline.audit.all.slice(before),
      error: { message: failure.message, recovery: failure.recovery, code: failure.qualifiedCode },
    };
  }
}
