// Plain text email templates — MVP. No HTML.

export interface OrderConfirmationBuyerParams {
  orderId: string;
  buyerName: string;
  totalCents: number;
  currency: string;
  items: Array<{ title: string; priceCents: number }>;
  channelName: string;
}

export interface OrderNotificationSellerParams {
  orderId: string;
  sellerName: string;
  totalCents: number;
  currency: string;
  items: Array<{ title: string; priceCents: number }>;
  shippingName: string;
  shippingLine1: string;
  shippingSuburb: string;
  shippingState: string;
  shippingPostcode: string;
  channelName: string;
}

export interface ShippingConfirmationBuyerParams {
  orderId: string;
  buyerName: string;
  trackingNumber: string;
  trackingCarrier: string;
  channelName: string;
}

function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export function orderConfirmationBuyerTemplate(params: OrderConfirmationBuyerParams): {
  subject: string;
  text: string;
} {
  const itemLines = params.items
    .map((item) => `  - ${item.title} (${formatCents(item.priceCents, params.currency)})`)
    .join("\n");

  return {
    subject: `Your ${params.channelName} order #${params.orderId.slice(-8).toUpperCase()} is confirmed`,
    text: [
      `Hi ${params.buyerName},`,
      "",
      `Thank you for your purchase on ${params.channelName}! Your order has been confirmed.`,
      "",
      `Order ID: ${params.orderId}`,
      `Total: ${formatCents(params.totalCents, params.currency)}`,
      "",
      "Items:",
      itemLines,
      "",
      "The seller will prepare your order and ship it soon.",
      "You'll receive another email when it's on its way.",
      "",
      "Thanks,",
      `The ${params.channelName} Team`,
    ].join("\n"),
  };
}

export function orderNotificationSellerTemplate(params: OrderNotificationSellerParams): {
  subject: string;
  text: string;
} {
  const itemLines = params.items
    .map((item) => `  - ${item.title} (${formatCents(item.priceCents, params.currency)})`)
    .join("\n");

  return {
    subject: `New order on ${params.channelName} — #${params.orderId.slice(-8).toUpperCase()}`,
    text: [
      `Hi ${params.sellerName},`,
      "",
      `You have a new order on ${params.channelName}!`,
      "",
      `Order ID: ${params.orderId}`,
      `Proceeds: ${formatCents(params.totalCents, params.currency)}`,
      "",
      "Items sold:",
      itemLines,
      "",
      "Ship to:",
      `  ${params.shippingName}`,
      `  ${params.shippingLine1}`,
      `  ${params.shippingSuburb} ${params.shippingState} ${params.shippingPostcode}`,
      "",
      "Please pack and ship the item as soon as possible.",
      "",
      "Thanks,",
      `The ${params.channelName} Team`,
    ].join("\n"),
  };
}

export function shippingConfirmationBuyerTemplate(params: ShippingConfirmationBuyerParams): {
  subject: string;
  text: string;
} {
  return {
    subject: `Your ${params.channelName} order #${params.orderId.slice(-8).toUpperCase()} has shipped`,
    text: [
      `Hi ${params.buyerName},`,
      "",
      `Great news — your ${params.channelName} order is on its way!`,
      "",
      `Order ID: ${params.orderId}`,
      `Carrier: ${params.trackingCarrier}`,
      `Tracking number: ${params.trackingNumber}`,
      "",
      "Use your carrier's website to track your parcel.",
      "",
      "Thanks,",
      `The ${params.channelName} Team`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Phase 3a notification templates (placeholder — content TBD)
// ---------------------------------------------------------------------------

export interface ScoreNudgeParams {
  entityId: string;
  nudgeKey?: string;
  channelName: string;
}

export function scoreNudgeTemplate(params: ScoreNudgeParams): {
  subject: string;
  text: string;
} {
  return {
    subject: `Improve your ${params.channelName} listing score`,
    text: [
      "Hi,",
      "",
      "Your listing has room for improvement. Adding more details can help it sell faster.",
      "",
      `Log in to ${params.channelName} to update your listing.`,
      "",
      "Thanks,",
      `The ${params.channelName} Team`,
    ].join("\n"),
  };
}

export interface ReportActionedParams {
  entityId: string;
  channelName: string;
}

export function reportActionedTemplate(params: ReportActionedParams): {
  subject: string;
  text: string;
} {
  return {
    subject: "Your report has been actioned",
    text: [
      "Hi,",
      "",
      "We've reviewed your report and taken appropriate action.",
      "",
      `Thanks for helping keep ${params.channelName} safe.`,
      "",
      `The ${params.channelName} Trust & Safety Team`,
    ].join("\n"),
  };
}

export interface ReportReinstatedParams {
  entityId: string;
  channelName: string;
}

export function reportReinstatedTemplate(params: ReportReinstatedParams): {
  subject: string;
  text: string;
} {
  return {
    subject: "Your listing has been reinstated",
    text: [
      "Hi,",
      "",
      `After review, your listing has been reinstated on ${params.channelName}.`,
      "",
      "If you have any questions, please contact support.",
      "",
      `The ${params.channelName} Trust & Safety Team`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Phase 2B admin alert templates
// ---------------------------------------------------------------------------

export interface TrackingExceptionAdminParams {
  orderId: string;
  trackingNumber?: string | null;
  lastTrackingStatus?: string | null;
  channelName: string;
}

export function trackingExceptionAdminTemplate(params: TrackingExceptionAdminParams): {
  subject: string;
  text: string;
} {
  return {
    subject: `[${params.channelName} Alert] Tracking exception — order #${params.orderId.slice(-8).toUpperCase()}`,
    text: [
      `${params.channelName} Admin Alert — Tracking Exception`,
      "",
      `Order ID: ${params.orderId}`,
      params.trackingNumber ? `Tracking Number: ${params.trackingNumber}` : "Tracking Number: (none)",
      params.lastTrackingStatus ? `Last Status: ${params.lastTrackingStatus}` : "Last Status: (unknown)",
      "",
      "This order has a tracking exception and may require manual review.",
      "Please check the carrier portal and take appropriate action.",
      "",
      `— ${params.channelName} Platform`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Sell-flow templates (Phase 1 task 8)
// ---------------------------------------------------------------------------

export interface ListingPublishedSellerParams {
  listingTitle: string;
  handle: string;
  /** Absolute URL of the live listing (derived from the channel domain). */
  listingUrl?: string | null;
  strengthScore?: number | null;
  channelName: string;
}

export function listingPublishedSellerTemplate(params: ListingPublishedSellerParams): {
  subject: string;
  text: string;
} {
  const scoreLine =
    typeof params.strengthScore === "number"
      ? `Listing strength: ${params.strengthScore}/100`
      : null;
  const urlLine = params.listingUrl ? `View it live: ${params.listingUrl}` : null;

  return {
    subject: `Your listing is live on ${params.channelName} — ${params.listingTitle}`,
    text: [
      `Your listing "${params.listingTitle}" is now live on ${params.channelName}.`,
      "",
      ...(urlLine ? [urlLine, ""] : []),
      ...(scoreLine ? [scoreLine, ""] : []),
      "What happens next:",
      "  1. Buyers can find your item in search right now.",
      "  2. When it sells, the buyer pays securely through the platform.",
      "  3. We email you a prepaid shipping label (if you chose one).",
      "  4. You get paid once the item is delivered.",
      "",
      "Want to sell more? Listing another similar item takes under a minute",
      "with \"List another like this\" from your listings page.",
      "",
      "Thanks,",
      `The ${params.channelName} Team`,
    ].join("\n"),
  };
}
