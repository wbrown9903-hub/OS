/**
 * The subset of the Shopify Admin REST API that Nexus actually reads.
 *
 * These are declared as the *minimum* shape we depend on. Everything is
 * optional except identifiers, because Shopify adds and removes fields between
 * API versions and a missing field must degrade a number, never throw.
 */

export interface ShopifyMoney {
  amount?: string;
  currency_code?: string;
}

export interface ShopifyPriceSet {
  shop_money?: ShopifyMoney;
  presentment_money?: ShopifyMoney;
}

export interface ShopifyLineItem {
  id?: number;
  title?: string;
  quantity?: number;
  price?: string;
  sku?: string;
  fulfillment_status?: string | null;
}

export interface ShopifyRefund {
  id?: number;
  order_id?: number;
  created_at?: string;
  note?: string | null;
  transactions?: Array<{ amount?: string; currency?: string; kind?: string; status?: string }>;
  refund_line_items?: Array<{ subtotal?: string; quantity?: number }>;
}

export interface ShopifyOrder {
  id: number;
  name?: string;
  order_number?: number;
  created_at?: string;
  processed_at?: string;
  updated_at?: string;
  cancelled_at?: string | null;
  closed_at?: string | null;
  currency?: string;
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  current_total_price?: string;
  total_price_set?: ShopifyPriceSet;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  test?: boolean;
  customer?: { id?: number; first_name?: string | null; last_name?: string | null };
  line_items?: ShopifyLineItem[];
  refunds?: ShopifyRefund[];
  shipping_address?: { city?: string | null; country?: string | null };
}

export interface ShopifyShop {
  id?: number;
  name?: string;
  domain?: string;
  myshopify_domain?: string;
  email?: string;
  currency?: string;
  money_format?: string;
  plan_name?: string;
  plan_display_name?: string;
  timezone?: string;
  iana_timezone?: string;
  created_at?: string;
  country_name?: string;
  /** Present and non-null when the shop is closed/frozen. */
  shop_owner?: string;
}

export interface ShopifyVariant {
  id?: number;
  product_id?: number;
  title?: string;
  sku?: string | null;
  price?: string;
  inventory_quantity?: number;
  inventory_management?: string | null;
  inventory_policy?: string | null;
}

export interface ShopifyProduct {
  id: number;
  title?: string;
  status?: string;
  handle?: string;
  variants?: ShopifyVariant[];
}

/* -------------------------------------------------------------------------- */
/* Nexus-side shapes                                                           */
/* -------------------------------------------------------------------------- */

export interface SalesSummary {
  currency: string;
  /** Gross sales before refunds, in minor units. */
  grossMinor: number;
  /** Refunds in the window, in minor units, as a positive number. */
  refundedMinor: number;
  /** gross − refunded. */
  netMinor: number;
  orderCount: number;
  /** gross ÷ orderCount, rounded to the minor unit. 0 when there are no orders. */
  averageOrderValueMinor: number;
  windowStart: string;
  windowEnd: string;
  fetchedAt: string;
  /** True when the window was truncated because the page budget ran out. */
  truncated: boolean;
}

export interface FulfilmentQueueEntry {
  orderId: string;
  orderName: string;
  placedAt: string;
  itemCount: number;
  currency: string;
  totalMinor: number;
  destination: string;
  /** Whole days the order has been waiting, for the "oldest waiting" badge. */
  waitingDays: number;
}

export interface LowStockEntry {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  quantity: number;
  threshold: number;
}

export interface ShopStatus {
  name: string;
  domain: string;
  myshopifyDomain: string;
  currency: string;
  planName: string;
  timezone: string;
  countryName: string;
  createdAt: string;
}

/** The typed event emitted after a webhook has been verified and de-duplicated. */
export interface ShopifyWebhookEvent {
  /** "shopify". */
  source: "shopify";
  /** Shopify's topic, e.g. "orders/paid". */
  topic: string;
  /** Shopify's delivery id header — unique per delivery attempt group. */
  deliveryId: string;
  /** The object the topic is about, e.g. the order id. */
  subjectId: string;
  /** Nexus kind, e.g. "order.paid". */
  kind: string;
  occurredAt: string;
  currency: string;
  amountMinor: number;
  summary: string;
  /** True when the shop sent a test webhook; widgets must not celebrate these. */
  isTest: boolean;
  /** Redacted payload, safe to store. */
  payload: unknown;
}
