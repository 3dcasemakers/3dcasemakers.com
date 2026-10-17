const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { sendTestEmail, getEmailConfigStatus } = require("../services/emailService");

const router = express.Router();

// Gmail's SMTP sending limit for a regular Gmail account: 500 emails per
// rolling 24-hour window. Both mailboxes this store sends from (EMAIL_USER
// and ORDERS_EMAIL_USER) are plain Gmail accounts, so the same cap applies
// to each independently.
const GMAIL_DAILY_LIMIT = 500;

// GET /api/email-usage
// Powers Admin -> Gmail Manager: today's send count for each configured
// mailbox, plus the shared 500/24hr Gmail limit, so the panel can render a
// usage pie chart per mailbox. "Today" = Asia/Kolkata calendar day, same
// convention used everywhere else in the admin (orders, visitors, etc).
router.get("/", requireAdmin, async (req, res) => {
  try {
    const mailboxes = [
      { address: process.env.EMAIL_USER || null, label: "Store mailbox" },
      { address: process.env.ORDERS_EMAIL_USER || null, label: "Orders mailbox" },
    ].filter((m) => !!m.address);

    const results = await Promise.all(
      mailboxes.map(async (m) => {
        const [rows] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM email_send_log
           WHERE mailbox = ?
             AND DATE(sent_at) = CURDATE()`,
          [m.address]
        );
        const sentToday = rows[0]?.cnt || 0;
        return {
          address: m.address,
          label: m.label,
          sentToday,
          limit: GMAIL_DAILY_LIMIT,
          remaining: Math.max(0, GMAIL_DAILY_LIMIT - sentToday),
          usagePct: Math.min(100, Math.round((sentToday / GMAIL_DAILY_LIMIT) * 1000) / 10),
        };
      })
    );

    res.json({ limit: GMAIL_DAILY_LIMIT, windowHours: 24, mailboxes: results });
  } catch (err) {
    console.error("[email-usage] Failed to load stats:", err.message);
    res.status(500).json({ error: "Failed to load email usage" });
  }
});

// GET /api/email-usage/status — which mailboxes are configured (addresses masked).
router.get("/status", requireAdmin, (req, res) => {
  res.json(getEmailConfigStatus());
});

// POST /api/email-usage/test { mailbox: "customer" | "orders", to? }
// Verifies the Gmail login and sends a real test email, returning the exact
// SMTP error if it fails (wrong app password, 2-step verification off, ...).
router.post("/test", requireAdmin, async (req, res) => {
  const { mailbox, to } = req.body || {};
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) return res.status(400).json({ error: "Enter a valid email address" });
  const result = await sendTestEmail(mailbox === "orders" ? "orders" : "customer", to ? String(to).trim() : undefined);
  if (!result.sent) return res.status(502).json({ error: result.error });
  res.json({ success: true, from: result.from, to: result.to });
});

module.exports = router;
