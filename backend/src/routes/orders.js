const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { createOrder } = require("../services/orderService");
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, sendOwnerNewOrderNotification } = require("../services/emailService");
const { priceStorefrontOrder } = require("../services/orderPricing");
const { rateLimit } = require("../middleware/rateLimit");
const { normalizePhone } = require("../utils/phone");
const { orderAccessToken, hasOrderAccess, publicItems } = require("../utils/orderAccess");

const router = express.Router();

// Must match the orders.status ENUM in schema.sql.
const ORDER_STATUSES = ["pending", "processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"];

const previewLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
const trackingLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

function safeParseItems(text) {
  try {
    const v = JSON.parse(text || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToOrder(r) {
  return {
    id: r.id,
    items: safeParseItems(r.items_json),
    subtotal: Number(r.subtotal),
    shipping: Number(r.shipping),
    total: Number(r.total),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    customerAltPhone: r.customer_alt_phone,
    shippingAddress: r.shipping_address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    courier: r.courier || null,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    status: r.status,
    trackingId: r.tracking_id || "",
    previewRequested: !!r.preview_requested,
    previewRequestedAt: r.preview_requested_at,
    isSeen: !!r.is_seen,
    source: r.source || "website",
    createdAt: r.created_at,
  };
}

// POST /api/orders (public) is intentionally disabled. Storefront orders are
// created only after a verified Easebuzz payment — see routes/payments.js.
router.post("/", (req, res) => {
  res.status(410).json({ error: "Orders are placed through online payment at checkout." });
});

// POST /api/orders/manual (admin - "Create Order" button in the Orders tab).
// Lets the admin log a sale that didn't come through the storefront (phone
// call, WhatsApp, in-person) — customer name, phone, phone model, address
// and amount, plus an optional reference photo (already uploaded via
// POST /api/upload). Stored with source = 'manual' so the Orders tab can
// badge it "Manually Created" instead of "Online Store", and rendered as a
// single line item so it reuses the exact same order-detail UI as a normal
// order. No confirmation/owner emails are fired — the admin already knows
// about the order they just typed in.
router.post("/manual", requireAdmin, async (req, res) => {
  try {
    const {
      customerName, customerPhone, customerEmail, phoneModel,
      shippingAddress, city, state, pincode, amount, photoUrl, note,
    } = req.body;

    if (!customerName || !String(customerName).trim()) return res.status(400).json({ error: "Customer name is required" });
    if (!customerPhone || !String(customerPhone).trim()) return res.status(400).json({ error: "Customer phone is required" });
    if (normalizePhone(customerPhone).length !== 10) return res.status(400).json({ error: "Enter a valid 10-digit customer phone number" });
    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "A valid amount is required" });

    // Synthetic single line item shaped like a normal CartItem so the
    // existing Orders tab item-card rendering (product title/image, phone
    // model, price, customImage preview) works with no frontend changes.
    const item = {
      product: { id: "manual", title: String(note || "").trim().slice(0, 255) || "Manually Created Order", price: total, images: [] },
      quantity: 1,
      selectedModel: phoneModel || "",
      customImage: photoUrl || "",
    };

    const { id } = await createOrder({
      items: [item],
      subtotal: total,
      shipping: 0,
      total,
      customerName: String(customerName).trim(),
      customerEmail: customerEmail || "",
      customerPhone,
      shippingAddress: shippingAddress || "",
      city: city || "",
      state: state || "",
      pincode: pincode || "",
      source: "manual",
    });

    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// POST /api/orders/send-order-confirmation (admin - manually resend the
// confirmation email for an existing order, e.g. if a customer says they
// never got it, or an admin edited the email address on file). Requires
// admin auth so this can't be used as an open spam-trigger by the public —
// it looks up the order from the DB by id rather than trusting a full
// order payload from the client, so it can't be used to send arbitrary
// content either.
router.post("/send-order-confirmation", requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const o = rowToOrder(rows[0]);
    if (!o.customerEmail) return res.status(400).json({ error: "This order has no customer email on file" });

    const items = o.items || [];
    const quantity = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
    const result = await sendOrderConfirmationEmail({
      orderId: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      items,
      quantity,
      totalAmount: o.total,
      subtotal: o.subtotal,
      shipping: o.shipping,
      shippingAddress: o.shippingAddress,
      city: o.city,
      state: o.state,
      pincode: o.pincode,
      courier: o.courier,
      orderDate: o.createdAt,
      paymentMethod: o.paymentMethod,
    });

    if (!result.sent) return res.status(502).json({ error: "Failed to send email", reason: result.reason });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send order confirmation email" });
  }
});

// GET /api/orders/:id  (public - track order by id, no auth so customers can track)
// SECURITY: order ids are sequential (STC0001, STC0002, ...) and this route is
// unauthenticated, so it must NOT return PII (email, phone, full address) —
// otherwise anyone can enumerate ids and harvest every customer's contact
// details. Only the fields the order-confirmation/tracking page actually
// needs are returned here.
router.post("/track", trackingLimiter, async (req, res) => {
  const { orderId, customerPhone } = req.body || {};
  const phone = normalizePhone(customerPhone);
  if (typeof orderId !== "string" || !orderId.trim() || phone.length !== 10) return res.status(400).json({ error: "Enter your order ID and the phone number used at checkout" });
  try {
    const [rows] = await pool.query("SELECT id, customer_phone FROM orders WHERE id = ?", [orderId.trim()]);
    if (!rows.length || normalizePhone(rows[0].customer_phone) !== phone) return res.status(404).json({ error: "Order ID and phone number did not match" });
    const accessToken = orderAccessToken(rows[0].id);
    if (!accessToken) return res.status(503).json({ error: "Secure order tracking is temporarily unavailable" });
    res.json({ id: rows[0].id, accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify order" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const o = rowToOrder(rows[0]);
    const verified = hasOrderAccess(o.id, req.headers["x-order-access"]);
    const [[manualPay]] = await pool.query(
      "SELECT payment_status, rejection_reason, transaction_id, upi_app, submitted_at FROM manual_upi_payments WHERE order_id = ?",
      [req.params.id]
    ).catch(() => [[]]);
    res.json({
      id: o.id,
      items: verified ? o.items : publicItems(o.items),
      subtotal: o.subtotal,
      shipping: o.shipping,
      total: o.total,
      ...(verified ? { customerName: o.customerName } : {}),
      paymentMethod: o.paymentMethod,
      paymentStatus: (manualPay && manualPay.payment_status) || o.paymentStatus,
      status: o.status,
      trackingId: o.trackingId,
      hasCustomizedItem: o.items.some((item) => item.customImage || item.customImage2 || item.customImage3 || item.customName || item.customName2 || item.customName3 || item.customVariant),
      previewRequested: o.previewRequested,
      createdAt: o.createdAt,
      rejectionReason: manualPay ? manualPay.rejection_reason : null,
      manualPayment: manualPay ? {
        paymentStatus: manualPay.payment_status,
        rejectionReason: manualPay.rejection_reason,
        transactionId: manualPay.transaction_id,
        upiApp: manualPay.upi_app,
        submittedAt: manualPay.submitted_at,
      } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// PUT /api/orders/:id/request-preview (public - customer taps the WhatsApp
// "Request Preview Image" button on the order-confirmed page; just flips a
// flag so admin can see who's waiting on a preview reply)
router.put("/:id/request-preview", previewLimiter, async (req, res) => {
  try {
    const [[order]] = await pool.query("SELECT id, customer_phone FROM orders WHERE id = ?", [req.params.id]);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const phone = normalizePhone(req.body?.customerPhone);
    if (!hasOrderAccess(order.id, req.headers["x-order-access"]) && !(phone.length === 10 && phone === normalizePhone(order.customer_phone))) {
      return res.status(403).json({ error: "Verify your order before requesting a preview" });
    }
    const [result] = await pool.query(
      "UPDATE orders SET preview_requested = 1, preview_requested_at = NOW() WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to flag preview request" });
  }
});

// GET /api/orders  (admin - list all)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(rows.map(rowToOrder));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// GET /api/orders/notifications/unseen-count (admin - red dot on the Orders
// sidebar tab). Counts orders still sitting in "pending" — the dot stays up
// until each one is moved to "processing" (or beyond), not just until the
// admin opens the tab.
router.get("/notifications/unseen-count", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'");
    res.json({ count: rows[0].c });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch unseen count" });
  }
});

// PUT /api/orders/notifications/mark-seen (admin - clear the bell badge)
router.put("/notifications/mark-seen", requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE orders SET is_seen = 1 WHERE is_seen = 0");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark orders seen" });
  }
});

// PUT /api/orders/:id/status (admin)
// Updates the order's status (and tracking ID, e.g. when marked
// "ready_to_ship") and — if the customer left an email at checkout — emails
// them the update (e.g. "Order Processing", "Ready to Ship" with the
// tracking ID, "Shipped", "Delivered", etc). Email sending never blocks or
// fails the status update itself.
router.put("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status, trackingId } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use one of: ${ORDER_STATUSES.join(", ")}` });
    }
    const [[existing]] = await pool.query("SELECT status, tracking_id FROM orders WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Order not found" });
    if (trackingId !== undefined) {
      await pool.query("UPDATE orders SET status = ?, tracking_id = ? WHERE id = ?", [status, String(trackingId || "").slice(0, 100), req.params.id]);
    } else {
      await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    }
    res.json({ success: true });
    // No email when nothing actually changed (e.g. only the tracking id was edited
    // on an order that's already in this status) — avoids duplicate emails.
    if (existing.status === status && (trackingId === undefined || String(trackingId || "").slice(0, 100) === (existing.tracking_id || ""))) return;

    // Fire-and-forget: don't delay the response on the email send.
    (async () => {
      try {
        const [rows] = await pool.query("SELECT id, customer_name, customer_email, state, courier FROM orders WHERE id = ?", [req.params.id]);
        if (!rows.length) return;
        const o = rows[0];
        if (!o.customer_email) return; // customer chose not to leave an email
        await sendOrderStatusUpdateEmail(
          { orderId: o.id, customerName: o.customer_name, customerEmail: o.customer_email, state: o.state, courier: o.courier },
          status,
          trackingId === undefined ? existing.tracking_id : trackingId
        );
      } catch (emailErr) {
        console.error(`[email] Status update send failed for order ${req.params.id}:`, emailErr.message);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// PUT /api/orders/:id/payment (admin) — record payment collection/refund (online orders arrive already "paid").
router.put("/:id/payment", requireAdmin, async (req, res) => {
  const { paymentStatus } = req.body || {};
  if (!["pending", "paid", "failed", "refunded", "awaiting_payment", "pending_verification"].includes(paymentStatus)) return res.status(400).json({ error: "Invalid payment status" });
  try {
    const [[order]] = await pool.query("SELECT payment_status FROM orders WHERE id = ?", [req.params.id]);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (paymentStatus === "refunded" && !["paid", "refunded"].includes(order.payment_status)) return res.status(400).json({ error: "Only a collected payment can be recorded as refunded" });
    await pool.query("UPDATE orders SET payment_status = ? WHERE id = ?", [paymentStatus, req.params.id]);
    res.json({ success: true, paymentStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update payment status" });
  }
});

// DELETE /api/orders/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

module.exports = router;
