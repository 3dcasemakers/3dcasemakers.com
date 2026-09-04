// Normalizes a customer-entered phone number down to a plain 10-digit Indian
// mobile number before it's saved anywhere (orders, abandoned carts). Strips
// spaces, dashes, parens, a leading "+", and a leading "91"/"0" country/trunk
// prefix, then keeps only the last 10 digits. Returns "" for empty/invalid
// input instead of throwing, so callers can still save an alt phone that was
// left blank.
function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, ""); // strip spaces, +, -, (), etc.

  // Drop a leading "91" country code once the number is longer than 10
  // digits (e.g. "+91 98765 43210" / "0091 98765 43210" -> "9876543210").
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  // Drop a leading trunk "0" (e.g. "098765 43210").
  if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Whatever is left, keep only the last 10 digits — covers any other
  // stray prefix without rejecting the number outright.
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return digits;
}

module.exports = { normalizePhone };
