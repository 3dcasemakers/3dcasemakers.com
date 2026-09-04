const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

async function recalcProductRating(productId) {
  const [rows] = await pool.query(
    "SELECT AVG(rating) as avgRating, COUNT(*) as cnt FROM product_reviews WHERE product_id=? AND is_approved=1",
    [productId]
  );
  const avg = rows[0].cnt ? Number(rows[0].avgRating).toFixed(1) : 5.0;
  await pool.query("UPDATE products SET rating=?, reviews_count=? WHERE id=?", [
    avg,
    rows[0].cnt,
    productId,
  ]);
}

// GET /api/reviews - public, approved reviews across all products (homepage testimonials
// use the default limit of 9; the storefront /reviews page passes ?limit=500 to load
// the full "Product Reviews" list for its filter tab).
router.get("/", async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 9));
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.name, r.rating, r.comment, r.image, r.created_at, p.title as product_title
       FROM product_reviews r LEFT JOIN products p ON p.id = r.product_id
       WHERE r.is_approved=1 ORDER BY r.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// GET /api/reviews/admin/all - admin moderation list (all reviews, approved or not)
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, p.title as product_title
       FROM product_reviews r LEFT JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// PUT /api/reviews/:id/approve - admin toggle approval
router.put("/:id/approve", requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE product_reviews SET is_approved=? WHERE id=?", [req.body.isApproved ? 1 : 0, req.params.id]);
    const [rows] = await pool.query("SELECT product_id FROM product_reviews WHERE id=?", [req.params.id]);
    if (rows.length) await recalcProductRating(rows[0].product_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update review" });
  }
});

// GET /api/reviews/:productId - public, approved only
router.get("/:productId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, rating, comment, image, created_at FROM product_reviews WHERE product_id=? AND is_approved=1 ORDER BY created_at DESC",
      [req.params.productId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// POST /api/reviews/:productId - public submit (pending admin approval)
router.post("/:productId", async (req, res) => {
  const { name, rating, comment, image } = req.body;
  if (!name || !rating) return res.status(400).json({ error: "Name and rating are required" });
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO product_reviews (id, product_id, name, rating, comment, image, is_approved) VALUES (?,?,?,?,?,?,0)",
      [id, req.params.productId, name, Math.min(5, Math.max(1, rating)), comment || "", image || ""]
    );
    // Not recalculating the product rating here on purpose - it stays out of the
    // average until an admin approves it in the Reviews tab.
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// DELETE /api/reviews/:id - admin moderation
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT product_id FROM product_reviews WHERE id=?", [req.params.id]);
    await pool.query("DELETE FROM product_reviews WHERE id=?", [req.params.id]);
    if (rows.length) await recalcProductRating(rows[0].product_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
