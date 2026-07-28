/**
 * Pure functions that turn Shopify payloads into the shapes Nexus stores.
 *
 * Kept separate from the client so every mapping can be tested against a
 * fixture with no HTTP involved, and so a Shopify field rename shows up as one
 * failing unit test rather than a broken widget.
 */

import { redactObject } from "../security-port.js";
import {
  type CommerceEventInput,
  type MetricSnapshotInput,
  metricSnapshot,
  toIso,
  toMinorUnits,
} from "../core/types.js";
import type {
  FulfilmentQueueEntry,
  LowStockEntry,
  SalesSummary,
  ShopStatus,
  ShopifyOrder,
  ShopifyProduct,
  ShopifyShop,
} from "./types.js";

/** Shopify topic → the kind stored on `CommerceEvent`. */
export const TOPIC_TO_KIND: Record<string, string> = {
  "orders/create": "order.created",
  "orders/paid": "order.paid",
  "orders/updated": "order.updated",
  "orders/cancelled": "order.cancelled",
  "orders/fulfilled": "order.fulfilled",
  "orders/partially_fulfilled": "order.partiallyFulfilled",
  "refunds/create": "order.refunded",
  "checkouts/create": "checkout.created",
  "products/update": "product.updated",
  "inventory_levels/update": "inventory.updated",
  "app/uninstalled": "app.uninstalled",
  "shop/update": "shop.updated",
};

export function kindForTopic(topic: string): string {
  return TOPIC_TO_KIND[topic] ?? `shopify.${topic.replace(/\//g, ".")}`;
}

export function orderCurrency(order: ShopifyOrder, fallback: string): string {
  return (order.currency ?? order.total_price_set?.shop_money?.currency_code ?? fallback ?? "").toUpperCase();
}

export function orderTotalMinor(order: ShopifyOrder, fallbackCurrency: string): number {
  const currency = orderCurrency(order, fallbackCurrency);
  const amount = order.total_price_set?.shop_money?.amount ?? order.total_price ?? order.current_total_price ?? "0";
  return toMinorUnits(amount, currency);
}

export function refundTotalMinor(order: ShopifyOrder, fallbackCurrency: string): number {
  const currency = orderCurrency(order, fallbackCurrency);
  let total = 0;
  for (const refund of order.refunds ?? []) {
    for (const transaction of refund.transactions ?? []) {
      if (transaction.kind && transaction.kind !== "refund") continue;
      if (transaction.status && transaction.status !== "success") continue;
      total += toMinorUnits(transaction.amount, transaction.currency ?? currency);
    }
  }
  return total;
}

export function orderOccurredAt(order: ShopifyOrder): string {
  return toIso(order.processed_at ?? order.created_at ?? new Date().toISOString());
}

export function orderDisplayName(order: ShopifyOrder): string {
  if (order.name) return order.name;
  if (order.order_number !== undefined) return `#${order.order_number}`;
  return `#${order.id}`;
}

