/**
 * One vocabulary for every AI provider.
 *
 * Nexus talks to Anthropic, OpenAI and any OpenAI-compatible local server
 * (Ollama, LM Studio, llama.cpp, vLLM). The differences between them are
 * absorbed by the adapters; everything above this line sees these types.
 *
 * PRIVACY RULE, enforced by the adapters and asserted by the tests: prompt and
 * completion text is *never* written to a log line. Only shapes, counts, model
 * names, durations and error codes are logged, and every log line is passed
 * through the redactor first.
 */

export type AiProviderId = "anthropic" | "openai" | "compatible";

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiRequest {
  /** Provider model identifier, e.g. "claude-opus-5" or "gpt-4o". */
  model: string;
  /** System prompt. Anthropic takes it as a top-level field, OpenAI as a message. */
  system?: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
  stopSequences?: string[];
  /** Milliseconds before the request is abandoned. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Extra provider-specific fields. Passed through untouched. */
  providerOptions?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Present when the provider reports cache activity. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Tokens the provider billed as reasoning, when it says so. */
  reasoningTokens?: number;
}

export interface CostEstimate {
  /** Cost in USD cents, as a float. Null when we have no price for the model. */
  totalCents: number | null;
  inputCents: number | null;
  outputCents: number | null;
  /** True when the figure came from a published price table rather than the API. */
  estimated: boolean;
  currency: "USD";
}

export interface AiResponse {
  provider: AiProviderId;
  model: string;
  text: string;
  /** Why generation ended: "end" | "maxTokens" | "stopSequence" | "toolUse" | "refusal" | "unknown". */
  finishReason: FinishReason;
  usage: TokenUsage;
  cost: CostEstimate;
  /** Wall-clock milliseconds for the whole request. */
  durationMs: number;
  /** ISO 8601. Present on every response so callers can label freshness. */
  fetchedAt: string;
  /** Provider request id, when supplied. Useful for support tickets. */
  requestId?: string;
}

export type FinishReason = "end" | "maxTokens" | "stopSequence" | "toolUse" | "refusal" | "unknown";

export type AiStreamEvent =
  | { type: "start"; model: string; requestId?: string }
  | { type: "text"; delta: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; response: AiResponse }
  | { type: "error"; error: AiError };

export interface ModelInfo {
  id: string;
  displayName: string;
  /** Maximum input context in tokens, when known. */
  contextTokens?: number;
  maxOutputTokens?: number;
  /** USD per million input/output tokens, when we have a published figure. */
  inputPricePerMTok?: number;
  outputPricePerMTok?: number;
  /** True when the adapter discovered it from the provider rather than a table. */
  discovered: boolean;
}

export type AiErrorCode =
  | "notConfigured"
  | "badKey"
  | "rateLimited"
  | "modelUnavailable"
  | "network"
  | "timeout"
  | "contextTooLong"
  | "contentRefused"
  | "serviceError"
  | "badResponse"
  | "blockedByPolicy"
  | "unknown";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly provider: AiProviderId;
  readonly nextStep: string;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly retryable: boolean;

  constructor(
    provider: AiProviderId,
    code: AiErrorCode,
    message: string,
    nextStep: string,
    options: { status?: number; retryAfterSeconds?: number; cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiError";
    this.provider = provider;
    this.code = code;
    this.nextStep = nextStep;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
  }
}

const RETRYABLE = new Set<AiErrorCode>(["rateLimited", "network", "timeout", "serviceError"]);

/** What a widget shows in the AI connection card. */
export interface AiConnectionState {
  kind: "connected" | "notConfigured" | "badKey" | "rateLimited" | "unreachable" | "modelUnavailable" | "error";
  ok: boolean;
  message: string;
  nextStep: string;
  /** Models the key can actually reach, when the provider will tell us. */
  models?: ModelInfo[];
  checkedAt: string;
  latencyMs?: number;
}

/** The contract every adapter implements. */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly label: string;
  /** One non-streaming completion. */
  complete(request: AiRequest): Promise<AiResponse>;
  /** The same request, streamed. Always ends with `done` or `error`. */
  stream(request: AiRequest): AsyncGenerator<AiStreamEvent, void, undefined>;
  /** Models this key can use. Falls back to a built-in table when unlisted. */
  listModels(): Promise<ModelInfo[]>;
  testConnection(): Promise<AiConnectionState>;
  /** Price a usage record without making a request. */
  estimateCost(model: string, usage: TokenUsage): CostEstimate;
}
