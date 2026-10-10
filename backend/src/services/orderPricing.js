// Server-side re-pricing of a storefront checkout.
//
// SECURITY: POST /api/orders used to store whatever subtotal / shipping /
// total / item prices the browser sent. Since the cart lives in localStorage,
// anyone could edit it (or call the API directly) and place a ₹1 order for a
// ₹599 case. Everything money-related is now recomputed here from the
// database (product prices), the admin's saved offers (Admin -> Discounts)
// and the admin's shipping zones (Admin -> Store Config), mirroring exactly
// what the storefront computes in CartContext / CheckoutPage.
const pool = require("../config/db");
const { resolveCourier, courierShipping } = require("../utils/courier");

// Keep in sync with frontend/src/types.ts GEL_TEXT_PLATE_SURCHARGE.
const GEL_TEXT_PLATE_SURCHARGE = 99;
const MAX_QTY_PER_LINE = 50;
const MAX_LINES = 50;

// Mirrors frontend/src/utils/shippingZones.ts defaultShippingZones().
const DEFAULT_SHIPPING_ZONES = [
  { rate: 0, states: ["Tamil Nadu", "Puducherry"] },
  { rate: 99, states: ["Kerala", "Karnataka", "Andhra Pradesh", "Telangana"] },
  { rate: 109, states: ["Goa", "Maharashtra", "Odisha", "Dadra and Nagar Haveli and Daman and Diu"] },
  { rate: 119, states: ["Gujarat", "Madhya Pradesh", "Chhattisgarh", "West Bengal", "Jharkhand", "Bihar"] },
  {
    rate: 129,
    states: [
      "Rajasthan", "Uttar Pradesh", "Delhi", "Haryana", "Punjab", "Chandigarh", "Uttarakhand", "Sikkim", "Assam",
      "Meghalaya", "Tripura", "Manipur", "Mizoram", "Nagaland", "Arunachal Pradesh",
    ],
  },
  { rate: 139, states: ["Jammu and Kashmir", "Ladakh", "Himachal Pradesh", "Lakshadweep"] },
  { rate: 149, states: ["Andaman and Nicobar Islands"] },
];
const DEFAULT_FALLBACK_SHIPPING_RATE = 139;

// Photo Frame products: Tamil Nadu & Puducherry free, Kerala & Karnataka ₹149, others ₹199.
// Mirrors frontend/src/utils/shippingZones.ts getPhotoFrameShippingRate().
function photoFrameShippingFor(state) {
  const s = String(state || "").trim().toLowerCase();
  if (!s) return 199;
  if (s === "tamil nadu" || s === "puducherry") return 0;
  if (s === "kerala" || s === "karnataka") return 149;
  return 199;
}

class PricingError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

async function loadSettings() {
  const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
  const settings = rows.length ? JSON.parse(rows[0].settings_json || "{}") : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Store pricing settings are invalid");
  return settings;
}

function shippingFor(state, settings) {
  const zones = Array.isArray(settings.shippingZones) && settings.shippingZones.length ? settings.shippingZones : DEFAULT_SHIPPING_ZONES;
  const fb = settings.shippingFallbackRate;
  const fallback = fb !== undefined && fb !== null && fb !== "" && Number.isFinite(Number(fb)) && Number(fb) >= 0 ? Number(fb) : DEFAULT_FALLBACK_SHIPPING_RATE;
  const s = String(state || "").trim().toLowerCase();
  if (!s) return fallback;
  const zone = zones.find((z) => z && Array.isArray(z.states) && z.states.some((x) => String(x).trim().toLowerCase() === s));
  if (!zone) return fallback;
  const rate = Number(zone.rate);
  if (!Number.isFinite(rate) || rate < 0) throw new Error("Store shipping rate is invalid");
  return rate;
}

function isOfferLive(o) {
  if (!o || !o.enabled) return false;
  if (!o.endsAt) return true;
  return new Date(o.endsAt).getTime() > Date.now();
}

function bestOfferDiscount(settings, qty, subtotal) {
  const offers = Array.isArray(settings.offers) ? settings.offers : [];
  const eligible = offers.filter((o) => isOfferLive(o) && qty >= Number(o.minQty || 0));
  if (!eligible.length) return 0;
  const best = eligible.reduce((b, o) => (Number(o.discountAmount) > Number(b.discountAmount) ? o : b));
  return Math.max(0, Math.min(Number(best.discountAmount) || 0, subtotal));
}

const str = (v, max = 500) => (v === undefined || v === null ? undefined : String(v).slice(0, max));

