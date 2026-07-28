import type { DataFreshness, WidgetNode } from "@nexus/schemas";
import type { ReactElement } from "react";

/**
 * Everything a renderer is given, and nothing else.
 *
 * Renderers are presentational: they never fetch, never write to the document and
 * never decide whether they are allowed to run. That is the resolver's job, which
 * is why a widget cannot forget to handle being disconnected.
 */
export interface WidgetRenderProps {
  node: WidgetNode;
  settings: Record<string, unknown>;
  /** Real data from the widget's endpoint, or null when there is none yet. */
  data: unknown;
  freshness: DataFreshness;
  /** True while the first fetch is still in flight. */
  loading?: boolean;
  /** Set in Nexus Studio so the renderer can avoid running timers or sounds. */
  editing?: boolean;
}

export type WidgetRenderer = (props: WidgetRenderProps) => ReactElement;
