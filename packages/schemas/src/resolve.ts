import type { ConfigDocument, Page, WidgetNode, Zone } from "./document.js";

/**
 * The resolver turns stored *intent* into a concrete layout for the display it is
 * actually being drawn on, right now, for this user's accessibility settings and
 * connection states.
 *
 * Because every widget is laid out, themed, animated and hidden by this one
 * function, correctness is structural rather than a matter of discipline: a new
 * widget cannot forget to honour reduced motion, cannot ignore high contrast, and
 * cannot silently vanish when a service is disconnected.
 */

export type ConnectionState =
  | "notConfigured"
  | "configurationRequired"
  | "connecting"
  | "connected"
  | "permissionRequired"
  | "authenticationFailed"
  | "unreachable"
  | "rateLimited"
  | "disabled"
  | "error";

export type PermissionState = "granted" | "denied" | "notRequested" | "unavailable";

export interface AccessibilityPreferences {
  reducedMotion: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
  /** 1 is the system default; larger values scale the whole interface. */
  fontScale: number;
}

export interface ResolveContext {
  viewportWidth: number;
  viewportHeight: number;
  accessibility: AccessibilityPreferences;
  connections: Record<string, ConnectionState>;
  permissions: Record<string, PermissionState>;
  /** Whether the native Mac Bridge is currently reachable. */
  bridgeAvailable: boolean;
  /** Feeds battery-aware behaviour; absent in the browser on desktop. */
  power: { lowPowerMode: boolean; charging: boolean } | null;
  now: Date;
  /** Set while Nexus OS is running with third-party extensions disabled. */
  recoveryMode: boolean;
}

export const defaultResolveContext = (overrides: Partial<ResolveContext> = {}): ResolveContext => ({
  viewportWidth: 1440,
  viewportHeight: 900,
  accessibility: { reducedMotion: false, reducedTransparency: false, highContrast: false, fontScale: 1 },
  connections: {},
  permissions: {},
  bridgeAvailable: false,
  power: null,
  now: new Date(),
  recoveryMode: false,
  ...overrides,
});

export type LayoutBreakpoint = "compact" | "medium" | "regular" | "wide";

export interface UnavailableReason {
  /** Short, plain-language explanation shown in place of the widget. */
  summary: string;
  /** The next thing the user can do about it. */
  nextStep: string;
  /** Deep link to the screen that fixes it, e.g. "/settings/connections/shopify". */
  resolveHref: string | null;
  kind: "connection" | "bridge" | "permission" | "schedule" | "recovery";
}

export interface ResolvedWidget {
  node: WidgetNode;
  /** Actual columns and rows for this display, after scaling the requested span. */
  columns: number;
  rows: number;
  /** Present when the widget cannot show real data. The shell renders an
   *  explanatory card in its place instead of letting it disappear. */
  unavailable: UnavailableReason | null;
  /** Widgets the user deliberately hid are omitted entirely rather than explained. */
  hiddenByUser: boolean;
}

export interface ResolvedZone {
  zone: Zone;
  layout: Zone["layout"];
  columns: number;
  widgets: ResolvedWidget[];
}

export interface ResolvedPage {
  page: Page;
  breakpoint: LayoutBreakpoint;
  columns: number;
  zones: ResolvedZone[];
  /** CSS custom properties applied to the page root. */
  styleVariables: Record<string, string>;
  /** 0 disables animation entirely; the shell multiplies all durations by this. */
  animationScale: number;
}

export function breakpointFor(width: number): LayoutBreakpoint {
  if (width < 700) return "compact";
  if (width < 1100) return "medium";
  if (width < 1800) return "regular";
  return "wide";
}

const COLUMNS_FOR_BREAKPOINT: Record<LayoutBreakpoint, number> = {
  compact: 4,
  medium: 8,
  regular: 12,
  wide: 16,
};

/** Scales a 12-column intent onto the columns this display actually offers. */
export function scaleSpan(requestedColumns: number, availableColumns: number): number {
  const scaled = Math.round((requestedColumns / 12) * availableColumns);
  return Math.max(1, Math.min(availableColumns, scaled));
}

