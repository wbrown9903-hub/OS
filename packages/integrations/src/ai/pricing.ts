/**
 * Published list prices, USD per million tokens.
 *
 * These are a *fallback*. When a provider reports cost or a price in its own
 * response, that always wins — this table exists so the UI can show an estimate
 * for providers that only report token counts. Every figure derived from it is
 * marked `estimated: true` so nothing is ever presented as a billed amount.
 *
 * Prices change. If a model is missing the cost is reported as `null`, which the
 * UI renders as "cost not available" rather than as zero.
 */

import type { CostEstimate, TokenUsage } from "./types.js";

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  contextTokens?: number;
  maxOutputTokens?: number;
  displayName?: string;
}

/** Anthropic, as published on the Claude platform pricing page. */
export const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Opus 5" },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Opus 4.8" },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Opus 4.7" },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Opus 4.6" },
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Sonnet 5" },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Sonnet 4.6" },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5, contextTokens: 200_000, maxOutputTokens: 64_000, displayName: "Claude Haiku 4.5" },
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50, contextTokens: 1_000_000, maxOutputTokens: 128_000, displayName: "Claude Fable 5" },
};

/** The model Nexus uses unless the person picked another. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";

/**
 * OpenAI. Deliberately short: the adapter discovers the account's real model
 * list from `/v1/models`, and an unpriced model simply shows no cost estimate.
 */
export const OPENAI_PRICES: Record<string, ModelPrice> = {
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10, contextTokens: 128_000, maxOutputTokens: 16_384, displayName: "GPT-4o" },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6, contextTokens: 128_000, maxOutputTokens: 16_384, displayName: "GPT-4o mini" },
  "gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8, contextTokens: 1_047_576, maxOutputTokens: 32_768, displayName: "GPT-4.1" },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6, contextTokens: 1_047_576, maxOutputTokens: 32_768, displayName: "GPT-4.1 mini" },
  "o3-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4, contextTokens: 200_000, maxOutputTokens: 100_000, displayName: "o3-mini" },
};

export const OPENAI_DEFAULT_MODEL = "gpt-4o";

/** Cost of `usage` at the given price, in USD cents. */
export function priceUsage(price: ModelPrice | undefined, usage: TokenUsage): CostEstimate {
  if (!price) {
    return { totalCents: null, inputCents: null, outputCents: null, estimated: true, currency: "USD" };
  }
  // Cache reads are billed at a fraction of the input rate by both providers;
  // treating them as full-price input would overstate the cost, so they are
  // charged at 10% which is the published cache-read multiplier.
  const billedInput = usage.inputTokens + (usage.cacheReadTokens ?? 0) * 0.1 + (usage.cacheWriteTokens ?? 0) * 1.25;
  const inputCents = (billedInput / 1_000_000) * price.inputPerMTok * 100;
  const outputCents = (usage.outputTokens / 1_000_000) * price.outputPerMTok * 100;
  return {
    totalCents: round4(inputCents + outputCents),
    inputCents: round4(inputCents),
    outputCents: round4(outputCents),
    estimated: true,
    currency: "USD",
  };
}

/** Formats a cost for display, or the honest "not available". */
export function formatCost(cost: CostEstimate): string {
  if (cost.totalCents === null) return "Cost not available";
  if (cost.totalCents < 1) return `< $0.01${cost.estimated ? " (estimated)" : ""}`;
  return `$${(cost.totalCents / 100).toFixed(2)}${cost.estimated ? " (estimated)" : ""}`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
