/**
 * A small subsequence matcher for the command palette.
 *
 * It is intentionally not a general-purpose search engine: it ranks short labels
 * a person is typing towards, rewarding prefix matches, word-boundary matches and
 * runs of adjacent characters, so "cmk" finds "Command palette" and "ordr" finds
 * "Today's orders" without either becoming the top hit for "or".
 */

export interface FuzzyMatch {
  score: number;
  /** Indices in the haystack that matched, for highlighting. */
  positions: number[];
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 600;
const SCORE_WORD_START = 220;
const SCORE_CONTAINS = 160;
const SCORE_CHARACTER = 12;
const SCORE_ADJACENT = 18;
const PENALTY_GAP = 3;
const PENALTY_LENGTH = 0.4;

function isWordBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1] ?? "";
  return previous === " " || previous === "-" || previous === "." || previous === "/" || previous === "_";
}

export function fuzzyMatch(haystack: string, needle: string): FuzzyMatch | null {
  if (!needle) return { score: 1, positions: [] };

  const target = haystack.toLowerCase();
  const query = needle.toLowerCase().trim();
  if (!query) return { score: 1, positions: [] };

  if (target === query) {
    return { score: SCORE_EXACT, positions: range(0, target.length) };
  }
  if (target.startsWith(query)) {
    return { score: SCORE_PREFIX - target.length * PENALTY_LENGTH, positions: range(0, query.length) };
  }

  const contains = target.indexOf(query);
  if (contains !== -1) {
    const bonus = isWordBoundary(target, contains) ? SCORE_WORD_START : 0;
    return {
      score: SCORE_CONTAINS + bonus - contains - target.length * PENALTY_LENGTH,
      positions: range(contains, contains + query.length),
    };
  }

  // Subsequence pass.
  const positions: number[] = [];
  let cursor = 0;
  let score = 0;
  let lastMatch = -1;

  for (const character of query) {
    if (character === " ") continue;
    const found = target.indexOf(character, cursor);
    if (found === -1) return null;
    score += SCORE_CHARACTER;
    if (isWordBoundary(target, found)) score += SCORE_WORD_START / 4;
    if (lastMatch !== -1) {
      const gap = found - lastMatch - 1;
      score += gap === 0 ? SCORE_ADJACENT : -Math.min(gap, 12) * PENALTY_GAP;
    }
    positions.push(found);
    lastMatch = found;
    cursor = found + 1;
  }

  score -= target.length * PENALTY_LENGTH;
  return score > 0 ? { score, positions } : null;
}

/** Best match across several fields, e.g. a title plus its keywords. */
export function fuzzyMatchAny(fields: Array<string | undefined>, needle: string): FuzzyMatch | null {
  let best: FuzzyMatch | null = null;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const match = fuzzyMatch(field, needle);
    if (!match) continue;
    // Later fields (keywords, summaries) count for less than the primary label.
    const weighted: FuzzyMatch = { score: match.score * (index === 0 ? 1 : 0.6), positions: index === 0 ? match.positions : [] };
    if (!best || weighted.score > best.score) best = weighted;
  }
  return best;
}

function range(from: number, to: number): number[] {
  const result: number[] = [];
  for (let index = from; index < to; index += 1) result.push(index);
  return result;
}

/** Splits a label into matched / unmatched runs so a result can be highlighted. */
export function highlightSegments(
  text: string,
  positions: number[],
): Array<{ text: string; matched: boolean }> {
  if (positions.length === 0) return [{ text, matched: false }];
  const flags = new Set(positions);
  const segments: Array<{ text: string; matched: boolean }> = [];
  let current = "";
  let currentMatched = flags.has(0);

  for (let index = 0; index < text.length; index += 1) {
    const matched = flags.has(index);
    if (matched !== currentMatched) {
      if (current) segments.push({ text: current, matched: currentMatched });
      current = "";
      currentMatched = matched;
    }
    current += text[index] ?? "";
  }
  if (current) segments.push({ text: current, matched: currentMatched });
  return segments;
}
