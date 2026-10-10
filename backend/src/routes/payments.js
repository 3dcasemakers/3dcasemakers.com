// Easebuzz online payment (Hosted Checkout). Online payment is the ONLY way a
// storefront order is created: nothing is written to `orders` until Easebuzz
// confirms the payment with a verified hash.
//
//   POST /api/payments/easebuzz/initiate   browser -> validates + re-prices cart, stores a
//                                          payment_attempts row, returns the Easebuzz URL
//   POST /api/payments/easebuzz/callback   Easebuzz -> surl AND furl (form post). Verifies the
//                                          reverse hash, creates the paid order, redirects browser
//   GET  /api/payments/easebuzz/status/:txnid  result page polls this (txnid is an unguessable secret)
const crypto = require("node:crypto");
const express = require("express");
const pool = require("../config/db");
const { priceStorefrontOrder } = require("../services/orderPricing");
const { createOrder } = require("../services/orderService");
const { sendNewOrderEmails } = require("../services/orderNotifications");
const easebuzz = require("../services/easebuzz");
const { rateLimit } = require("../middleware/rateLimit");
const { normalizePhone } = require("../utils/phone");
const { orderAccessToken, hasOrderAccess } = require("../utils/orderAccess");
const { requireAdmin } = require("../middleware/auth");
const {
  getPaymentSettings,
  validateTransactionId,
  generateUpiUri,
  generateUpiQrDataUrl,
} = require("../services/manualUpiService");

const router = express.Router();
const initiateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "Too many payment attempts — please wait a few minutes." });
const statusLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 120 });

function backendUrl() {
  return (process.env.BACKEND_PUBLIC_URL || "").trim().replace(/\/+$/, "");
}
function frontendUrl() {
  const first = String(process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "");
  return first || "https://3dcasemakers.com";
}
const resultUrl = (txnid) => `${frontendUrl()}/payment-result?txnid=${encodeURIComponent(txnid)}`;

