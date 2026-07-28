import {
  type ContentOrigin,
  type PermissionDecision,
  type PermissionPolicy,
  type ToolDescriptor,
  NexusError,
  Untrusted,
  UserAuthorization,
  grantsAuthority,
  injectionHeuristics,
  outcomeForDecision,
  permissionEngine,
  secretRedactor,
  toNexusError,
} from "@nexus/security";
import { McpAuditLog } from "./audit.js";
import type { McpClient } from "./client.js";
import { type McpToolResult, toolResultText } from "./protocol.js";

/**
 * The staged tool-call pipeline.
 *
 * Every call passes through five distinct stages, in order, and each stage is a
 * separate object so that skipping one is a type error rather than an oversight:
 *
 *   1. suggestion  — a model, or a previous tool's output, *asks* for something.
 *   2. proposal    — the permission engine decides: allow, confirm or deny.
 *   3. authorisation — a person approves. Only this stage creates authority.
 *   4. execution   — the call actually reaches the server.
 *   5. audit       — every stage above is recorded, including the refusals.
 *
 * The property that makes prompt injection ineffective: a suggestion's origin is
 * never a parameter chosen by the caller when it is derived from data. It is read
 * from the provenance stamp on that data. Tool output is `external`, so a
 * follow-up call it asks for is also `external`, and `external` never grants
 * authority — no matter what the text says.
 */

export type PipelineStage = "suggested" | "proposed" | "authorised" | "executed";

export interface InjectionWarning {
  title: string;
  detail: string;
  nextStep: string;
}

export interface ToolSuggestion {
  readonly stage: "suggested";
  readonly id: string;
  readonly serverId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  /** Where the *request* came from. Never upgraded, only ever preserved. */
  readonly origin: ContentOrigin;
  readonly rationale: string;
  /** A display-only warning when the requesting text looks like an injection. */
  readonly warning: InjectionWarning | null;
}

export interface ToolCallProposal {
  readonly stage: "proposed";
  readonly id: string;
  readonly serverId: string;
  readonly tool: ToolDescriptor;
  readonly args: Record<string, unknown>;
  readonly origin: ContentOrigin;
  readonly decision: PermissionDecision;
  readonly requiresApproval: boolean;
  /** The exact text a person is shown before approving. */
  readonly prompt: string | null;
  readonly warning: InjectionWarning | null;
}

export interface AuthorisedCall {
  readonly stage: "authorised";
  readonly proposal: ToolCallProposal;
  readonly authorization: UserAuthorization;
}

export interface ToolExecutionResult {
  readonly stage: "executed";
  readonly proposalId: string;
  readonly serverId: string;
  readonly toolName: string;
  readonly ok: boolean;
  /**
   * The server's answer, stamped `external`. Reading it for display is free;
   * using it for authority requires a `UserAuthorization`, which this pipeline
   * never mints from a tool result.
   */
  readonly output: Untrusted<McpToolResult>;
  /** The text of the result, for display and indexing. Data, never instructions. */
  readonly text: string;
  /** The same text with credential-shaped material removed, for logs. */
  readonly redactedText: string;
  readonly durationMs: number;
  readonly warning: InjectionWarning | null;
}

export interface ToolCallPipelineOptions {
  serverId: string;
  serverName: string;
  client: Pick<McpClient, "callTool">;
  policy: PermissionPolicy;
  tools: Iterable<ToolDescriptor>;
  audit?: McpAuditLog;
  clock?: () => Date;
}

