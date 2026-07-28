import type { WidgetDefinition } from "@nexus/schemas";
import { countProperty, emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/** Recent AI conversations across providers, so a thread is never lost. */
export const conversationHistoryWidget: WidgetDefinition = {
  type: "ai.conversationHistory",
  name: "Conversation history",
  summary: "Recent AI conversations, newest first.",
  category: "AI",
  icon: "clock.arrow.2.circlepath",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "ai-provider",
  dataEndpoint: "/api/widgets/ai/conversations",
  defaultRefreshSeconds: 300,
  helpTopicId: "widget-conversation-history",
  previewHint: "Lists conversations held inside Nexus OS.",
  schema: {
    title: titleProperty("Recent conversations"),
    provider: {
      kind: "select",
      label: "From",
      help: "Limit the list to one provider, or show everything together.",
      defaultValue: "all",
      options: [
        { value: "all", label: "All providers" },
        { value: "claude", label: "Claude" },
        { value: "chatgpt", label: "ChatGPT" },
        { value: "local", label: "Local models" },
      ],
      group: "Data",
    },
    count: countProperty("Conversations shown", 6, 25),
    showPreview: {
      kind: "toggle",
      label: "Show the first line",
      help: "Adds the opening line of each conversation, which makes them much easier to recognise.",
      defaultValue: true,
      group: "Appearance",
    },
    showTokenTotals: {
      kind: "toggle",
      label: "Show usage per conversation",
      help: "Displays tokens used, so you can see which conversations are expensive.",
      defaultValue: false,
      group: "Appearance",
      advanced: true,
    },
    searchable: {
      kind: "toggle",
      label: "Show a search field",
      help: "Searches the titles and first lines of your conversations.",
      defaultValue: true,
      group: "Behaviour",
    },
    emptyMessage: emptyMessageProperty("No conversations yet."),
    refreshSeconds: refreshProperty(300),
  },
};
