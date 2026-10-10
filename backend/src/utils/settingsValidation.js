const SENSITIVE_KEY = /access.?token|password|secret|api.?key|smtp|private.?key/i;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function publicSettings(value) {
  if (Array.isArray(value)) return value.map(publicSettings);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEY.test(key) && !UNSAFE_KEYS.has(key)).map(([key, item]) => [key, publicSettings(item)]));
}

function validateSettings(settings) {
  function unsafe(value, depth = 0) {
    if (depth > 32) return true;
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => UNSAFE_KEYS.has(key) || unsafe(child, depth + 1));
  }
  if (unsafe(settings)) return "Settings contain an invalid key";
  const money = (v) => v !== "" && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10000000;
  if (settings.shippingFallbackRate !== undefined && !money(settings.shippingFallbackRate)) return "Enter a valid non-negative fallback shipping rate";
  if (settings.shippingZones !== undefined) {
    if (!Array.isArray(settings.shippingZones) || settings.shippingZones.length > 100) return "Shipping zones must be a list";
    const used = new Set();
    for (const zone of settings.shippingZones) {
      if (!zone || !money(zone.rate) || !Array.isArray(zone.states)) return "Every shipping zone needs a valid rate and state list";
      for (const state of zone.states) {
        if (typeof state !== "string" || !state.trim()) return "Enter valid shipping states";
        const key = state.trim().toLowerCase();
        if (used.has(key)) return `Shipping state "${state}" is assigned to more than one zone`;
        used.add(key);
      }
    }
  }
  if (settings.offers !== undefined) {
    if (!Array.isArray(settings.offers) || settings.offers.length > 100) return "Offers must be a list";
    for (const offer of settings.offers) {
      if (!offer || !Number.isInteger(Number(offer.minQty)) || Number(offer.minQty) < 1 || !money(offer.discountAmount)) return "Every offer needs a positive minimum quantity and valid discount";
      if (offer.endsAt && !Number.isFinite(new Date(offer.endsAt).getTime())) return "Enter a valid offer expiry date";
    }
  }
  return null;
}

module.exports = { publicSettings, validateSettings };
