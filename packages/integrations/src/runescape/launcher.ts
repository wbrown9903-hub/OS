/**
 * Jagex Launcher detection and the "Play" action.
 *
 * WHAT THIS MODULE DOES NOT DO — read this first:
 *  - it never asks for, stores, forwards or logs a RuneScape or Jagex account
 *    credential, one-time code or session token. Signing in happens entirely
 *    inside Jagex's own launcher, where it belongs;
 *  - it never launches a game client directly, and never touches a third-party
 *    client;
 *  - it does not itself execute anything. The web app has no shell access. This
 *    module produces a *typed request* that the native Mac Bridge validates
 *    against its own allow-list and permission policy before doing anything.
 *
 * The Bridge owns execution; this owns the vocabulary.
 */

/** The bundle identifiers the Bridge probes, in order of preference. */
export const JAGEX_LAUNCHER_BUNDLE_IDS = ["com.jagex.launcher"] as const;

/** Conventional install locations, checked when the bundle id lookup fails. */
export const JAGEX_LAUNCHER_PATHS = [
  "/Applications/Jagex Launcher.app",
  "~/Applications/Jagex Launcher.app",
] as const;

/** Official download page. The only address the fallback ever opens. */
export const JAGEX_LAUNCHER_DOWNLOAD_URL = "https://www.jagex.com/en-GB/launcher";

/** Official play-in-browser pages, used only when the user chose that option. */
export const OFFICIAL_PLAY_URLS = {
  runescape: "https://www.runescape.com/play-now",
  osrs: "https://oldschool.runescape.com/play-now",
} as const;

export type RuneScapeGameId = keyof typeof OFFICIAL_PLAY_URLS;

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The request the web app sends to the Mac Bridge to find out whether the
 * launcher is installed. It is a *query*: read impact, no side effects, and the
 * Bridge answers it without a confirmation prompt.
 */
export interface AppDetectionRequest {
  /** Bridge action name. Must match the Bridge's allow-list exactly. */
  action: "app.detect";
  /** Schema version, so an older Bridge can refuse politely rather than guess. */
  version: 1;
  /** What we are looking for. */
  subject: {
    label: string;
    bundleIdentifiers: string[];
    /** Absolute or `~`-relative paths. The Bridge expands and canonicalises. */
    candidatePaths: string[];
  };
  /** Read impact means no confirmation is required for this request. */
  impact: "read";
  /** Provenance of the request. A detection probe is issued by Nexus itself. */
  requestOrigin: "system";
}

/** The Bridge's reply. `installed: false` is a normal answer, not an error. */
export interface AppDetectionResult {
  installed: boolean;
  /** Resolved application path when installed. */
  path?: string;
  bundleIdentifier?: string;
  version?: string;
  /** True when the app was running at the time of the probe. */
  running?: boolean;
  /** ISO 8601 moment the Bridge answered. */
  checkedAt: string;
}

/** Builds the detection request for the Jagex Launcher. */
export function jagexLauncherDetectionRequest(): AppDetectionRequest {
  return {
    action: "app.detect",
    version: 1,
    subject: {
      label: "Jagex Launcher",
      bundleIdentifiers: [...JAGEX_LAUNCHER_BUNDLE_IDS],
      candidatePaths: [...JAGEX_LAUNCHER_PATHS],
    },
    impact: "read",
    requestOrigin: "system",
  };
}

/* -------------------------------------------------------------------------- */
/* The Play action                                                             */
/* -------------------------------------------------------------------------- */

/** Launch an installed application by bundle id. Executed by the Bridge. */
export interface LaunchAppAction {
  kind: "launchApp";
  action: "app.launch";
  version: 1;
  bundleIdentifier: string;
  /** Shown in the confirmation sheet and written to the audit log. */
  label: string;
  /** No arguments are ever passed: arguments are where credentials leak. */
  arguments: [];
  impact: "system";
  /** The button the user pressed. Only a user origin can authorise a launch. */
  requestOrigin: "user";
}

