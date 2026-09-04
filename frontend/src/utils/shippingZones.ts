// Zone-based shipping, replacing the old single flat "other states" fee.
// Modeled on the India courier zone map Hari sent (distance bands from the
// Tamil Nadu warehouse: 100/110/120/130/140). Tamil Nadu & Puducherry stay
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
      name: "Zone 100 — Nearby South",
      rate: 100,
      states: ["Kerala", "Karnataka", "Andhra Pradesh", "Telangana"],
    },
    {
      id: "zone110",
      name: "Zone 110 — West & East Coast",
      rate: 110,
      states: ["Goa", "Maharashtra", "Odisha", "Dadra and Nagar Haveli and Daman and Diu"],
    },
    {
      id: "zone120",
      name: "Zone 120 — Central & East",
      rate: 120,
      states: ["Gujarat", "Madhya Pradesh", "Chhattisgarh", "West Bengal", "Jharkhand", "Bihar"],
    },
    {
      id: "zone130",
      name: "Zone 130 — North & Northeast",
      rate: 130,
      states: [
        "Rajasthan", "Uttar Pradesh", "Delhi", "Haryana", "Punjab", "Chandigarh",
        "Uttarakhand", "Sikkim", "Assam", "Meghalaya", "Tripura", "Manipur",
        "Mizoram", "Nagaland", "Arunachal Pradesh",
      ],
    },
    {
      id: "zone140",
      name: "Zone 140 — Far North & Islands",
      rate: 140,
      states: ["Jammu and Kashmir", "Ladakh", "Himachal Pradesh", "Lakshadweep"],
    },
    {
      id: "zone150",
      name: "Zone 150 — Andaman & Nicobar",
      rate: 150,
      states: ["Andaman and Nicobar Islands"],
    },
  ];
}

// Any state typed/selected that isn't listed in any configured zone falls
// back to this rate, so checkout never silently charges ₹0 for an
// unconfigured state.
export const DEFAULT_FALLBACK_SHIPPING_RATE = 140;

export function getShippingRate(
  state: string,
  zones: ShippingZone[],
  fallbackRate: number = DEFAULT_FALLBACK_SHIPPING_RATE
): number {
  if (!state) return fallbackRate;
  const zone = zones.find((z) => z.states.some((s) => s.trim().toLowerCase() === state.trim().toLowerCase()));
  return zone ? zone.rate : fallbackRate;
}