function hourInRange(hour: number, from: number, to: number): boolean {
  // Ranges may wrap past midnight, e.g. 22 → 7.
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

const CONNECTION_EXPLANATIONS: Record<ConnectionState, { summary: string; nextStep: string }> = {
  notConfigured: { summary: "Not connected yet", nextStep: "Connect this service to see live information here." },
  configurationRequired: { summary: "Setup unfinished", nextStep: "Add the missing detail to finish connecting." },
  connecting: { summary: "Connecting…", nextStep: "Nexus OS is contacting the service." },
  connected: { summary: "Connected", nextStep: "Everything is working." },
  permissionRequired: { summary: "Permission needed", nextStep: "Grant the requested permission, then choose Retry." },
  authenticationFailed: { summary: "Sign-in failed", nextStep: "Re-enter the credential — it may have expired." },
  unreachable: { summary: "Service unreachable", nextStep: "Check your internet connection, then choose Retry." },
  rateLimited: { summary: "Service is limiting requests", nextStep: "Nexus OS will retry automatically shortly." },
  disabled: { summary: "Turned off", nextStep: "Switch this connection back on to use it." },
  error: { summary: "Needs attention", nextStep: "Open the connection to see what happened." },
};

/** Decides whether a widget can show real data, and if not, exactly why. */
export function evaluateAvailability(widget: WidgetNode, context: ResolveContext): UnavailableReason | null {
  const rule = widget.visibility;

  if (context.recoveryMode && widget.type.startsWith("plugin.")) {
    return {
      kind: "recovery",
      summary: "Hidden in Safe Mode",
      nextStep: "Leave Safe Mode to use widgets provided by extensions.",
      resolveHref: "/settings/recovery",
    };
  }

  if (rule.requiresConnection) {
    const state = context.connections[rule.requiresConnection] ?? "notConfigured";
    if (state !== "connected") {
      const explanation = CONNECTION_EXPLANATIONS[state];
      return {
        kind: "connection",
        summary: explanation.summary,
        nextStep: explanation.nextStep,
        resolveHref: `/settings/connections/${rule.requiresConnection}`,
      };
    }
  }

  if (rule.requiresBridge && !context.bridgeAvailable) {
    return {
      kind: "bridge",
      summary: "Nexus Desktop is not running",
      nextStep: "Open the Nexus OS app on your Mac to launch applications and arrange windows from here.",
      resolveHref: "/settings/desktop",
    };
  }

  if (rule.requiresPermission) {
    const state = context.permissions[rule.requiresPermission] ?? "notRequested";
    if (state !== "granted") {
      return {
        kind: "permission",
        summary: "macOS permission needed",
        nextStep:
          state === "denied"
            ? "This was declined earlier. Open Permissions to turn it back on in System Settings."
            : "Grant this permission so Nexus OS can do this for you.",
        resolveHref: `/settings/permissions/${rule.requiresPermission}`,
      };
    }
  }

  if (rule.hours && !hourInRange(context.now.getHours(), rule.hours.from, rule.hours.to)) {
    return {
      kind: "schedule",
      summary: "Outside its scheduled hours",
      nextStep: `This widget is set to appear between ${rule.hours.from}:00 and ${rule.hours.to}:00.`,
      resolveHref: null,
    };
  }

  return null;
}

/** Computes the CSS custom properties for the whole shell from preferences. */
export function styleVariablesFor(document: ConfigDocument, context: ResolveContext): Record<string, string> {
  const preferences = document.preferences;
  const { accessibility } = context;

  // Transparency and animation are clamped here, once, so no component can
  // accidentally ignore the user's accessibility choices.
  const transparency = accessibility.reducedTransparency || accessibility.highContrast
    ? 1
    : preferences.panelTransparency;

  const density = preferences.density === "compact" ? 0.82 : 1;

  return {
    "--nx-radius": `${preferences.cornerRadius}px`,
    "--nx-radius-small": `${Math.max(4, Math.round(preferences.cornerRadius * 0.55))}px`,
    "--nx-panel-opacity": transparency.toFixed(3),
    "--nx-font-scale": accessibility.fontScale.toFixed(3),
    "--nx-density": density.toFixed(3),
    "--nx-space-unit": `${(8 * density).toFixed(2)}px`,
    "--nx-animation-scale": animationScaleFor(document, context).toFixed(3),
    "--nx-contrast-boost": accessibility.highContrast ? "1" : "0",
  };
}

/**
 * A single number every animation in the product multiplies its duration by.
 * Reduced motion pins it to zero; low power halves it; the user's own
 * "animation intensity" slider scales it.
 */
export function animationScaleFor(document: ConfigDocument, context: ResolveContext): number {
  if (context.accessibility.reducedMotion) return 0;
  const base = document.preferences.animationIntensity;
  const powerFactor = context.power?.lowPowerMode ? 0.5 : 1;
  return Math.max(0, Math.min(1, base * powerFactor));
}

export function resolvePage(document: ConfigDocument, page: Page, context: ResolveContext): ResolvedPage {
  const breakpoint = breakpointFor(context.viewportWidth);
  const columns = COLUMNS_FOR_BREAKPOINT[breakpoint];

  const zones: ResolvedZone[] = page.zones.map((zone) => {
    const widgets = page.widgets
      .filter((widget) => widget.zone === zone.id)
      .sort((a, b) => {
        // Pinned widgets always lead, then explicit order, then priority.
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.priority - b.priority;
      })
      .map((node): ResolvedWidget => {
        const minimumWidth = node.visibility.minimumWidth;
        const tooNarrow = minimumWidth !== null && context.viewportWidth < minimumWidth;
        return {
          node,
          columns: scaleSpan(node.span.columns, columns),
          rows: node.span.rows,
          // A widget the display is too narrow for is dropped silently — that is a
          // layout decision, not a fault the user needs to act on.
          hiddenByUser: node.visibility.hidden || tooNarrow,
          unavailable: evaluateAvailability(node, context),
        };
      })
      .filter((resolved) => !resolved.hiddenByUser);

    return { zone, layout: zone.layout, columns, widgets };
  });

  return {
    page,
    breakpoint,
    columns,
    zones,
    styleVariables: styleVariablesFor(document, context),
    animationScale: animationScaleFor(document, context),
  };
}