router.post("/easebuzz/initiate", initiateLimiter, async (req, res) => {
  const o = req.body || {};
  try {
    const paySettings = await getPaymentSettings();
    if (paySettings.easebuzzEnabled === false) {
      return res.status(403).json({ error: "Easebuzz online payment is temporarily disabled." });
    }
  } catch (err) {
    console.error("[payments] Failed to check payment settings:", err.message);
  }

  if (!easebuzz.isConfigured() || !backendUrl()) {
    console.error("[payments] EASEBUZZ_MERCHANT_KEY / EASEBUZZ_SALT / BACKEND_PUBLIC_URL missing in .env");
    return res.status(503).json({ error: "Online payment is temporarily unavailable. Please try again later." });
  }

  const required = { customerName: "name", customerPhone: "phone number", customerEmail: "email", shippingAddress: "address", city: "city", state: "state", pincode: "pincode" };
  for (const [k, label] of Object.entries(required)) {
    if (!o[k] || !String(o[k]).trim()) return res.status(400).json({ error: `Please enter your ${label}` });
  }
  const phone = normalizePhone(o.customerPhone);
  if (phone.length !== 10) return res.status(400).json({ error: "Please enter a valid 10-digit phone number" });
  if (!/^\d{6}$/.test(String(o.pincode).trim())) return res.status(400).json({ error: "Please enter a valid 6-digit pincode" });
  const email = String(o.customerEmail).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return res.status(400).json({ error: "Please enter a valid email" });

  try {
    let priced;
    try {
      priced = await priceStorefrontOrder(o);
    } catch (pe) {
      if (pe.status === 400) return res.status(400).json({ error: pe.message });
      throw pe;
    }
    if (!(priced.total >= 1)) return res.status(400).json({ error: "Order total must be at least ₹1" });

    const order = {
      items: priced.items,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      courier: priced.courier,
      customerName: String(o.customerName).trim().slice(0, 255),
      customerEmail: email.slice(0, 255),
      customerPhone: phone,
      customerAltPhone: o.customerAltPhone ? normalizePhone(o.customerAltPhone) : "",
      shippingAddress: String(o.shippingAddress).trim().slice(0, 2000),
      city: String(o.city).trim().slice(0, 100),
      state: String(o.state).trim().slice(0, 100),
      pincode: String(o.pincode).trim().slice(0, 10),
      sessionId: o.sessionId ? String(o.sessionId).slice(0, 100) : "",
      source: "website",
    };

    const txnid = "TX" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(8).toString("hex").toUpperCase();
    await pool.query(
      "INSERT INTO payment_attempts (txnid, amount, payload_json, status) VALUES (?,?,?, 'initiated')",
      [txnid, priced.total.toFixed(2), JSON.stringify(order)]
    );

    const cb = `${backendUrl()}/api/payments/easebuzz/callback`;
    let paymentUrl;
    try {
      paymentUrl = await easebuzz.initiatePayment({
        txnid,
        amount: priced.total,
        firstname: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
        productinfo: "3DCaseMakers Order",
        surl: cb,
        furl: cb,
      });
    } catch (err) {
      console.error("[payments]", err.message);
      await pool.query("UPDATE payment_attempts SET status = 'failed' WHERE txnid = ?", [txnid]).catch(() => {});
      return res.status(502).json({ error: "Could not start the payment. Please try again." });
    }
    res.json({ paymentUrl, txnid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start payment" });
  }
});

// Easebuzz posts the result here for success AND failure. Browser is redirected afterwards.
router.post("/easebuzz/callback", async (req, res) => {
  const r = req.body || {};
  const txnid = typeof r.txnid === "string" ? r.txnid.trim().slice(0, 64) : "";
  const fallback = txnid ? resultUrl(txnid) : `${frontendUrl()}/checkout`;
  try {
    if (!txnid || !easebuzz.verifyResponse(r)) {
      console.warn(`[payments] callback hash verification failed for txn ${txnid || "(none)"}`);
      return res.redirect(303, fallback);
    }
    const [[attempt]] = await pool.query("SELECT * FROM payment_attempts WHERE txnid = ?", [txnid]);
    if (!attempt) return res.redirect(303, fallback);

    const gatewayStatus = String(r.status || "").toLowerCase();
    const gatewayId = String(r.easepayid || r.easebuzz_id || "").slice(0, 64);
    const paidAmount = Number(r.amount);

    if (gatewayStatus !== "success") {
      // Never downgrade a payment that already succeeded (duplicate/late failure posts).
      const next = gatewayStatus === "pending" ? "pending" : "failed";
      await pool.query(
        "UPDATE payment_attempts SET status = ?, gateway_status = ?, gateway_payment_id = ? WHERE txnid = ? AND status IN ('initiated','pending','failed')",
        [next, gatewayStatus.slice(0, 30), gatewayId, txnid]
      );
      return res.redirect(303, fallback);
    }

    // Success: the amount paid must equal the amount we asked for.
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(attempt.amount)) > 0.009) {
      console.error(`[payments] AMOUNT MISMATCH txn ${txnid}: expected ${attempt.amount}, got ${r.amount}`);
      await pool.query("UPDATE payment_attempts SET status = 'mismatch', gateway_status = 'success', gateway_payment_id = ? WHERE txnid = ?", [gatewayId, txnid]);
      return res.redirect(303, fallback);
    }

    // Claim the attempt atomically so a duplicate callback can never create two orders.
    const [claim] = await pool.query(
      "UPDATE payment_attempts SET status = 'processing', gateway_status = 'success', gateway_payment_id = ? WHERE txnid = ? AND status IN ('initiated','pending','failed')",
      [gatewayId, txnid]
    );
    if (claim.affectedRows === 1) {
      try {
        const o = JSON.parse(attempt.payload_json);
        const { id } = await createOrder({ ...o, paymentMethod: "online", paymentStatus: "paid", gatewayTxnId: txnid, gatewayPaymentId: gatewayId });
        await pool.query("UPDATE payment_attempts SET status = 'success', order_id = ? WHERE txnid = ?", [id, txnid]);
        sendNewOrderEmails(o, id);
      } catch (err) {
        // Money was taken but the order insert failed: leave the row as 'paid_no_order' so it can be reconciled.
        console.error(`[payments] PAID BUT ORDER CREATION FAILED for txn ${txnid} (easepayid ${gatewayId}):`, err);
        await pool.query("UPDATE payment_attempts SET status = 'paid_no_order' WHERE txnid = ?", [txnid]).catch(() => {});
      }
    }
    return res.redirect(303, fallback);
  } catch (err) {
    console.error("[payments] callback error:", err);
    return res.redirect(303, fallback);
  }
});

