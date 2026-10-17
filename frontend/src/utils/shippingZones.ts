// Zone-based shipping, replacing the old single flat "other states" fee.
// Modeled on the India courier zone map Hari sent (distance bands from the
// Tamil Nadu warehouse: 99/109/119/129/139/149; every rate ends in 9). Tamil Nadu & Puducherry stay
// free; every other state is grouped into a distance zone with its own flat
// rate. Fully editable from Admin -> Content -> Store Config -> Shipping Zones
// (admin can rename zones, change rates, and move states between zones).

export const ALL_INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

export interface ShippingZone {
  id: string;
  name: string;
  rate: number; // ₹ flat rate for any state in this zone. 0 = free.
  states: string[];
}

// Default zone map, built from the reference India zone chart:
// closest states to Tamil Nadu cost the least, the farthest (J&K, Ladakh,
// Himachal, Lakshadweep) cost the most.
export function defaultShippingZones(): ShippingZone[] {
  return [
    {
      id: "free",
      name: "Free Shipping (Home State)",
      rate: 0,
      states: ["Tamil Nadu", "Puducherry"],
    },
    {
      id: "zone100",
      name: "Zone 99 — Nearby South",
      rate: 99,
      states: ["Kerala", "Karnataka", "Andhra Pradesh", "Telangana"],
    },
    {
      id: "zone110",
      name: "Zone 109 — West & East Coast",
      rate: 109,
      states: ["Goa", "Maharashtra", "Odisha", "Dadra and Nagar Haveli and Daman and Diu"],
    },
    {
      id: "zone120",
      name: "Zone 119 — Central & East",
      rate: 119,
      states: ["Gujarat", "Madhya Pradesh", "Chhattisgarh", "West Bengal", "Jharkhand", "Bihar"],
    },
    {
      id: "zone130",
      name: "Zone 129 — North & Northeast",
      rate: 129,
      states: [
        "Rajasthan", "Uttar Pradesh", "Delhi", "Haryana", "Punjab", "Chandigarh",
        "Uttarakhand", "Sikkim", "Assam", "Meghalaya", "Tripura", "Manipur",
        "Mizoram", "Nagaland", "Arunachal Pradesh",
      ],
    },
    {
      id: "zone140",
      name: "Zone 139 — Far North & Islands",
      rate: 139,
      states: ["Jammu and Kashmir", "Ladakh", "Himachal Pradesh", "Lakshadweep"],
    },
    {
      id: "zone150",
      name: "Zone 149 — Andaman & Nicobar",
      rate: 149,
      states: ["Andaman and Nicobar Islands"],
    },
  ];
}

// Any state typed/selected that isn't listed in any configured zone falls
// back to this rate, so checkout never silently charges ₹0 for an
// unconfigured state.
export const DEFAULT_FALLBACK_SHIPPING_RATE = 139;

export function getShippingRate(
  state: string,
  zones: ShippingZone[],
  fallbackRate: number = DEFAULT_FALLBACK_SHIPPING_RATE
): number {
  if (!state) return fallbackRate;
  const zone = zones.find((z) => z.states.some((s) => s.trim().toLowerCase() === state.trim().toLowerCase()));
  return zone ? zone.rate : fallbackRate;
}

// ---- Photo Frames shipping --------------------------------------------------
// Photo Frame products use their own flat state-based rates (separate from the
// phone-case distance zones above): Tamil Nadu & Puducherry free, Kerala & Karnataka ₹149,
// every other state ₹199. Keep in sync with backend/src/services/orderPricing.js.
export const PHOTO_FRAME_SHIPPING_FREE_STATES = ["Tamil Nadu", "Puducherry"];
export const PHOTO_FRAME_SHIPPING_MID_STATES = ["Kerala", "Karnataka"];
export const PHOTO_FRAME_SHIPPING_MID_RATE = 149;
export const PHOTO_FRAME_SHIPPING_OTHER_RATE = 199;

export function getPhotoFrameShippingRate(state: string): number {
  const s = (state || "").trim().toLowerCase();
  if (!s) return PHOTO_FRAME_SHIPPING_OTHER_RATE;
  if (PHOTO_FRAME_SHIPPING_FREE_STATES.some((x) => x.toLowerCase() === s)) return 0;
  if (PHOTO_FRAME_SHIPPING_MID_STATES.some((x) => x.toLowerCase() === s)) return PHOTO_FRAME_SHIPPING_MID_RATE;
  return PHOTO_FRAME_SHIPPING_OTHER_RATE;
}

// ---- Courier choice -----------------------------------------------------------
// Tamil Nadu & Puducherry: the customer picks a courier at checkout.
//   Single-type cart : ST Courier FREE (~70% home / 30% office pickup),
//                      Post Office ₹99 (99% home delivery).
//   Mixed cart (phone case + photo frame): same as above (ST Courier FREE, Post Office ₹99).
// Kerala + mixed cart: a single option, Post Office ₹149.
// Every other state/cart keeps its zone or photo-frame rate with no choice.
// Keep in sync with backend/src/utils/courier.js.
export type CourierKey = "st_courier" | "post_office";
export const TN_POST_OFFICE_RATE = 99;
export const MIXED_KERALA_RATE = 149;
export const COURIER_LABELS: Record<CourierKey, string> = {
  st_courier: "ST Courier",
  post_office: "Post Office",
};
export const COURIER_NOTES: Record<CourierKey, string> = {
  st_courier: "70% home delivery · 30% collect from nearby ST Courier office",
  post_office: "99% home delivery",
};
export function isTamilNaduState(state: string): boolean {
  const s = (state || "").trim().toLowerCase();
  return s === "tamil nadu" || s === "puducherry" || s === "pondicherry";
}
export function isKeralaState(state: string): boolean {
  return (state || "").trim().toLowerCase() === "kerala";
}

export interface CourierOption { key: CourierKey; price: number }

// The courier options to show at checkout (empty = plain "Standard Shipping").
export function getCourierOptions(hasFrameItems: boolean, hasOtherItems: boolean, state: string): CourierOption[] {
  const mixed = hasFrameItems && hasOtherItems;
  if (isTamilNaduState(state)) {
    return [{ key: "st_courier", price: 0 }, { key: "post_office", price: TN_POST_OFFICE_RATE }];
  }
  if (mixed && isKeralaState(state)) return [{ key: "post_office", price: MIXED_KERALA_RATE }];
  return [];
}

// Cart-level shipping. Phone-case/other products use the zone-based rate; Photo
// Frame products use their own rate. A mixed cart (frame + phone case) pays the
// Photo Frame shipping only. Keep in sync with backend/src/services/orderPricing.js.
export function calculateCartShipping(
  hasFrameItems: boolean,
  hasOtherItems: boolean,
  state: string,
  zones: ShippingZone[],
  fallbackRate: number = DEFAULT_FALLBACK_SHIPPING_RATE,
  courier: CourierKey = "st_courier"
): number {
  // Courier rules (TN / Puducherry choice, Kerala mixed cart): the option decides the charge.
  const options = getCourierOptions(hasFrameItems, hasOtherItems, state);
  if (options.length) return (options.find((o) => o.key === courier) || options[0]).price;
  if (hasFrameItems) return getPhotoFrameShippingRate(state);
  if (hasOtherItems) return getShippingRate(state, zones, fallbackRate);
  return 0;
}
