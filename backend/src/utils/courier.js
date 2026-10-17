// Courier choice for Tamil Nadu orders.
//
// When the delivery state is Tamil Nadu or Puducherry the customer picks one of two couriers
// at checkout:
//   st_courier  - ST Courier, FREE. Roughly 70% home delivery, 30% collect from
//                 the nearest ST Courier office.
//   post_office - Post Office, flat Rs 99. 99% home delivery.
// Every other state keeps its existing zone rate and no choice is offered
// (courier stays NULL; the admin/email logic falls back to the state default).
// Mixed-cart rules above are TN/Puducherry/Kerala only.
// Keep in sync with frontend/src/utils/shippingZones.ts.
const TN_POST_OFFICE_RATE = 99;
// Mixed cart (phone case + photo frame) in Tamil Nadu / Puducherry: same as
// single-type carts (ST Courier free, Post Office Rs 99). Kerala gets a single
// option, Post Office Rs 149 (no choice).
const MIXED_KERALA_RATE = 149;
const COURIERS = {
  st_courier: {
    key: "st_courier",
    name: "ST Courier",
    url: "https://stcourier.com/track/shipment",
    deliveryNote: "70% home delivery · 30% collect from nearby ST Courier office",
  },
  post_office: {
    key: "post_office",
    name: "Post Office",
    url: "https://www.indiapost.gov.in/",
    deliveryNote: "99% home delivery",
  },
};

// Tamil Nadu and Puducherry both get the courier choice. (Name kept as
// isTamilNadu so existing imports keep working.)
function isTamilNadu(state) {
  const s = String(state || "").trim().toLowerCase();
  return s === "tamil nadu" || s === "puducherry" || s === "pondicherry";
}

function isKerala(state) {
  return String(state || "").trim().toLowerCase() === "kerala";
}

// The courier to store for an order.
//  - Tamil Nadu / Puducherry: customer's choice; a missing/unknown value
//    defaults to ST Courier (the cheaper option), never to Post Office.
//  - Kerala with a MIXED cart (phone case + photo frame): always Post Office
//    (single option, Rs 149).
//  - Anything else: null (no courier choice).
function resolveCourier(state, courier, mixedCart = false) {
  if (isTamilNadu(state)) return String(courier || "").trim().toLowerCase() === "post_office" ? "post_office" : "st_courier";
  if (mixedCart && isKerala(state)) return "post_office";
  return null;
}

// Shipping charge decided by the courier choice, or null when the state/cart
// has no courier rule (the normal zone / photo-frame rate then applies).
function courierShipping(state, courier, mixedCart = false) {
  if (isTamilNadu(state)) {
    return courier === "post_office" ? TN_POST_OFFICE_RATE : 0;
  }
  if (mixedCart && isKerala(state)) return MIXED_KERALA_RATE;
  return null;
}

// A courier value that was already resolved + priced by the server
// (orderPricing) and is safe to store as-is. Unknown values become null.
function normalizeCourier(courier) {
  return COURIERS[courier] ? courier : null;
}

// Courier name/tracking link used by emails. Honours the stored choice and
// falls back to the old state-based default for older orders and other states.
function courierInfo(state, courier) {
  if (courier && COURIERS[courier]) return COURIERS[courier];
  const s = String(state || "").trim().toLowerCase();
  const isTNorPondy = s.includes("tamil") || s.includes("pondicherry") || s.includes("puducherry");
  return isTNorPondy ? COURIERS.st_courier : { key: "india_post", name: "India Post", url: COURIERS.post_office.url, deliveryNote: "" };
}

module.exports = { TN_POST_OFFICE_RATE, MIXED_KERALA_RATE, COURIERS, isTamilNadu, isKerala, resolveCourier, courierShipping, normalizeCourier, courierInfo };
