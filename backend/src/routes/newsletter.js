const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();
const signupLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 });

// POST /api/newsletter - public signup
router.post("/", signupLimiter, async (req, res) => {
  const email = String((req.body && req.body.email) || "").slice(0, 255);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Please enter a valid email" });
  }
  try {
    await pool.query(
      "INSERT IGNORE INTO newsletter_subscribers (email) VALUES (?)",
      [email.trim().toLowerCase()]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// GET /api/newsletter - admin: list + CSV export support
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, created_at FROM newsletter_subscribers ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
});

module.exports = router;
