import { themes, type ConfigDocument } from "@nexus/schemas";
import type { RunnableIntent } from "./actions";
import type { PaletteEntry } from "./commands";
import { fuzzyMatchAny } from "./fuzzy";

/**
 * Turning a typed phrase into a *named structured action*.
 *
 * Two rules make this safe rather than clever:
 *
 *   1. A phrase can only ever select one of the actions the shell already knows
 *      how to perform. It never produces a new capability, and it never runs
 *      anything the user could not have reached from a menu.
 *   2. The resulting action is always shown, in words, before it runs. Anything
 *      consequential — changing configuration, asking the Mac Bridge to do
 *      something, leaving the shell — is confirmed first, because a typed phrase
 *      is a weaker signal of intent than choosing a named result from a list.
 */

const VERB_PATTERN =
  /^(?:please\s+)?(open|launch|start|run|go\s*to|goto|show(?:\s+me)?|view|jump\s*to|take\s+me\s+to|switch\s+to|find|search\s+for|display)\s+(.+)$/i;

const FILLER = /^(?:the|my|a|an|to|for|all|some)\s+/i;

interface PhraseContext {
  document: ConfigDocument;
  entries: PaletteEntry[];
}

function stripFiller(text: string): string {
  let value = text.trim().replace(/[?.!]+$/, "");
  while (FILLER.test(value)) value = value.replace(FILLER, "");
  return value.trim();
}

/** Confirmation wrapper applied to every configuration change made by phrase. */
function confirmedConfigChange(intent: RunnableIntent, what: string): RunnableIntent {
  return {
    ...intent,
    confirmation: intent.confirmation ?? {
      title: `${what}?`,
      body: `${intent.detail} You asked for this by typing a phrase, so Nexus OS is checking before it changes anything.`,
      confirmLabel: "Yes, do it",
      destructive: false,
    },
  };
}