/** Open a URL in the user's browser. Executed by the Bridge or the web app. */
export interface OpenUrlAction {
  kind: "openUrl";
  action: "url.open";
  version: 1;
  url: string;
  label: string;
  impact: "read";
  requestOrigin: "user";
}

export type PlayAction = LaunchAppAction | OpenUrlAction;

export interface PlayActionResolution {
  /** The action to perform. Always present — "Play" is never a dead button. */
  action: PlayAction;
  /** Sentence shown on or under the button, so the user knows what will happen. */
  explanation: string;
  /** True when this is the documented fallback rather than the intended path. */
  isFallback: boolean;
  /**
   * When this is a fallback, the reason the preferred path was unavailable and
   * the step that would fix it.
   */
  fallbackReason?: string;
  fallbackNextStep?: string;
}

export interface PlayActionInput {
  game: RuneScapeGameId;
  /** The Bridge's answer to `jagexLauncherDetectionRequest()`, if we have one. */
  detection: AppDetectionResult | null;
  /** False when no Mac is paired, or the Bridge is not running. */
  bridgeAvailable: boolean;
  /** The user's stored preference. Defaults to the launcher. */
  preference?: "launcher" | "browser";
}

/**
 * Decides what the Play button does.
 *
 * The chain is documented and fixed:
 *   1. the user asked for the browser            → open the official play page;
 *   2. Bridge present and launcher installed     → launch the Jagex Launcher;
 *   3. Bridge present, launcher NOT installed    → open the official download page;
 *   4. no Bridge at all                          → open the official play page.
 *
 * Every branch returns a real action, so the button always does something.
 */
export function playAction(input: PlayActionInput): PlayActionResolution {
  const officialPlayUrl = OFFICIAL_PLAY_URLS[input.game];
  const gameName = input.game === "osrs" ? "Old School RuneScape" : "RuneScape";

  if (input.preference === "browser") {
    return {
      action: openUrl(officialPlayUrl, `Play ${gameName} in your browser`),
      explanation: `Opens the official ${gameName} play page in your browser.`,
      isFallback: false,
    };
  }

  if (!input.bridgeAvailable) {
    return {
      action: openUrl(officialPlayUrl, `Play ${gameName} in your browser`),
      explanation: `Opens the official ${gameName} play page in your browser.`,
      isFallback: true,
      fallbackReason: "Nexus cannot start applications because this Mac is not paired with the Nexus Bridge.",
      fallbackNextStep: "Open Nexus Desktop on your Mac and pair it, then the Play button will start the Jagex Launcher instead.",
    };
  }

  if (input.detection?.installed) {
    return {
      action: {
        kind: "launchApp",
        action: "app.launch",
        version: 1,
        bundleIdentifier: input.detection.bundleIdentifier ?? JAGEX_LAUNCHER_BUNDLE_IDS[0],
        label: "Jagex Launcher",
        arguments: [],
        impact: "system",
        requestOrigin: "user",
      },
      explanation: "Opens the Jagex Launcher on your Mac. You sign in there, not in Nexus.",
      isFallback: false,
    };
  }

  return {
    action: openUrl(JAGEX_LAUNCHER_DOWNLOAD_URL, "Get the Jagex Launcher"),
    explanation: "Opens Jagex's official download page so you can install the launcher.",
    isFallback: true,
    fallbackReason: "The Jagex Launcher is not installed on this Mac.",
    fallbackNextStep: "Install the Jagex Launcher from Jagex's official page, then press Play again.",
  };
}

function openUrl(url: string, label: string): OpenUrlAction {
  return { kind: "openUrl", action: "url.open", version: 1, url, label, impact: "read", requestOrigin: "user" };
}

/**
 * Guard used by the Bridge request builder: refuses to build a launch action
 * from anything other than a real user gesture. Model or tool output asking to
 * "press play" must go through the normal confirmation flow instead.
 */
export function assertUserOriginated(origin: "user" | "system" | "model" | "external"): void {
  if (origin !== "user") {
    throw new Error("Only a person pressing the button can start an application. This request came from " + origin + ".");
  }
}
