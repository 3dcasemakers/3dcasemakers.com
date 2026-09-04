const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/snaps - public, visible only
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM our_snaps WHERE is_visible = 1 ORDER BY display_order ASC, created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch snaps" });
  }
});

// GET /api/snaps/all - admin
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM our_snaps ORDER BY display_order ASC, created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch snaps" });
  }
});

// POST /api/snaps (admin)
router.post("/", requireAdmin, async (req, res) => {
  const { imageUrl, caption, instagramUrl, productId, displayOrder = 0 } = req.body;
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO our_snaps (id, image_url, caption, instagram_url, product_id, display_order) VALUES (?,?,?,?,?,?)",
      [id, imageUrl, caption || "", instagramUrl || "", productId || null, displayOrder]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create snap" });
  }
});

// PUT /api/snaps/:id (admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const { imageUrl, caption, instagramUrl, productId, displayOrder, isVisible } = req.body;
  try {
    await pool.query(
      "UPDATE our_snaps SET image_url=?, caption=?, instagram_url=?, product_id=?, display_order=?, is_visible=? WHERE id=?",
      [imageUrl, caption || "", instagramUrl || "", productId || null, displayOrder ?? 0, isVisible ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update snap" });
  }
});

// DELETE /api/snaps/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM our_snaps WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete snap" });
  }
});

module.exports = router;
