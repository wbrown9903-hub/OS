import type { WidgetDefinition } from "@nexus/schemas";
import { emptyMessageProperty, refreshProperty, titleProperty } from "../helpers.js";

/**
 * A watch-only view of public addresses.
 *
 * There is deliberately no field here for a seed phrase, a private key or a
 * keystore file, and there never will be. Nexus OS reads public balances from a
 * public explorer and cannot move funds.
 */
export const cryptoPortfolioWidget: WidgetDefinition = {
  type: "finance.cryptoPortfolio",
  name: "Crypto portfolio (watch only)",
  summary: "Balances for public addresses you paste in. Watch only — Nexus OS can never move funds.",
  category: "Finance",
  icon: "bitcoinsign.circle",
  defaultSpan: { columns: 4, rows: 3 },
  minimumSpan: { columns: 3, rows: 2 },
  requiresConnection: "market-data",
  dataEndpoint: "/api/widgets/crypto/portfolio",
  defaultRefreshSeconds: 300,
  helpTopicId: "widget-crypto-portfolio",
  previewHint: "Public addresses only. Never enter a seed phrase or private key here, or anywhere else in Nexus OS.",
  schema: {
    title: titleProperty("Portfolio"),
    addresses: {
      kind: "list",
      label: "Addresses to watch",
      help: "Paste public addresses only — the ones you would give someone to receive funds. Nexus OS never asks for a seed phrase or private key, and cannot spend from a watched address.",
      defaultValue: [],
      itemLabel: "Address",
      itemSchema: {
        label: {
          kind: "text",
          label: "Label",
          help: "What to call this address, for example “savings”.",
          defaultValue: "",
          maxLength: 40,
        },
        network: {
          kind: "select",
          label: "Network",
          help: "Which chain this address belongs to.",
          defaultValue: "bitcoin",
          options: [
            { value: "bitcoin", label: "Bitcoin" },
            { value: "ethereum", label: "Ethereum" },
            { value: "solana", label: "Solana" },
            { value: "litecoin", label: "Litecoin" },
          ],
        },
        publicAddress: {
          kind: "text",
          label: "Public address",
          help: "The receiving address. If what you are about to paste is a list of words, stop — that is a seed phrase and it does not belong here.",
          defaultValue: "",
          maxLength: 120,
        },
      },
      group: "Content",
    },
    displayCurrency: {
      kind: "select",
      label: "Show values in",
      help: "The currency balances are converted into for display.",
      defaultValue: "GBP",
      options: [
        { value: "GBP", label: "Pounds (GBP)" },
        { value: "USD", label: "US dollars (USD)" },
        { value: "EUR", label: "Euros (EUR)" },
        { value: "none", label: "Coin amounts only" },
      ],
      group: "Appearance",
    },
    hideBalances: {
      kind: "toggle",
      label: "Blur the amounts until I ask",
      help: "Useful on a shared screen or while streaming. Amounts are revealed with one click.",
      defaultValue: false,
      group: "Behaviour",
    },
    showAllocation: {
      kind: "toggle",
      label: "Show the split",
      help: "Adds a small bar showing how the total is divided between addresses.",
      defaultValue: true,
      group: "Appearance",
    },
    show24hChange: {
      kind: "toggle",
      label: "Show the day's change",
      help: "Adds the change over the last 24 hours, in words as well as colour.",
      defaultValue: true,
      group: "Appearance",
    },
    emptyMessage: emptyMessageProperty("No addresses added yet."),
    refreshSeconds: refreshProperty(300),
  },
};