/** One order → one `CommerceEvent` row. */
export function commerceEventForOrder(
  connectionId: string,
  order: ShopifyOrder,
  kind: string,
  fallbackCurrency: string,
): CommerceEventInput {
  const currency = orderCurrency(order, fallbackCurrency);
  const amountMinor = kind === "order.refunded" ? refundTotalMinor(order, currency) : orderTotalMinor(order, currency);
  const itemCount = (order.line_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  return {
    connectionId,
    source: "shopify",
    kind,
    externalId: String(order.id),
    currency,
    amountMinor,
    occurredAt: orderOccurredAt(order),
    summary: `${orderDisplayName(order)} — ${itemCount} item${itemCount === 1 ? "" : "s"}`,
    raw: JSON.stringify(redactObject(order)),
  };
}

/**
 * Summarises a set of orders. Sales totals and average order value are computed
 * here rather than trusting a report endpoint, so the number always matches the
 * orders the user can click through to.
 */
export function summariseSales(
  orders: ShopifyOrder[],
  options: { currency: string; windowStart: Date | string; windowEnd: Date | string; fetchedAt: Date | string; truncated?: boolean; includeTestOrders?: boolean },
): SalesSummary {
  const currency = options.currency.toUpperCase();
  let grossMinor = 0;
  let refundedMinor = 0;
  let orderCount = 0;

  for (const order of orders) {
    if (!options.includeTestOrders && order.test === true) continue;
    if (order.cancelled_at) {
      // Cancelled orders still refund, but never count as a sale.
      refundedMinor += refundTotalMinor(order, currency);
      continue;
    }
    grossMinor += orderTotalMinor(order, currency);
    refundedMinor += refundTotalMinor(order, currency);
    orderCount += 1;
  }

  return {
    currency,
    grossMinor,
    refundedMinor,
    netMinor: grossMinor - refundedMinor,
    orderCount,
    averageOrderValueMinor: orderCount === 0 ? 0 : Math.round(grossMinor / orderCount),
    windowStart: toIso(options.windowStart),
    windowEnd: toIso(options.windowEnd),
    fetchedAt: toIso(options.fetchedAt),
    truncated: options.truncated ?? false,
  };
}

/** A sales summary → the four `MetricSnapshot` rows the widgets read. */
export function metricsForSales(connectionId: string, summary: SalesSummary): MetricSnapshotInput[] {
  const window = { start: summary.windowStart, end: summary.windowEnd };
  const money = { currency: summary.currency };
  return [
    metricSnapshot(connectionId, "shopify.sales.gross", window, summary.fetchedAt, { ...money, valueMinor: summary.grossMinor }),
    metricSnapshot(connectionId, "shopify.sales.net", window, summary.fetchedAt, { ...money, valueMinor: summary.netMinor }),
    metricSnapshot(connectionId, "shopify.sales.refunded", window, summary.fetchedAt, { ...money, valueMinor: summary.refundedMinor }),
    metricSnapshot(connectionId, "shopify.orders.count", window, summary.fetchedAt, { valueMinor: summary.orderCount, valueText: String(summary.orderCount) }),
    metricSnapshot(connectionId, "shopify.orders.averageValue", window, summary.fetchedAt, { ...money, valueMinor: summary.averageOrderValueMinor }),
  ];
}

export function fulfilmentQueueFromOrders(orders: ShopifyOrder[], fallbackCurrency: string, now: Date = new Date()): FulfilmentQueueEntry[] {
  return orders
    .filter((order) => !order.cancelled_at && order.fulfillment_status !== "fulfilled")
    .map((order) => {
      const placedAt = orderOccurredAt(order);
      const waitingMs = now.getTime() - Date.parse(placedAt);
      const destination = [order.shipping_address?.city, order.shipping_address?.country].filter(Boolean).join(", ");
      return {
        orderId: String(order.id),
        orderName: orderDisplayName(order),
        placedAt,
        itemCount: (order.line_items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0),
        currency: orderCurrency(order, fallbackCurrency),
        totalMinor: orderTotalMinor(order, fallbackCurrency),
        destination: destination || "No address given",
        waitingDays: Number.isFinite(waitingMs) ? Math.max(0, Math.floor(waitingMs / 86_400_000)) : 0,
      };
    })
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
}

export function lowStockFromProducts(products: ShopifyProduct[], threshold: number): LowStockEntry[] {
  const entries: LowStockEntry[] = [];
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      // Shopify reports quantity 0 for untracked variants, which is not low stock.
      if (!variant.inventory_management) continue;
      const quantity = variant.inventory_quantity ?? 0;
      if (quantity > threshold) continue;
      entries.push({
        productId: String(product.id),
        variantId: String(variant.id ?? ""),
        title: [product.title, variant.title && variant.title !== "Default Title" ? variant.title : null].filter(Boolean).join(" — ") || "Untitled product",
        sku: variant.sku ?? "",
        quantity,
        threshold,
      });
    }
  }
  return entries.sort((a, b) => a.quantity - b.quantity);
}

export function shopStatusFrom(shop: ShopifyShop): ShopStatus {
  return {
    name: shop.name ?? "Your shop",
    domain: shop.domain ?? "",
    myshopifyDomain: shop.myshopify_domain ?? "",
    currency: (shop.currency ?? "").toUpperCase(),
    planName: shop.plan_display_name ?? shop.plan_name ?? "Unknown plan",
    timezone: shop.iana_timezone ?? shop.timezone ?? "",
    countryName: shop.country_name ?? "",
    createdAt: shop.created_at ? toIso(shop.created_at) : "",
  };
}
