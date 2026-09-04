const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

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
             AND DATE(CONVERT_TZ(sent_at, '+00:00', '+05:30')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))`,
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

module.exports = router;
