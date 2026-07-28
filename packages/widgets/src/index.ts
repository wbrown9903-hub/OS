import { WidgetRegistry, type WidgetDefinition } from "@nexus/schemas";

import { clockWidget } from "./essentials/clock.js";
import { favouriteAppsWidget } from "./essentials/favourite-apps.js";
import { notesWidget } from "./essentials/notes.js";
import { onboardingChecklistWidget } from "./essentials/onboarding-checklist.js";
import { quickLinksWidget } from "./essentials/quick-links.js";
import { recentFilesWidget } from "./essentials/recent-files.js";
import { searchBoxWidget } from "./essentials/search-box.js";
import { systemStatusWidget } from "./essentials/system-status.js";

import { breakReminderWidget } from "./games/break-reminder.js";
import { playSessionWidget } from "./games/play-session.js";
import { runescapeHeroWidget } from "./games/runescape-hero.js";
import { runescapeNewsWidget } from "./games/runescape-news.js";

import { chatgptCardWidget } from "./ai/chatgpt-card.js";
import { claudeCardWidget } from "./ai/claude-card.js";
import { conversationHistoryWidget } from "./ai/conversation-history.js";
import { mcpHealthWidget } from "./ai/mcp-health.js";
import { promptRunnerWidget } from "./ai/prompt-runner.js";
import { savedPromptsWidget } from "./ai/saved-prompts.js";

import { customMetricWidget } from "./commerce/custom-metric.js";
import { goalProgressWidget } from "./commerce/goal-progress.js";
import { shopifyAverageOrderValueWidget } from "./commerce/shopify-average-order-value.js";
import { shopifyFulfilmentQueueWidget } from "./commerce/shopify-fulfilment-queue.js";
import { shopifyOrdersTodayWidget } from "./commerce/shopify-orders-today.js";
import { shopifyRecentOrdersWidget } from "./commerce/shopify-recent-orders.js";
import { shopifySalesTodayWidget } from "./commerce/shopify-sales-today.js";
import { wooRevenueWidget } from "./commerce/woocommerce-revenue.js";
import { wordpressCommentsWidget } from "./commerce/wordpress-comments.js";
import { wordpressPostsWidget } from "./commerce/wordpress-posts.js";
import { wordpressSiteStatusWidget } from "./commerce/wordpress-site-status.js";

import { backlinksWidget } from "./knowledge/backlinks.js";
import { knowledgeSearchWidget } from "./knowledge/knowledge-search.js";
import { projectBoardWidget } from "./knowledge/project-board.js";
import { recentNotesWidget } from "./knowledge/recent-notes.js";

import { webhookTriggerWidget } from "./automation/webhook-trigger.js";
import { workflowRunButtonWidget } from "./automation/workflow-run-button.js";
import { workflowStatusWidget } from "./automation/workflow-status.js";

import { applicationCardWidget } from "./system/application-card.js";
import { launcherGroupWidget } from "./system/launcher-group.js";
import { permissionStatusWidget } from "./system/permission-status.js";
import { workspaceSwitcherWidget } from "./system/workspace-switcher.js";

import { embeddedWebCardWidget } from "./web/embedded-card.js";
import { externalLinkWidget } from "./web/external-link.js";

import { cryptoPortfolioWidget } from "./finance/crypto-portfolio.js";
import { watchlistWidget } from "./finance/watchlist.js";

export * from "./helpers.js";

/**
 * The built-in catalogue.
 *
 * Adding a widget to Nexus OS means writing one definition file and adding it to
 * this list. Everything else — the gallery entry, the inspector, the validator,
 * the defaults, the reset behaviour, the help text — is derived from it.
 */
export const builtInWidgets: WidgetDefinition[] = [
  // Essentials
  clockWidget,
  quickLinksWidget,
  notesWidget,
  recentFilesWidget,
  favouriteAppsWidget,
  systemStatusWidget,
  onboardingChecklistWidget,
  searchBoxWidget,
  // Games
  runescapeHeroWidget,
  runescapeNewsWidget,
  playSessionWidget,
  breakReminderWidget,
  // AI
  claudeCardWidget,
  chatgptCardWidget,
  promptRunnerWidget,
  savedPromptsWidget,
  mcpHealthWidget,
  conversationHistoryWidget,
  // Commerce
  shopifySalesTodayWidget,
  shopifyOrdersTodayWidget,
  shopifyRecentOrdersWidget,
  shopifyAverageOrderValueWidget,
  shopifyFulfilmentQueueWidget,
  wordpressSiteStatusWidget,
  wordpressPostsWidget,
  wordpressCommentsWidget,
  wooRevenueWidget,
  customMetricWidget,
  goalProgressWidget,
  // Knowledge
  knowledgeSearchWidget,
  recentNotesWidget,
  projectBoardWidget,
  backlinksWidget,
  // Automation
  workflowStatusWidget,
  workflowRunButtonWidget,
  webhookTriggerWidget,
  // System
  launcherGroupWidget,
  applicationCardWidget,
  workspaceSwitcherWidget,
  permissionStatusWidget,
  // Web
  embeddedWebCardWidget,
  externalLinkWidget,
  // Finance
  cryptoPortfolioWidget,
  watchlistWidget,
];

/** A fresh registry holding the built-in catalogue. */
export function createWidgetRegistry(extra: WidgetDefinition[] = []): WidgetRegistry {
  return new WidgetRegistry().registerAll([...builtInWidgets, ...extra]);
}

/** The registry the web app uses. Plugins register into their own instance. */
export const widgetRegistry = createWidgetRegistry();

export {
  clockWidget,
  quickLinksWidget,
  notesWidget,
  recentFilesWidget,
  favouriteAppsWidget,
  systemStatusWidget,
  onboardingChecklistWidget,
  searchBoxWidget,
  runescapeHeroWidget,
  runescapeNewsWidget,
  playSessionWidget,
  breakReminderWidget,
  claudeCardWidget,
  chatgptCardWidget,
  promptRunnerWidget,
  savedPromptsWidget,
  mcpHealthWidget,
  conversationHistoryWidget,
  shopifySalesTodayWidget,
  shopifyOrdersTodayWidget,
  shopifyRecentOrdersWidget,
  shopifyAverageOrderValueWidget,
  shopifyFulfilmentQueueWidget,
  wordpressSiteStatusWidget,
  wordpressPostsWidget,
  wordpressCommentsWidget,
  wooRevenueWidget,
  customMetricWidget,
  goalProgressWidget,
  knowledgeSearchWidget,
  recentNotesWidget,
  projectBoardWidget,
  backlinksWidget,
  workflowStatusWidget,
  workflowRunButtonWidget,
  webhookTriggerWidget,
  launcherGroupWidget,
  applicationCardWidget,
  workspaceSwitcherWidget,
  permissionStatusWidget,
  embeddedWebCardWidget,
  externalLinkWidget,
  cryptoPortfolioWidget,
  watchlistWidget,
};