router.get("/easebuzz/status/:txnid", statusLimiter, async (req, res) => {
  try {
    const txnid = String(req.params.txnid || "").slice(0, 64);
    const [[a]] = await pool.query("SELECT status, order_id, payload_json FROM payment_attempts WHERE txnid = ?", [txnid]);
    if (!a) return res.status(404).json({ error: "Payment not found" });
    if (a.status !== "success" || !a.order_id) {
      // 'processing' = callback is mid-way; everything else is a final non-success state.
      return res.json({ status: a.status === "processing" ? "processing" : a.status === "initiated" ? "pending" : a.status });
    }
    const o = JSON.parse(a.payload_json);
    res.json({
      status: "success",
      orderId: a.order_id,
      accessToken: orderAccessToken(a.order_id),
      total: o.total,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      items: (o.items || []).map((i) => ({ productId: i.product?.id, productName: i.product?.title, price: i.product?.price, quantity: i.quantity })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check payment" });
  }
});

// ============================================================
// DIRECT UPI MANUAL VERIFICATION PAYMENT ROUTES
// ============================================================

// POST /api/payments/manual-upi/initiate
// Creates order with status 'awaiting_payment', generates dynamic UPI URI and QR code
router.post("/manual-upi/initiate", initiateLimiter, async (req, res) => {
  const o = req.body || {};
  let paySettings;
  try {
    paySettings = await getPaymentSettings();
  } catch (err) {
    console.error("[payments] Failed to get payment settings:", err);
    paySettings = { manualUpiEnabled: true, manualUpiId: "325691127665359@cnrb", manualUpiPayeeName: "3D Case Makers" };
  }
  if (paySettings.manualUpiEnabled === false) {
    return res.status(403).json({ error: "Direct UPI payment is currently disabled." });
  }

  const required = { customerName: "name", customerPhone: "phone number", customerEmail: "email", shippingAddress: "address", city: "city", state: "state", pincode: "pincode" };
  for (const [k, label] of Object.entries(required)) {
    if (!o[k] || !String(o[k]).trim()) return res.status(400).json({ error: `Please enter your ${label}` });
  }
  const phone = normalizePhone(o.customerPhone);
  if (phone.length !== 10) return res.status(400).json({ error: "Please enter a valid 10-digit phone number" });
  if (!/^\d{6}$/.test(String(o.pincode).trim())) return res.status(400).json({ error: "Please enter a valid 6-digit pincode" });
  const email = String(o.customerEmail).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return res.status(400).json({ error: "Please enter a valid email" });

  try {
    let priced;
    try {
      priced = await priceStorefrontOrder(o);
    } catch (pe) {
      if (pe.status === 400) return res.status(400).json({ error: pe.message });
      throw pe;
    }
    if (!(priced.total >= 1)) return res.status(400).json({ error: "Order total must be at least ₹1" });

    const orderData = {
      items: priced.items,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      courier: priced.courier,
      customerName: String(o.customerName).trim().slice(0, 255),
      customerEmail: email.slice(0, 255),
      customerPhone: phone,
      customerAltPhone: o.customerAltPhone ? normalizePhone(o.customerAltPhone) : "",
      shippingAddress: String(o.shippingAddress).trim().slice(0, 2000),
      city: String(o.city).trim().slice(0, 100),
      state: String(o.state).trim().slice(0, 100),
      pincode: String(o.pincode).trim().slice(0, 10),
      sessionId: o.sessionId ? String(o.sessionId).slice(0, 100) : "",
      source: "website",
      paymentMethod: "manual_upi",
      paymentStatus: "awaiting_payment",
    };

    const { id } = await createOrder(orderData);

    const upiUri = generateUpiUri({
      upiId: paySettings.manualUpiId,
      payeeName: paySettings.manualUpiPayeeName,
      amount: priced.total,
      orderRef: id,
    });

    const qrDataUrl = await generateUpiQrDataUrl(upiUri);

    await pool.query(
      `INSERT INTO manual_upi_payments
       (order_id, payment_method, expected_amount, upi_id, payee_name, upi_uri, payment_status)
       VALUES (?, 'manual_upi', ?, ?, ?, ?, 'awaiting_payment')
       ON DUPLICATE KEY UPDATE expected_amount = VALUES(expected_amount), upi_id = VALUES(upi_id), payee_name = VALUES(payee_name), upi_uri = VALUES(upi_uri)`,
      [id, priced.total.toFixed(2), paySettings.manualUpiId, paySettings.manualUpiPayeeName, upiUri]
    );

    res.json({
      success: true,
      orderId: id,
      accessToken: orderAccessToken(id),
      total: priced.total,
      upiId: paySettings.manualUpiId,
      payeeName: paySettings.manualUpiPayeeName,
      upiUri,
      qrDataUrl,
    });
  } catch (err) {
    console.error("[payments] manual upi initiate error:", err);
    res.status(500).json({ error: "Failed to place order and generate UPI payment details." });
  }
});

// GET /api/payments/manual-upi/order/:id
// Retrieves order payment details, re-generates dynamic QR code using stored DB amount
router.get("/manual-upi/order/:id", statusLimiter, async (req, res) => {
  const orderId = String(req.params.id || "").trim();
  if (!orderId) return res.status(400).json({ error: "Order ID is required" });

  try {
    const [[order]] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const authHeader = req.headers["x-order-access"];
    const queryPhone = req.query.phone ? normalizePhone(req.query.phone) : "";
    const isOwner = hasOrderAccess(order.id, authHeader) || (queryPhone && queryPhone === normalizePhone(order.customer_phone));
    if (!isOwner) {
      return res.status(403).json({ error: "You are not authorized to view this payment page." });
    }

    const paySettings = await getPaymentSettings();
    const upiUri = generateUpiUri({
      upiId: paySettings.manualUpiId,
      payeeName: paySettings.manualUpiPayeeName,
      amount: order.total,
      orderRef: order.id,
    });
    const qrDataUrl = await generateUpiQrDataUrl(upiUri);

    const [[manualPay]] = await pool.query("SELECT * FROM manual_upi_payments WHERE order_id = ?", [orderId]);

    res.json({
      orderId: order.id,
      amount: Number(order.total),
      subtotal: Number(order.subtotal),
      shipping: Number(order.shipping),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      paymentMethod: order.payment_method,
      paymentStatus: (manualPay && manualPay.payment_status) || order.payment_status,
      orderStatus: order.status,
      upiId: paySettings.manualUpiId,
      payeeName: paySettings.manualUpiPayeeName,
      upiUri,
      qrDataUrl,
      screenshotEnabled: paySettings.manualUpiScreenshotEnabled,
      submission: manualPay && manualPay.submitted_at ? {
        upiApp: manualPay.upi_app,
        transactionId: manualPay.transaction_id,
        screenshotPath: manualPay.screenshot_path,
        submittedAt: manualPay.submitted_at,
        rejectionReason: manualPay.rejection_reason,
      } : null,
      rejectionReason: manualPay ? manualPay.rejection_reason : null,
    });
  } catch (err) {
    console.error("[payments] manual upi order error:", err);
    res.status(500).json({ error: "Failed to load order payment details" });
  }
});

// POST /api/payments/manual-upi/submit
// Submits transaction ID / UTR and optional screenshot for verification
router.post("/manual-upi/submit", statusLimiter, async (req, res) => {
  const { orderId, upiApp, transactionId, screenshotUrl, customerPhone } = req.body || {};
  if (!orderId || !String(orderId).trim()) return res.status(400).json({ error: "Order ID is required" });

  try {
    const [[order]] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const authHeader = req.headers["x-order-access"];
    const phoneInput = customerPhone ? normalizePhone(customerPhone) : "";
    const isOwner = hasOrderAccess(order.id, authHeader) || (phoneInput && phoneInput === normalizePhone(order.customer_phone));
    if (!isOwner) {
      return res.status(403).json({ error: "You are not authorized to submit payment for this order." });
    }

    if (order.payment_status === "paid") {
      return res.status(400).json({ error: "Payment for this order has already been verified." });
    }

    if (!upiApp || !String(upiApp).trim()) {
      return res.status(400).json({ error: "Please select the UPI app you used to pay." });
    }

    const val = validateTransactionId(transactionId);
    if (!val.valid) {
      return res.status(400).json({ error: val.error });
    }
    const normalized = val.normalized;

    // Duplicate UTR check across different orders
    const [[duplicate]] = await pool.query(
      "SELECT id, order_id FROM manual_upi_payments WHERE normalized_transaction_id = ? AND order_id != ?",
      [normalized, orderId]
    );
    if (duplicate) {
      return res.status(400).json({ error: "This Transaction ID has already been submitted. Please check your payment details." });
    }

    const paySettings = await getPaymentSettings();
    const upiUri = generateUpiUri({
      upiId: paySettings.manualUpiId,
      payeeName: paySettings.manualUpiPayeeName,
      amount: order.total,
      orderRef: order.id,
    });

    const safeScreenshot = (screenshotUrl && typeof screenshotUrl === "string" && screenshotUrl.startsWith("/uploads/"))
      ? screenshotUrl.slice(0, 500)
      : null;

    await pool.query(
      `INSERT INTO manual_upi_payments
        (order_id, payment_method, expected_amount, upi_id, payee_name, upi_uri, upi_app, transaction_id, normalized_transaction_id, screenshot_path, payment_status, submitted_at, rejection_reason)
       VALUES (?, 'manual_upi', ?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', NOW(), NULL)
       ON DUPLICATE KEY UPDATE
        upi_app = VALUES(upi_app),
        transaction_id = VALUES(transaction_id),
        normalized_transaction_id = VALUES(normalized_transaction_id),
        screenshot_path = VALUES(screenshot_path),
        payment_status = 'pending_verification',
        submitted_at = NOW(),
        rejection_reason = NULL`,
      [
        orderId, order.total, paySettings.manualUpiId, paySettings.manualUpiPayeeName,
        upiUri, String(upiApp).slice(0, 50), String(transactionId).trim().slice(0, 100),
        normalized, safeScreenshot,
      ]
    );

    await pool.query("UPDATE orders SET payment_status = 'pending_verification' WHERE id = ?", [orderId]);

    res.json({
      success: true,
      orderId,
      paymentStatus: "pending_verification",
      message: "Your payment details have been submitted successfully and are under verification.",
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "This Transaction ID has already been submitted. Please check your payment details." });
    }
    console.error("[payments] manual upi submit error:", err);
    res.status(500).json({ error: "Payment details could not be submitted. Please try again." });
  }
});

// Admin endpoints:
// GET /api/payments/manual-upi/admin/list
router.get("/manual-upi/admin/list", requireAdmin, async (req, res) => {
  const status = req.query.status || "pending_verification";
  try {
    let sql = `
      SELECT m.*, o.customer_name, o.customer_phone, o.customer_email, o.items_json, o.total, o.created_at AS order_created_at, o.status AS order_status
      FROM manual_upi_payments m
      JOIN orders o ON m.order_id = o.id
    `;
    const params = [];
    if (status && status !== "all") {
      sql += " WHERE m.payment_status = ?";
      params.push(status);
    }
    sql += " ORDER BY m.submitted_at DESC, m.created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      paymentMethod: r.payment_method,
      expectedAmount: Number(r.expected_amount),
      upiId: r.upi_id,
      payeeName: r.payee_name,
      upiApp: r.upi_app,
      transactionId: r.transaction_id,
      screenshotPath: r.screenshot_path,
      paymentStatus: r.payment_status,
      submittedAt: r.submitted_at,
      verifiedAt: r.verified_at,
      verifiedBy: r.verified_by,
      rejectedAt: r.rejected_at,
      rejectedBy: r.rejected_by,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      orderTotal: Number(r.total),
      orderCreatedAt: r.order_created_at,
      orderStatus: r.order_status,
      items: (() => {
        try { return JSON.parse(r.items_json || "[]"); } catch { return []; }
      })(),
    })));
  } catch (err) {
    console.error("[payments] manual upi admin list error:", err);
    res.status(500).json({ error: "Failed to fetch manual UPI payments" });
  }
});

