import { describeFreshness, type DataFreshness } from "@nexus/schemas";
import { Badge } from "./Badge.js";
import { VisuallyHidden } from "./VisuallyHidden.js";

const GLYPHS: Record<DataFreshness["state"], string> = {
  live: "●",
  cached: "◐",
  stale: "◔",
  unavailable: "▲",
  notConfigured: "○",
};

/**
 * The label under every number in Nexus OS. A figure is never shown unqualified:
 * it is Live, Cached, Last updated, Not connected, or the specific error.
 */
export function FreshnessBadge({ freshness }: { freshness: DataFreshness }) {
  const { label, tone } = describeFreshness(freshness);
  const explanation =
    freshness.state === "unavailable"
      ? freshness.nextStep
      : freshness.state === "notConfigured"
        ? freshness.nextStep
        : null;

  return (
    <span title={explanation ?? label}>
      <Badge tone={tone} glyph={GLYPHS[freshness.state]}>
        {label}
      </Badge>
      {explanation ? <VisuallyHidden> {explanation}</VisuallyHidden> : null}
    </span>
  );
}
