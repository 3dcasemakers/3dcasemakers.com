// wa.me needs the full international number with NO "+", spaces or leading
// zeros. Admins often save the store number as a plain 10-digit Indian
// mobile ("6369418105") — wa.me then treats "63" as a country code and the
// chat opens for the wrong number. This normalises any Indian-style input.
export function toWhatsAppNumber(raw: string | null | undefined, fallback = ""): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return fallback;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}

// Order-status WhatsApp message templates (Admin -> Settings -> Order
// WhatsApp Messages). Placeholders are replaced per order.
export const WA_ORDER_TEMPLATE_KEYS = [
  { key: "waTplConfirmed", status: "processing", label: "Order confirmed / processing" },
  { key: "waTplReadyToShip", status: "ready_to_ship", label: "Ready to ship (with tracking ID)" },
  { key: "waTplShipped", status: "shipped", label: "Shipped" },
  { key: "waTplOutForDelivery", status: "out_for_delivery", label: "Out for delivery" },
  { key: "waTplDelivered", status: "delivered", label: "Delivered (ask for review)" },
  { key: "waTplCancelled", status: "cancelled", label: "Cancelled" },
] as const;

export const WA_DEFAULT_TEMPLATES: Record<string, string> = {
  waTplConfirmed: "Hi {name}, greetings from {store}! 👋\n\nYour order {order} is confirmed and being prepared.\nPhone Model: {models}\nTotal Bill: ₹{total} (Paid online)\n\nWe'll share the tracking ID once it ships.",
  waTplReadyToShip: "Hi {name}, greetings from {store}! 👋\n\nOrder ID: {order}\nPhone Model: {models}\nTotal Bill: ₹{total}\nTracking ID: {tracking}\nCourier: {courier} — track at {track_link}",
  waTplShipped: "Hi {name}, your {store} order {order} has been shipped! 🚚\n\nTracking ID: {tracking}\nCourier: {courier} — track at {track_link}",
  waTplOutForDelivery: "Hi {name}, your {store} order {order} is out for delivery today 📦\nPlease keep your phone handy for the delivery call.",
  waTplDelivered: "Hi {name}, thanks for shopping with us! 🙏\n\nOrder ID: {order}\nKindly share the image of the product and also make a review here:\n{review_link}",
  waTplCancelled: "Hi {name}, your {store} order {order} has been cancelled. If this wasn't expected, just reply here and we'll help.",
};

export function fillOrderTemplate(template: string, o: any, opts: { trackingId?: string; storeName?: string; siteUrl?: string } = {}) {
  const stateLower = String(o.state || "").trim().toLowerCase();
  const isTN = stateLower.includes("tamil") || stateLower.includes("pondicherry") || stateLower.includes("puducherry");
  // Tamil Nadu orders store the courier the customer picked at checkout.
  const isPostOffice = o.courier === "post_office";
  const useST = o.courier === "st_courier" || (!o.courier && isTN);
  const models = (o.items || []).map((i: any) => i.selectedModel).filter(Boolean).join(", ");
  const siteUrl = (opts.siteUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const tracking = opts.trackingId ?? o.trackingId;
  return template
    .replace(/\{name\}/g, o.customerName || "there")
    .replace(/\{order\}/g, o.id || "")
    .replace(/\{models\}/g, models || "-")
    .replace(/\{total\}/g, String(o.total ?? ""))
    .replace(/\{tracking\}/g, tracking || "will be shared once shipped")
    .replace(/\{courier\}/g, isPostOffice ? "Post Office" : useST ? "ST Courier" : "India Post")
    .replace(/\{track_link\}/g, useST ? "https://stcourier.com/track/shipment" : "https://www.indiapost.gov.in/")
    .replace(/\{status\}/g, String(o.status || "").replace(/_/g, " "))
    .replace(/\{review_link\}/g, `${siteUrl}/reviews`)
    .replace(/\{track_order\}/g, `${siteUrl}/track-order`)
    .replace(/\{store\}/g, opts.storeName || "3DCaseMakers");
}
