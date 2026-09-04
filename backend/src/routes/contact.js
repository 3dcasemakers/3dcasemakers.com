const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { sendContactReplyEmail } = require("../services/emailService");

const router = express.Router();

// POST /api/contact - public: customer submits "Report an Issue" from the Contact page
router.post("/", async (req, res) => {
  const { name, email, phone, message } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: "Please enter your name" });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email" });
  if (!phone || !phone.trim()) return res.status(400).json({ error: "Please enter your contact number" });
  if (!message || !message.trim()) return res.status(400).json({ error: "Please describe the issue" });

  try {
    const id = crypto.randomUUID();
    await pool.query(
      "INSERT INTO contact_queries (id, name, email, phone, message, status) VALUES (?, ?, ?, ?, ?, 'new')",
      [id, name.trim(), email.trim().toLowerCase(), phone.trim(), message.trim()]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit — please try again" });
  }
});

// GET /api/contact - admin: list all queries, newest first (Queries tab)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, phone, message, status, reply_message, replied_at, created_at FROM contact_queries ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch queries" });
  }
});

// PUT /api/contact/:id/status - admin: mark as reviewed (or back to new)
router.put("/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["new", "reviewed", "replied"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  try {
    await pool.query("UPDATE contact_queries SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// POST /api/contact/:id/reply - admin: reply to the customer by email
// (FROM 3dcasemakers@gmail.com / EMAIL_USER, TO the customer's email on file)
router.post("/:id/reply", requireAdmin, async (req, res) => {
  const { reply } = req.body || {};
  if (!reply || !reply.trim()) return res.status(400).json({ error: "Reply message can't be empty" });

  try {
    const [rows] = await pool.query("SELECT * FROM contact_queries WHERE id = ?", [req.params.id]);
    const query = rows[0];
    if (!query) return res.status(404).json({ error: "Query not found" });

    const result = await sendContactReplyEmail({
      toEmail: query.email,
      toName: query.name,
      originalMessage: query.message,
      replyMessage: reply.trim(),
    });

    if (!result.sent) {
      return res.status(502).json({ error: "Reply saved failed — email could not be sent. Check EMAIL_USER/EMAIL_PASS in .env." });
    }

    await pool.query(
      "UPDATE contact_queries SET status = 'replied', reply_message = ?, replied_at = NOW() WHERE id = ?",
      [reply.trim(), req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// DELETE /api/contact/:id - admin: permanently delete a query
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM contact_queries WHERE id = ?", [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Query not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete query" });
  }
});

module.exports = router;