// GET /api/payments/manual-upi/admin/pending-count
router.get("/manual-upi/admin/pending-count", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM manual_upi_payments WHERE payment_status = 'pending_verification'"
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error("[payments] manual upi pending count error:", err);
    res.status(500).json({ error: "Failed to fetch pending count" });
  }
});

// GET /api/payments/manual-upi/admin/:orderId
router.get("/manual-upi/admin/:orderId", requireAdmin, async (req, res) => {
  try {
    const [[m]] = await pool.query(
      `SELECT m.*, o.customer_name, o.customer_phone, o.customer_email, o.shipping_address, o.city, o.state, o.pincode, o.items_json, o.total, o.created_at AS order_created_at, o.status AS order_status
       FROM manual_upi_payments m
       JOIN orders o ON m.order_id = o.id
       WHERE m.order_id = ?`,
      [req.params.orderId]
    );
    if (!m) return res.status(404).json({ error: "Manual UPI payment not found" });

    res.json({
      id: m.id,
      orderId: m.order_id,
      paymentMethod: m.payment_method,
      expectedAmount: Number(m.expected_amount),
      upiId: m.upi_id,
      payeeName: m.payee_name,
      upiApp: m.upi_app,
      transactionId: m.transaction_id,
      screenshotPath: m.screenshot_path,
      paymentStatus: m.payment_status,
      submittedAt: m.submitted_at,
      verifiedAt: m.verified_at,
      verifiedBy: m.verified_by,
      rejectedAt: m.rejected_at,
      rejectedBy: m.rejected_by,
      rejectionReason: m.rejection_reason,
      createdAt: m.created_at,
      customerName: m.customer_name,
      customerPhone: m.customer_phone,
      customerEmail: m.customer_email,
      shippingAddress: m.shipping_address,
      city: m.city,
      state: m.state,
      pincode: m.pincode,
      orderTotal: Number(m.total),
      orderCreatedAt: m.order_created_at,
      orderStatus: m.order_status,
      items: (() => {
        try { return JSON.parse(m.items_json || "[]"); } catch { return []; }
      })(),
    });
  } catch (err) {
    console.error("[payments] manual upi admin detail error:", err);
    res.status(500).json({ error: "Failed to fetch payment details" });
  }
});

