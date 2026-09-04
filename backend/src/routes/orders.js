const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { createOrder } = require("../services/orderService");
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, sendOwnerNewOrderNotification } = require("../services/emailService");

const router = express.Router();

function rowToOrder(r) {
  return {
    id: r.id,
    items: JSON.parse(r.items_json || "[]"),
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

// POST /api/orders  (public - customer places order, Cash on Delivery)
// No payment gateway involved — the order is inserted straight away and
// collected in cash by the courier on delivery.
router.post("/", async (req, res) => {
  const o = req.body;
  try {
    const { id } = await createOrder(o);
    // Respond to the customer immediately — the order is already placed and
    // saved, so nothing below should ever delay or fail their checkout.
    res.status(201).json({ id });

    // Fire the confirmation email AFTER responding, and never await/throw
    // into the request handler: this runs exactly once per successful DB
    // insert (never re-triggered by the customer refreshing the
    // order-confirmed page), and any email failure is only logged — it can
    // never undo or affect the already-placed order.
    const items = Array.isArray(o.items) ? o.items : [];
    const quantity = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
    sendOrderConfirmationEmail({
      orderId: id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      items,
      quantity,
      totalAmount: o.total || 0,
      subtotal: o.subtotal,
      shipping: o.shipping,
      shippingAddress: o.shippingAddress,
      city: o.city,
      state: o.state,
      pincode: o.pincode,
      orderDate: new Date(),
    }).catch((err) => {
      console.error(`[email] Unexpected error sending confirmation for order ${id}:`, err.message);
    });

    // Notify the owner (separate orders@ mailbox -> owner's inbox) with the
    // new order's details plus today's running order count/total. Same
    // fire-and-forget pattern: never awaited, never affects the response
    // already sent to the customer above.
    sendOwnerNewOrderNotification({
      orderId: id,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      totalAmount: o.total || 0,
      subtotal: o.subtotal,
      shipping: o.shipping,
      shippingAddress: o.shippingAddress,
      city: o.city,
      state: o.state,
      pincode: o.pincode,
      orderDate: new Date(),
      items,
    }).catch((err) => {
      console.error(`[email] Unexpected error sending owner notification for order ${id}:`, err.message);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to place order" });
  }
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
    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "A valid amount is required" });

    // Synthetic single line item shaped like a normal CartItem so the
    // existing Orders tab item-card rendering (product title/image, phone
    // model, price, customImage preview) works with no frontend changes.
    const item = {
      product: { id: "manual", title: note?.trim() || "Manually Created Order", price: total, images: [] },
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
      orderDate: o.createdAt,
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
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const o = rowToOrder(rows[0]);
    res.json({
      id: o.id,
      items: o.items,
      subtotal: o.subtotal,
      shipping: o.shipping,
      total: o.total,
      customerName: o.customerName,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      status: o.status,
      trackingId: o.trackingId,
      previewRequested: o.previewRequested,
      createdAt: o.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// PUT /api/orders/:id/request-preview (public - customer taps the WhatsApp
// "Request Preview Image" button on the order-confirmed page; just flips a
// flag so admin can see who's waiting on a preview reply)
router.put("/:id/request-preview", async (req, res) => {
  try {
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
    const { status, trackingId } = req.body;
    if (trackingId !== undefined) {
      await pool.query("UPDATE orders SET status = ?, tracking_id = ? WHERE id = ?", [status, trackingId, req.params.id]);
    } else {
      await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    }
    res.json({ success: true });

    // Fire-and-forget: don't delay the response on the email send.
    (async () => {
      try {
        const [rows] = await pool.query("SELECT id, customer_name, customer_email, state FROM orders WHERE id = ?", [req.params.id]);
        if (!rows.length) return;
        const o = rows[0];
        if (!o.customer_email) return; // customer chose not to leave an email
        await sendOrderStatusUpdateEmail(
          { orderId: o.id, customerName: o.customer_name, customerEmail: o.customer_email, state: o.state },
          status,
          trackingId
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

// DELETE /api/orders/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

module.exports = router;
