const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/faqs - public, visible only
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM faqs WHERE is_visible = 1 ORDER BY display_order ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
});

// GET /api/faqs/all - admin, includes hidden
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM faqs ORDER BY display_order ASC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
});

// POST /api/faqs (admin)
router.post("/", requireAdmin, async (req, res) => {
  const { question, answer, category = "About 3DCaseMakers", displayOrder = 0 } = req.body;
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO faqs (id, question, answer, category, display_order) VALUES (?,?,?,?,?)",
      [id, question, answer, category, displayOrder]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create FAQ" });
  }
});

// PUT /api/faqs/:id (admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const { question, answer, category, displayOrder, isVisible } = req.body;
  try {
    await pool.query(
      "UPDATE faqs SET question=?, answer=?, category=?, display_order=?, is_visible=? WHERE id=?",
      [question, answer, category || "About 3DCaseMakers", displayOrder ?? 0, isVisible ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update FAQ" });
  }
});

// DELETE /api/faqs/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM faqs WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

module.exports = router;
