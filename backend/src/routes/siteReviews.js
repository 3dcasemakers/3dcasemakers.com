const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();
const submitLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: "Too many reviews submitted — please try again later." });

const mapRow = (r) => ({
  id: r.id,
  name: r.name,
  rating: r.rating,
  comment: r.comment,
  image: r.image || "",
  isApproved: !!r.is_approved,
  createdAt: r.created_at,
});

// GET /api/site-reviews - public, approved-only, newest first.
// Used on the storefront's /reviews page and the Cart page carousel.
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM site_reviews WHERE is_approved=1 ORDER BY created_at DESC"
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// GET /api/site-reviews/admin/all - admin moderation queue (pending + approved).
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM site_reviews ORDER BY is_approved ASC, created_at DESC"
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// POST /api/site-reviews - public submit ("Write a Review" on the storefront).
// Always goes in as pending (is_approved=0) — only shows up on the site once
// an admin approves it from Website Content -> Reviews Approval Queue.
router.post("/", submitLimiter, async (req, res) => {
  const { name, rating, comment, image } = req.body || {};
  if (!name || !String(name).trim() || !rating) return res.status(400).json({ error: "Name and rating are required" });
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO site_reviews (id, name, rating, comment, image, is_approved) VALUES (?,?,?,?,?,0)",
      [id, String(name).trim().slice(0, 255), Math.min(5, Math.max(1, Math.round(Number(rating)) || 5)), String(comment || "").slice(0, 2000), String(image || "").slice(0, 500)]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// PUT /api/site-reviews/:id/approve - admin toggle approval on/off.
router.put("/:id/approve", requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE site_reviews SET is_approved=? WHERE id=?", [req.body.isApproved ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update review" });
  }
});

// DELETE /api/site-reviews/:id - admin moderation (reject/remove permanently).
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM site_reviews WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
