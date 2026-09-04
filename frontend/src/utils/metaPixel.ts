// ─────────────────────────────────────────────────────────────────────────────
// 3DCaseMakers — Meta Pixel helper (Browser) + CAPI deduplication support
// Pixel ID is hardcoded below (no admin panel / DB config anymore). To change
// it, just edit META_PIXEL_ID and redeploy the frontend.
// ─────────────────────────────────────────────────────────────────────────────
import { API_URL } from "./api";

// ── Set your Meta Pixel ID here ──────────────────────────────────────────────
const META_PIXEL_ID = "1437891504826595";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

let initialized = false;
let initPromise: Promise<boolean> | null = null;

// ─── Inject the standard Meta Pixel bootstrap snippet, then init with
// META_PIXEL_ID above. Safe to call multiple times. ──────────────────────────
export function initMetaPixel(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    if (!META_PIXEL_ID || typeof window === "undefined") {
      resolve(false);
      return;
    }

    if (window.fbq) {
      window.fbq("init", META_PIXEL_ID);
      window.fbq("track", "PageView");
      initialized = true;
      resolve(true);
      return;
    }

    /* eslint-disable */
    (function (...args: any[]) {
      const [f, b, e, v] = args;
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const t = b.createElement(e);
      t.async = true;
      t.src = v;
      const s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */

    window.fbq!("init", META_PIXEL_ID);
    window.fbq!("track", "PageView");
    initialized = true;
    resolve(true);
  });

  return initPromise;
}

// ─── Generate unique event_id for deduplication ───────────────────────────────
// Both browser pixel and CAPI must send the SAME event_id so Meta deduplicates.
export function generateEventId(): string {
  return `so_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Read _fbp / _fbc cookies (improves Meta match rate) ─────────────────────
export function getFbCookies(): { fbp: string; fbc: string } {
  if (typeof document === "undefined") return { fbp: "", fbc: "" };
  const cookies = document.cookie.split(";").reduce<Record<string, string>>((acc, c) => {
    const [k, v] = c.trim().split("=");
    acc[k] = v ?? "";
    return acc;
  }, {});
  return { fbp: cookies["_fbp"] ?? "", fbc: cookies["_fbc"] ?? "" };
}

function fireWhenReady(eventName: string, params?: Record<string, unknown>, eventId?: string, attempt = 0): void {
  if (typeof window === "undefined") return;

  if (typeof window.fbq === "function" && initialized) {
    if (params) {
      window.fbq("track", eventName, params, eventId ? { eventID: eventId } : undefined);
    } else {
      window.fbq("track", eventName);
    }
    return;
  }

  if (attempt < 15) {
    setTimeout(() => fireWhenReady(eventName, params, eventId, attempt + 1), 300);
  }
}

/** Call on every storefront route change */
export function trackPageView(): void {
  fireWhenReady("PageView");
}

/** Product page opened */
export function trackViewContent(params: { productId: string; productName: string; price: number }): void {
  fireWhenReady("ViewContent", {
    content_ids: [params.productId],
    content_name: params.productName,
    content_type: "product",
    value: params.price,
    currency: "INR",
  });
}

/** Item added to cart */
export function trackAddToCart(params: { productId: string; productName: string; price: number; quantity: number }): void {
  fireWhenReady("AddToCart", {
    content_ids: [params.productId],
    content_name: params.productName,
    content_type: "product",
    value: params.price * params.quantity,
    currency: "INR",
    num_items: params.quantity,
  });
}

/** Checkout page opened */
export function trackInitiateCheckout(params: {
  cartItems: Array<{ productId: string; price: number; quantity: number }>;
  total: number;
}): void {
  fireWhenReady("InitiateCheckout", {
    content_ids: params.cartItems.map((i) => i.productId),
    content_type: "product",
    num_items: params.cartItems.reduce((s, i) => s + i.quantity, 0),
    value: params.total,
    currency: "INR",
  });
}

/** Search performed */
export function trackSearch(searchString: string): void {
  fireWhenReady("Search", { search_string: searchString });
}

/** Payment step reached — order about to be placed (COD) */
export function trackAddPaymentInfo(params: {
  cartItems: Array<{ productId: string; price: number; quantity: number }>;
  total: number;
}): void {
  fireWhenReady("AddPaymentInfo", {
    content_ids: params.cartItems.map((i) => i.productId),
    content_type: "product",
    num_items: params.cartItems.reduce((s, i) => s + i.quantity, 0),
    value: params.total,
    currency: "INR",
  });
}

/** Lead — newsletter signup / contact form submit */
export function trackLead(params?: { source?: string }): void {
  fireWhenReady("Lead", params?.source ? { content_name: params.source } : undefined);
}

/** Contact — customer reached out via WhatsApp/phone/email */
export function trackContact(params?: { source?: string }): void {
  fireWhenReady("Contact", params?.source ? { content_name: params.source } : undefined);
}

/**
 * Payment success — fires browser pixel WITH eventID, and mirrors the same
 * event server-side via /api/meta-ads/capi (deduplicated by eventId) so the
 * purchase is still captured even if the customer's browser blocks the pixel.
 */
export function trackPurchase(params: {
  orderId: string;
  total: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  cartItems: Array<{ productId: string; productName: string; price: number; quantity: number }>;
}): void {
  const eventId = generateEventId();
  fireWhenReady(
    "Purchase",
    {
      content_ids: params.cartItems.map((i) => i.productId),
      content_type: "product",
      num_items: params.cartItems.reduce((s, i) => s + i.quantity, 0),
      value: params.total,
      currency: "INR",
      order_id: params.orderId,
    },
    eventId
  );

  const { fbp, fbc } = getFbCookies();
  fetch(`${API_URL}/api/meta-ads/capi`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "Purchase",
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      orderId: params.orderId,
      total: params.total,
      currency: "INR",
      contentIds: params.cartItems.map((i) => i.productId),
      numItems: params.cartItems.reduce((s, i) => s + i.quantity, 0),
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
      fbp,
      fbc,
    }),
  }).catch(() => {});
}
