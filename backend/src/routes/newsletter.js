const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// POST /api/newsletter - public signup
router.post("/", async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
