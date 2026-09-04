const pool = require("../config/db");
const { normalizePhone } = require("../utils/phone");

// Order IDs look like TDC0001, TDC0002, ... TDC9999. Once the running count
// reaches 5 digits (10000+) we grow the zero-padding by one extra leading
// zero (TDC010000, TDC0100000, ...) so the id keeps its "TDC000x" shape
// instead of ever shrinking back down to a bare 5-digit number.
function formatOrderNumber(n) {
  const digits = String(n);
  const width = digits.length <= 4 ? 4 : digits.length + 1;
  return "TDC" + digits.padStart(width, "0");
}

// Atomically reserves the next order number. Uses a dedicated AUTO_INCREMENT
// table (order_seq) so concurrent checkouts can never land on the same id -
// this must never throw/collide, since a failed id generation would mean a
// customer's order silently fails to place.
async function nextOrderId() {
  const [result] = await pool.query("INSERT INTO order_seq () VALUES ()");
  return formatOrderNumber(result.insertId);
}

// Creates the order row. `o` is the same shape the frontend posts to
// POST /api/orders (items, subtotal, shipping, total, customer + shipping
// fields, sessionId). Cash on Delivery only — order is placed straight away,
// no payment gateway/verification step involved.
// `o.source` defaults to "website" (a customer's own checkout); the admin's
// "Create Order" flow (routes/orders.js POST /manual) passes "manual" so it
// can be told apart in the Orders tab.
async function createOrder(o) {
  const id = await nextOrderId();
  await pool.query(
    `INSERT INTO orders (id, items_json, subtotal, shipping, total, customer_name, customer_email,
      customer_phone, customer_alt_phone, shipping_address, city, state, pincode,
      payment_method, payment_status, status, source)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`,
    [
      id, JSON.stringify(o.items || []), o.subtotal || 0, o.shipping || 0, o.total || 0,
      o.customerName, o.customerEmail || "", normalizePhone(o.customerPhone), normalizePhone(o.customerAltPhone),
      o.shippingAddress, o.city, o.state, o.pincode,
      "cod", "pending", o.source === "manual" ? "manual" : "website",
    ]
  );
  if (o.sessionId) {
    pool.query("DELETE FROM abandoned_carts WHERE session_id = ?", [o.sessionId]).catch(() => {});
  }
  return { id, alreadyExisted: false };
}

module.exports = {
  nextOrderId,
  createOrder,
};