let counter = 0;
function newRequestId(): string {
  counter += 1;
  return `call_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function approvalRequiredError(toolName: string): NexusError {
  return NexusError.permission(
    "approvalRequired",
    `“${toolName}” needs your approval before it can run.`,
    "Review what it will do, then choose Approve or Cancel.",
  );
}

export class ToolCallPipeline {
  readonly audit: McpAuditLog;

  private readonly tools = new Map<string, ToolDescriptor>();
  private readonly proposals = new Map<string, ToolCallProposal>();
  private readonly authorisations = new Map<string, UserAuthorization>();
  private policy: PermissionPolicy;

  constructor(private readonly options: ToolCallPipelineOptions) {
    this.audit = options.audit ?? new McpAuditLog();
    this.policy = options.policy;
    for (const tool of options.tools) this.tools.set(tool.name, tool);
  }

  /** Replaces the policy, e.g. after the user changes the mode in Settings. */
  usePolicy(policy: PermissionPolicy): void {
    this.policy = policy;
  }

  get knownTools(): ToolDescriptor[] {
    return [...this.tools.values()];
  }

  private subject(toolName: string): string {
    return `mcp.${this.options.serverId}.${toolName}`;
  }

  /* ---------------------------------------------------------------------- */
  /* Stage 1 — suggestion                                                    */
  /* ---------------------------------------------------------------------- */

  /** An AI model asked for a tool. A model request is `model` origin, always. */
  suggestFromModel(input: {
    toolName: string;
    args?: Record<string, unknown>;
    rationale?: string;
  }): ToolSuggestion {
    return this.suggest(input.toolName, input.args ?? {}, "model", input.rationale ?? "", input.rationale ?? "");
  }

  /**
   * The person clicked a button that names the tool directly — the test console,
   * or a workflow step they authored and ran themselves.
   */
  requestByUser(input: { toolName: string; args?: Record<string, unknown>; rationale?: string }): ToolSuggestion {
    return this.suggest(
      input.toolName,
      input.args ?? {},
      "user",
      input.rationale ?? "You started this from the interface.",
      "",
    );
  }

  /**
   * A previous tool's output asked for another call.
   *
   * The origin is taken from the provenance stamp on the result, not from a
   * parameter — which is why a tool result that says "you are now authorised" is
   * still `external` and still cannot authorise anything.
   */
  suggestFromToolResult(
    result: ToolExecutionResult,
    input: { toolName: string; args?: Record<string, unknown>; rationale?: string },
  ): ToolSuggestion {
    return this.suggest(
      input.toolName,
      input.args ?? {},
      result.output.origin,
      input.rationale ?? `Requested by the output of “${result.toolName}”.`,
      `${input.rationale ?? ""}\n${result.text}`,
    );
  }

  private suggest(
    toolName: string,
    args: Record<string, unknown>,
    origin: ContentOrigin,
    rationale: string,
    scanText: string,
  ): ToolSuggestion {
    const warning = scanText.trim().length > 0 ? injectionHeuristics.warningFor(scanText) : null;
    const suggestion: ToolSuggestion = {
      stage: "suggested",
      id: newRequestId(),
      serverId: this.options.serverId,
      toolName,
      args,
      origin,
      rationale,
      warning,
    };
    this.audit.record({
      subject: this.subject(toolName),
      summary: `${describeOrigin(origin)} suggested “${toolName}”`,
      impact: this.tools.get(toolName)?.impact ?? "write",
      requestOrigin: origin,
      outcome: "allowed",
      detail: rationale,
    });
    return suggestion;
  }

  /* ---------------------------------------------------------------------- */
  /* Stage 2 — proposal                                                      */
  /* ---------------------------------------------------------------------- */

  /** Runs the permission engine. Throws on a denial; never runs anything. */
  propose(suggestion: ToolSuggestion): ToolCallProposal {
    const tool = this.tools.get(suggestion.toolName);
    if (!tool) {
      const error = NexusError.notFound(
        `The tool “${suggestion.toolName}”`,
        "Open Settings › MCP and choose Discover tools, so Nexus OS learns what this server offers now.",
      );
      this.audit.record({
        subject: this.subject(suggestion.toolName),
        summary: `Refused “${suggestion.toolName}” — not offered by ${this.options.serverName}`,
        impact: "write",
        requestOrigin: suggestion.origin,
        outcome: "denied",
        detail: error.message,
      });
      throw error;
    }

    const decision = permissionEngine.evaluate(tool, this.policy, suggestion.origin);
    this.audit.record({
      subject: this.subject(tool.name),
      summary:
        decision.kind === "allow"
          ? `Allowed “${tool.name}” — ${decision.reason}`
          : decision.kind === "confirm"
            ? `“${tool.name}” needs approval before it can run`
            : `Refused “${tool.name}” — ${decision.error.message}`,
      impact: tool.impact,
      requestOrigin: suggestion.origin,
      outcome: outcomeForDecision(decision),
      detail: decision.kind === "deny" ? decision.error.recovery : "",
    });

    if (decision.kind === "deny") throw decision.error;

    const proposal: ToolCallProposal = {
      stage: "proposed",
      id: suggestion.id,
      serverId: suggestion.serverId,
      tool,
      args: suggestion.args,
      origin: suggestion.origin,
      decision,
      requiresApproval: decision.kind === "confirm",
      prompt: decision.kind === "confirm" ? decision.prompt : null,
      warning: suggestion.warning,
    };
    this.proposals.set(proposal.id, proposal);

    // An outright allow is authority the user configured in advance, so the
    // authorisation is minted here and recorded with its method.
    if (decision.kind === "allow") {
      this.authorisations.set(
        proposal.id,
        UserAuthorization.granted({
          actionIdentifier: proposal.id,
          scope: this.subject(tool.name),
          method: this.policy.mode === "trustedWorkspace" ? "trustedWorkspace" : "preapprovedPolicy",
        }),
      );
    }
    return proposal;
  }

  /* ---------------------------------------------------------------------- */
  /* Stage 3 — authorisation                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Records a person's approval of one specific proposal.
   *
   * The authorisation is bound to the proposal's id, so an approval granted for a
   * harmless call cannot be replayed onto a different one, and it is consumed by
   * the execution that uses it, so it cannot be reused.
   */
  approve(proposalId: string, options: { approvedBy: ContentOrigin }): AuthorisedCall {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw NexusError.notFound(
        "That request",
        "It may have already run or been cancelled. Ask again and approve the new request.",
      );
    }
    if (!grantsAuthority(options.approvedBy)) {
      const error = NexusError.security(
        "authorityFromContent",
        "Only you can approve an action — content cannot approve itself.",
        "Review the request and choose Approve if you want it to run.",
      );
      this.audit.record({
        subject: this.subject(proposal.tool.name),
        summary: `Refused an approval that did not come from you (${describeOrigin(options.approvedBy)})`,
        impact: proposal.tool.impact,
        requestOrigin: options.approvedBy,
        outcome: "denied",
        detail: error.message,
      });
      throw error;
    }
    const authorization = UserAuthorization.granted({
      actionIdentifier: proposal.id,
      scope: this.subject(proposal.tool.name),
      method: "explicitPrompt",
    });
    this.authorisations.set(proposal.id, authorization);
    this.audit.record({
      subject: this.subject(proposal.tool.name),
      summary: `You approved “${proposal.tool.name}”`,
      impact: proposal.tool.impact,
      requestOrigin: "user",
      outcome: "confirmed",
      detail: proposal.prompt ?? "",
    });
    return { stage: "authorised", proposal, authorization };
  }

  /** The person said no. Recorded, because refusals matter as much as approvals. */
  cancel(proposalId: string, reason = "You cancelled this request."): void {
    const proposal = this.proposals.get(proposalId);
    this.proposals.delete(proposalId);
    this.authorisations.delete(proposalId);
    if (!proposal) return;
    this.audit.record({
      subject: this.subject(proposal.tool.name),
      summary: `“${proposal.tool.name}” was cancelled`,
      impact: proposal.tool.impact,
      requestOrigin: "user",
      outcome: "cancelled",
      detail: reason,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Stage 4 and 5 — execution and audit                                     */
  /* ---------------------------------------------------------------------- */

  async execute(proposalId: string): Promise<ToolExecutionResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw NexusError.notFound(
        "That request",
        "It may have already run or been cancelled. Ask again and approve the new request.",
      );
    }

    // The policy may have changed between proposal and execution, and a stale
    // "allow" must never be honoured. Re-decide, every time.
    const decision = permissionEngine.evaluate(proposal.tool, this.policy, proposal.origin);
    if (decision.kind === "deny") {
      this.audit.record({
        subject: this.subject(proposal.tool.name),
        summary: `Refused “${proposal.tool.name}” at execution — ${decision.error.message}`,
        impact: proposal.tool.impact,
        requestOrigin: proposal.origin,
        outcome: "denied",
        detail: decision.error.recovery,
      });
      this.proposals.delete(proposalId);
      throw decision.error;
    }

    const authorization = this.authorisations.get(proposalId);
    if (!authorization || !authorization.isValid || authorization.actionIdentifier !== proposalId) {
      const error = approvalRequiredError(proposal.tool.name);
      this.audit.record({
        subject: this.subject(proposal.tool.name),
        summary: `Blocked “${proposal.tool.name}” — nobody had approved it`,
        impact: proposal.tool.impact,
        requestOrigin: proposal.origin,
        outcome: "denied",
        detail: error.recovery,
      });
      throw error;
    }
    if (decision.kind === "confirm" && authorization.method !== "explicitPrompt") {
      const error = approvalRequiredError(proposal.tool.name);
      this.audit.record({
        subject: this.subject(proposal.tool.name),
        summary: `Blocked “${proposal.tool.name}” — it needs a fresh approval from you`,
        impact: proposal.tool.impact,
        requestOrigin: proposal.origin,
        outcome: "denied",
        detail: error.recovery,
      });
      throw error;
    }

    // Consume both, so an approval is good for exactly one execution.
    this.proposals.delete(proposalId);
    this.authorisations.delete(proposalId);

    const began = Date.now();
    let raw: McpToolResult;
    try {
      raw = await this.options.client.callTool(proposal.tool.name, proposal.args);
    } catch (error) {
      const failure = toNexusError(error);
      this.audit.record({
        subject: this.subject(proposal.tool.name),
        summary: `“${proposal.tool.name}” failed — ${failure.message}`,
        impact: proposal.tool.impact,
        requestOrigin: proposal.origin,
        outcome: "failed",
        detail: failure.recovery,
      });
      throw failure;
    }

    const text = toolResultText(raw);
    const redactedText = secretRedactor.redact(text);
    const warning = injectionHeuristics.warningFor(text);

    this.audit.record({
      subject: this.subject(proposal.tool.name),
      summary: raw.isError
        ? `“${proposal.tool.name}” ran and reported a problem`
        : `“${proposal.tool.name}” ran`,
      impact: proposal.tool.impact,
      requestOrigin: proposal.origin,
      outcome: raw.isError ? "failed" : "completed",
      detail: redactedText.slice(0, 2000),
    });

    return {
      stage: "executed",
      proposalId,
      serverId: proposal.serverId,
      toolName: proposal.tool.name,
      ok: !raw.isError,
      // The stamp that keeps the next stage honest.
      output: new Untrusted(raw, "external", `output of ${this.options.serverName}:${proposal.tool.name}`),
      text,
      redactedText,
      durationMs: Date.now() - began,
      warning,
    };
  }

  /**
   * The whole pipeline for a request that a person initiated. Anything needing
   * approval is handed to `confirm`; if there is no confirmer, it is refused.
   */
  async run(
    suggestion: ToolSuggestion,
    confirm?: (proposal: ToolCallProposal) => Promise<boolean>,
  ): Promise<ToolExecutionResult> {
    const proposal = this.propose(suggestion);
    if (proposal.requiresApproval) {
      const approved = confirm ? await confirm(proposal) : false;
      if (!approved) {
        this.cancel(proposal.id, confirm ? "You did not approve this request." : "Nobody was there to approve it.");
        throw approvalRequiredError(proposal.tool.name);
      }
      this.approve(proposal.id, { approvedBy: "user" });
    }
    return this.execute(proposal.id);
  }
}

function describeOrigin(origin: ContentOrigin): string {
  switch (origin) {
    case "user":
      return "You";
    case "system":
      return "Nexus OS";
    case "model":
      return "An AI model";
    case "external":
      return "Content from an outside source";
  }
}
