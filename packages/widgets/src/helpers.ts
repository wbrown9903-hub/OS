import type {
  ActionValue,
  AudioSourceValue,
  ImageSourceValue,
  LinkValue,
  PropertyDefinition,
} from "@nexus/schemas";

/**
 * Small builders shared by every widget definition.
 *
 * These exist only so that a widget file can stay a single readable declaration.
 * They deliberately contain no UI: the Studio inspector is derived from the
 * property schema, never written per widget.
 */

export function imageValue(partial: Partial<ImageSourceValue> = {}): ImageSourceValue {
  return {
    mode: "builtIn",
    builtInId: "nexus-abstract-01",
    uploadPath: null,
    remoteURL: null,
    feedId: null,
    altText: "",
    attribution: null,
    ...partial,
  };
}

export function actionValue(partial: Partial<ActionValue> = {}): ActionValue {
  return {
    type: "none",
    target: "",
    parameters: {},
    confirmationRequired: false,
    fallbackURL: null,
    ...partial,
  };
}

export function linkValue(partial: Partial<LinkValue> = {}): LinkValue {
  return { url: "", label: "", openIn: "browser", ...partial };
}

export function audioValue(partial: Partial<AudioSourceValue> = {}): AudioSourceValue {
  return { mode: "builtIn", builtInId: "nexus-chime", uploadPath: null, volume: 0.6, ...partial };
}

/** Heading shown at the top of the widget. Every widget words this identically. */
export function titleProperty(defaultTitle: string, help?: string): PropertyDefinition {
  return {
    kind: "text",
    label: "Heading",
    help: help ?? "The heading shown at the top of this widget. Leave it empty to hide the heading.",
    defaultValue: defaultTitle,
    maxLength: 80,
    group: "Content",
  };
}

export function subtitleProperty(defaultSubtitle: string): PropertyDefinition {
  return {
    kind: "text",
    label: "Supporting line",
    help: "One short line under the heading. Useful for context such as “Updated every 5 minutes”.",
    defaultValue: defaultSubtitle,
    maxLength: 140,
    group: "Content",
  };
}

/** The standard refresh control, so every data-backed widget words it the same way. */
export function refreshProperty(defaultSeconds: number): PropertyDefinition {
  return {
    kind: "duration",
    label: "Refresh every",
    help: "How often Nexus OS asks the service for new information. Longer gaps use less battery and fewer requests against your account limits.",
    defaultValue: defaultSeconds,
    min: 30,
    max: 86400,
    group: "Data",
    advanced: true,
  };
}

/** Wording shown instead of content when there is genuinely nothing to show. */
export function emptyMessageProperty(defaultMessage: string): PropertyDefinition {
  return {
    kind: "text",
    label: "Message when empty",
    help: "Shown when there is nothing to display. Nexus OS never invents a number to fill the space.",
    defaultValue: defaultMessage,
    maxLength: 140,
    group: "Content",
    advanced: true,
  };
}

export function accentProperty(): PropertyDefinition {
  return {
    kind: "color",
    label: "Accent colour",
    help: "Used for the highlight on this widget. “token:accent” follows whichever theme you are using, so it always matches.",
    defaultValue: "token:accent",
    group: "Appearance",
  };
}

export function densityProperty(): PropertyDefinition {
  return {
    kind: "select",
    label: "Row spacing",
    help: "Comfortable is easier to read; compact fits more rows into the same space.",
    defaultValue: "comfortable",
    options: [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" },
    ],
    group: "Appearance",
  };
}

export function countProperty(label: string, defaultCount: number, max = 20): PropertyDefinition {
  return {
    kind: "slider",
    label,
    help: "How many rows to show at once. Anything beyond this is still available when you open the full view.",
    defaultValue: defaultCount,
    min: 1,
    max,
    step: 1,
    group: "Content",
  };
}

export function compareToProperty(): PropertyDefinition {
  return {
    kind: "select",
    label: "Compare with",
    help: "Shows the change against an earlier period, so a number has context instead of standing alone.",
    defaultValue: "yesterday",
    options: [
      { value: "none", label: "Nothing — show the figure on its own" },
      { value: "yesterday", label: "The same time yesterday" },
      { value: "lastWeek", label: "The same day last week" },
      { value: "lastMonth", label: "The same day last month" },
    ],
    group: "Data",
  };
}

export function currencyProperty(): PropertyDefinition {
  return {
    kind: "select",
    label: "Currency display",
    help: "Show amounts in the shop's own currency, or converted into yours using the rate recorded with each order.",
    defaultValue: "shop",
    options: [
      { value: "shop", label: "The shop's currency" },
      { value: "GBP", label: "Pounds (GBP)" },
      { value: "USD", label: "US dollars (USD)" },
      { value: "EUR", label: "Euros (EUR)" },
    ],
    group: "Appearance",
  };
}

export function openInProperty(): PropertyDefinition {
  return {
    kind: "select",
    label: "Open in",
    help: "Where a link opens when you choose it.",
    defaultValue: "browser",
    options: [
      { value: "browser", label: "Your browser" },
      { value: "panel", label: "A panel inside Nexus OS" },
      { value: "desktopApp", label: "The matching Mac app, if it is installed" },
    ],
    group: "Behaviour",
  };
}