// Returns { items, subtotal, discount, shipping, total, courier } with trusted numbers.
async function priceStorefrontOrder(o) {
  const rawItems = Array.isArray(o.items) ? o.items : [];
  if (!rawItems.length) throw new PricingError("Your cart is empty");
  if (rawItems.length > MAX_LINES) throw new PricingError("Too many items in one order");

  const ids = [...new Set(rawItems.map((i) => i && i.product && i.product.id).filter(Boolean).map(String))];
  if (!ids.length) throw new PricingError("Your cart is empty");
  const [rows] = await pool.query(
    `SELECT id, title, price, compare_price, images, stock_status, brand, material, is_photo_frame, frame_sizes_json FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  let hasFrameItems = false;
  let hasOtherItems = false;
  const items = rawItems.map((i) => {
    const pid = String((i && i.product && i.product.id) || "");
    const db = byId.get(pid);
    if (!db) throw new PricingError("A product in your cart is no longer available. Please remove it and try again.");
    if (db.stock_status === "out_of_stock") throw new PricingError(`"${db.title}" is out of stock. Please remove it and try again.`);

    const quantity = Number(i.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) throw new PricingError("Invalid quantity in cart");

    let basePrice = Number(db.price);
    let baseCompare = Number(db.compare_price) || basePrice;
    let selectedModel = str(i.selectedModel, 200) || "";
    const variant = str(i.customVariant, 500) || "";

    // Photo Frame products are priced per size. The cart stores the size as
    // selectedModel = "Size: 8x12"; the price comes from the product's own
    // size list in the database, never from the browser.
    let plate = 0;
    if (db.is_photo_frame) hasFrameItems = true;
    else hasOtherItems = true;
    if (db.is_photo_frame) {
      let sizes = [];
      try {
        sizes = JSON.parse(db.frame_sizes_json || "[]");
      } catch {
        sizes = [];
      }
      const wanted = selectedModel.replace(/^size:\s*/i, "").trim().toLowerCase();
      const size = Array.isArray(sizes) ? sizes.find((z) => String(z.label).trim().toLowerCase() === wanted) : null;
      if (!size) throw new PricingError(`Please choose a valid size for "${db.title}" and try again.`);
      basePrice = Number(size.price);
      baseCompare = Number(size.comparePrice) || basePrice;
      selectedModel = `Size: ${size.label}`;
    } else {
      // The only legitimate per-line add-on: the Gel Case gold text plate,
      // which the product page folds into the line's price and labels in
      // customVariant. The browser price must never decide whether to charge it.
      const isGel = db.material === "Gold Gel Case" || db.material === "Acrylic Gel Case";
      // Match the selected style suffix, not those words inside the customer's
      // free-print text (for example Text: "Gold Plate" — Print (Free)).
      const hasPlateStyle = /—\s*Gold Plate(?:\s*\(\+[^)]*\))?\s*$/i.test(variant);
      plate = isGel && hasPlateStyle ? GEL_TEXT_PLATE_SURCHARGE : 0;
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) throw new PricingError(`The price for "${db.title}" is unavailable. Please contact the store.`);
    const unitPrice = basePrice + plate;
    const comparePrice = baseCompare + plate;

    let images = [];
    try {
      images = JSON.parse(db.images || "[]");
    } catch {
      images = [];
    }

    // Only persist the fields the admin/emails actually use — never the
    // arbitrary blob the browser sent.
    return {
      product: {
        id: db.id,
        title: db.title,
        price: unitPrice,
        comparePrice,
        images: Array.isArray(images) ? images.slice(0, 1) : [],
        brand: db.brand || "",
        material: db.material || "",
      },
      quantity,
      selectedModel,
      customImage: str(i.customImage, 500),
      customName: str(i.customName, 200),
      customVariant: variant || undefined,
      customImage2: str(i.customImage2, 500),
      customName2: str(i.customName2, 200),
      customImage3: str(i.customImage3, 500),
      customName3: str(i.customName3, 200),
    };
  });

  const settings = await loadSettings();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const roundMoney = (value) => Math.round(value * 100) / 100;
  const subtotal = roundMoney(items.reduce((s, i) => s + i.product.price * i.quantity, 0));
  const discount = roundMoney(bestOfferDiscount(settings, count, subtotal));
  // Phone cases / other products use the zone-based rate; Photo Frames use
  // their own state-based rate. A mixed cart (frame + phone case) is charged
  // the Photo Frame shipping only - the phone-case shipping is not added.
  // Courier rules (see utils/courier.js):
  //  - Tamil Nadu / Puducherry: customer picks ST Courier or Post Office.
  //    Rs 0 / Rs 99 for every cart type, mixed carts included.
  //  - Kerala + mixed cart: single option, Post Office Rs 149 (no choice).
  // Everything else keeps its zone / photo-frame rate. The choice is validated
  // here - never trusted from the browser.
  const mixedCart = hasFrameItems && hasOtherItems;
  const courier = resolveCourier(o.state, o.courier, mixedCart);
  const courierRate = courierShipping(o.state, courier, mixedCart);
  const shipping = roundMoney(
    courierRate !== null ? courierRate : hasFrameItems ? photoFrameShippingFor(o.state) : hasOtherItems ? shippingFor(o.state, settings) : 0
  );
  const total = roundMoney(Math.max(0, subtotal - discount) + shipping);

  return { items, subtotal, discount, shipping, total, courier };
}

module.exports = { priceStorefrontOrder, PricingError };