/** Phrases that mean something specific regardless of the verb used. */
const SHORTCUTS: Array<{ test: RegExp; build: (context: PhraseContext) => RunnableIntent | null }> = [
  {
    test: /\b(today'?s?\s+orders|orders\s+today|sales\s+today|today'?s?\s+sales|revenue\s+today)\b/i,
    build: () => ({
      title: "Show today's orders",
      detail: "Opens Commerce, which lists today's orders and revenue from your connected store.",
      action: { kind: "navigate", href: "/commerce?range=today" },
      confirmation: null,
    }),
  },
  {
    test: /\b(what'?s\s+connected|connection status|my connections|connected services)\b/i,
    build: () => ({
      title: "Show every connection",
      detail: "Opens Settings › Connections, which lists every service and the state it is in.",
      action: { kind: "navigate", href: "/settings/connections" },
      confirmation: null,
    }),
  },
  {
    test: /\b(dark mode|go dark|night mode)\b/i,
    build: ({ document }) => {
      const target = themes.find((theme) => theme.appearance === "dark" && theme.id !== document.themeId) ?? themes[0]!;
      return confirmedConfigChange(
        {
          title: `Use the ${target.name} theme`,
          detail: `Switches every screen to ${target.name}, a dark theme.`,
          action: {
            kind: "applyOperations",
            operations: [{ op: "set", path: ["themeId"], value: target.id }],
            label: `Use the ${target.name} theme`,
          },
          confirmation: null,
        },
        `Switch to ${target.name}`,
      );
    },
  },
  {
    test: /\b(light mode|go light|day mode|bright theme)\b/i,
    build: () => {
      const target = themes.find((theme) => theme.appearance === "light");
      if (!target) return null;
      return confirmedConfigChange(
        {
          title: `Use the ${target.name} theme`,
          detail: `Switches every screen to ${target.name}, a light theme.`,
          action: {
            kind: "applyOperations",
            operations: [{ op: "set", path: ["themeId"], value: target.id }],
            label: `Use the ${target.name} theme`,
          },
          confirmation: null,
        },
        `Switch to ${target.name}`,
      );
    },
  },
  {
    test: /\b(turn off (?:the )?animations?|stop (?:the )?animations?|reduce motion|less motion|no motion)\b/i,
    build: () =>
      confirmedConfigChange(
        {
          title: "Turn off animation",
          detail: "Everything appears instantly instead of sliding or fading, everywhere in Nexus OS.",
          action: {
            kind: "applyOperations",
            operations: [{ op: "set", path: ["preferences", "animationIntensity"], value: 0 }],
            label: "Turn off animation",
          },
          confirmation: null,
        },
        "Turn off animation",
      ),
  },
  {
    test: /\b(safe mode|recovery mode|repair nexus|something is broken)\b/i,
    build: () => ({
      title: "Open Recovery",
      detail: "Shows Safe Mode and the repair options, and explains what each one does before you use it.",
      action: { kind: "navigate", href: "/settings/recovery" },
      confirmation: null,
    }),
  },
  {
    test: /\b(back ?up|export (?:my )?(?:setup|config|configuration|layout))\b/i,
    build: () => ({
      title: "Open Backup & Restore",
      detail: "Shows export, import and the version history of your configuration.",
      action: { kind: "navigate", href: "/settings/backup" },
      confirmation: null,
    }),
  },
  {
    test: /\b(exit to mac(?:os)?|quit nexus|leave nexus|back to (?:the )?desktop|close nexus)\b/i,
    build: () => ({
      title: "Exit to macOS",
      detail: "Hides the Nexus OS window and returns you to the plain macOS desktop. Nothing is closed or lost.",
      action: { kind: "exitToDesktop" },
      confirmation: {
        title: "Exit to macOS?",
        body: "The Nexus OS window is hidden and you return to your plain desktop. Nothing is closed and nothing is lost.",
        confirmLabel: "Exit to macOS",
        destructive: false,
      },
    }),
  },
  {
    test: /\b(refresh|reload|update) (?:everything|all|connections|services)\b/i,
    build: () => ({
      title: "Refresh every connection",
      detail: "Re-checks every connected service and updates the status shown in the top bar.",
      action: { kind: "refreshServices" },
      confirmation: null,
    }),
  },
];

/**
 * Returns the single structured action a phrase resolves to, or null when the
 * phrase is better served by ordinary search results.
 */
export function interpretPhrase(rawPhrase: string, context: PhraseContext): RunnableIntent | null {
  const phrase = rawPhrase.trim();
  if (phrase.length < 3) return null;

  for (const shortcut of SHORTCUTS) {
    if (shortcut.test.test(phrase)) {
      const intent = shortcut.build(context);
      if (intent) return intent;
    }
  }

  const verbMatch = VERB_PATTERN.exec(phrase);
  if (!verbMatch) return null;

  const verb = (verbMatch[1] ?? "").toLowerCase().replace(/\s+/g, " ");
  const subject = stripFiller(verbMatch[2] ?? "");
  if (!subject) return null;

  // "switch to …" is only ever about workspaces, so it is resolved against them
  // first rather than against every screen in the product.
  if (verb === "switch to") {
    const workspace = context.document.workspaces.find(
      (candidate) => candidate.title.toLowerCase() === subject.toLowerCase(),
    );
    const fuzzy = workspace
      ? null
      : context.document.workspaces
          .map((candidate) => ({ candidate, match: fuzzyMatchAny([candidate.title], subject) }))
          .filter((row) => row.match !== null)
          .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))[0]?.candidate;
    const chosen = workspace ?? fuzzy;
    if (chosen) {
      return {
        title: `Switch to ${chosen.title}`,
        detail: "Changes the active workspace and shows the dashboards belonging to it.",
        action: { kind: "switchWorkspace", workspaceId: chosen.id },
        confirmation: null,
      };
    }
  }

  const ranked = context.entries
    .map((entry) => ({ entry, match: fuzzyMatchAny([entry.title, ...entry.keywords, entry.subtitle], subject) }))
    .filter((row): row is { entry: PaletteEntry; match: NonNullable<ReturnType<typeof fuzzyMatchAny>> } => row.match !== null)
    .sort((a, b) => b.match.score - a.match.score);

  const best = ranked[0];
  if (!best || best.match.score < 100) return null;

  // A phrase that resolves to something consequential is confirmed, even though
  // choosing the same result from the list directly would not be.
  const intent = best.entry.intent;
  const consequential =
    intent.action.kind === "applyOperations" ||
    intent.action.kind === "bridge" ||
    intent.action.kind === "exitToDesktop" ||
    intent.action.kind === "undo" ||
    intent.action.kind === "redo";

  if (!consequential) return intent;
  return confirmedConfigChange(intent, intent.title);
}