// POST /api/payments/manual-upi/admin/:orderId/confirm
router.post("/manual-upi/admin/:orderId/confirm", requireAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  const adminEmail = (req.admin && req.admin.email) ? req.admin.email : "admin";
  try {
    const [[payment]] = await pool.query("SELECT * FROM manual_upi_payments WHERE order_id = ?", [orderId]);
    if (!payment) return res.status(404).json({ error: "Payment record not found" });
    const [[order]] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) return res.status(404).json({ error: "Order not found" });

    await pool.query(
      `UPDATE manual_upi_payments
       SET payment_status = 'verified', verified_at = NOW(), verified_by = ?, rejection_reason = NULL
       WHERE order_id = ?`,
      [adminEmail, orderId]
    );

    await pool.query(
      `UPDATE orders
       SET payment_status = 'paid', status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END
       WHERE id = ?`,
      [orderId]
    );

    // Send order confirmation notifications using existing system
    try {
      const items = JSON.parse(order.items_json || "[]");
      sendNewOrderEmails({
        ...order,
        items,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        courier: order.courier,
        shippingAddress: order.shipping_address,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
      }, orderId);
    } catch (emailErr) {
      console.error("[payments] Confirmation email send failed:", emailErr.message);
    }

    res.json({ success: true, orderId, paymentStatus: "paid" });
  } catch (err) {
    console.error("[payments] manual upi confirm error:", err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

// POST /api/payments/manual-upi/admin/:orderId/reject
router.post("/manual-upi/admin/:orderId/reject", requireAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  const adminEmail = (req.admin && req.admin.email) ? req.admin.email : "admin";
  const { reason, notes } = req.body || {};
  const fullReason = (reason === "Other" && notes)
    ? `Other: ${String(notes).trim()}`
    : (reason || "Payment not received");

  try {
    const [[payment]] = await pool.query("SELECT * FROM manual_upi_payments WHERE order_id = ?", [orderId]);
    if (!payment) return res.status(404).json({ error: "Payment record not found" });

    await pool.query(
      `UPDATE manual_upi_payments
       SET payment_status = 'failed', rejected_at = NOW(), rejected_by = ?, rejection_reason = ?
       WHERE order_id = ?`,
      [adminEmail, fullReason, orderId]
    );

    await pool.query("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [orderId]);

    res.json({ success: true, orderId, paymentStatus: "failed", rejectionReason: fullReason });
  } catch (err) {
    console.error("[payments] manual upi reject error:", err);
    res.status(500).json({ error: "Failed to reject payment" });
  }
});

module.exports = router;
