const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/customers (admin) - derives a customer list from orders, grouped by phone number.
// A phone number that appears on more than one order is flagged as a "frequent customer".
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT customer_name, customer_email, customer_phone, customer_alt_phone, shipping_address, city, state, pincode, total, status, created_at FROM orders ORDER BY created_at DESC"
    );

    const byPhone = {};
    for (const r of rows) {
      const phone = (r.customer_phone || "").trim();
      if (!phone) continue;

      if (!byPhone[phone]) {
        // Rows are ordered newest-first, so the first row seen for a phone is its latest order.
        byPhone[phone] = {
          phone,
          name: r.customer_name || "",
          email: r.customer_email || "",
          altPhone: r.customer_alt_phone || "",
          address: r.shipping_address || "",
          city: r.city || "",
          state: r.state || "",
          pincode: r.pincode || "",
          orderCount: 0,
          totalSpent: 0,
          lastOrderAt: r.created_at,
        };
      }
      // Cancelled orders never counted towards a customer's order count or
      // spend — keeps this list consistent with the revenue/report numbers
      // elsewhere in the admin, which also exclude cancelled orders.
      if (r.status !== "cancelled") {
        byPhone[phone].orderCount += 1;
        byPhone[phone].totalSpent += Number(r.total) || 0;
      }
      if (new Date(r.created_at) > new Date(byPhone[phone].lastOrderAt)) {
        byPhone[phone].lastOrderAt = r.created_at;
      }
    }

    const customers = Object.values(byPhone)
      .map((c) => ({ ...c, isFrequent: c.orderCount > 1 }))
      .sort((a, b) => b.orderCount - a.orderCount || new Date(b.lastOrderAt) - new Date(a.lastOrderAt));

    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

module.exports = router;
