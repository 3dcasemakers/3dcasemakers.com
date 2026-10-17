const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/review-stories - public, active stories only. No auto-expiry —
// stories stay up (like Instagram Highlights) until admin deactivates/deletes
// them from the panel.
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM review_stories WHERE is_active = 1 ORDER BY display_order ASC, created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});

// GET /api/review-stories/admin/all - admin (active + inactive)
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM review_stories ORDER BY display_order ASC, created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});

// POST /api/review-stories (admin) - post today's story
router.post("/", requireAdmin, async (req, res) => {
  const { image, video, mediaType, name, caption, displayOrder = 0 } = req.body;
  if (!image) return res.status(400).json({ error: "Image is required" });
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  const finalMediaType = mediaType === "video" && video ? "video" : "image";
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO review_stories (id, image, video, media_type, name, caption, display_order) VALUES (?,?,?,?,?,?,?)",
      [id, image, finalMediaType === "video" ? video : null, finalMediaType, String(name).trim().slice(0, 255), (caption || "").slice(0, 255), displayOrder]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create story" });
  }
});

// PUT /api/review-stories/:id (admin) - edit name/caption/order or toggle active
router.put("/:id", requireAdmin, async (req, res) => {
  const { image, video, mediaType, name, caption, displayOrder, isActive } = req.body;
  try {
    const fields = [];
    const values = [];
    if (image !== undefined) { fields.push("image=?"); values.push(image); }
    if (video !== undefined) { fields.push("video=?"); values.push(video || null); }
    if (mediaType !== undefined) { fields.push("media_type=?"); values.push(mediaType === "video" ? "video" : "image"); }
    if (name !== undefined) { fields.push("name=?"); values.push(String(name).trim().slice(0, 255)); }
    if (caption !== undefined) { fields.push("caption=?"); values.push((caption || "").slice(0, 255)); }
    if (displayOrder !== undefined) { fields.push("display_order=?"); values.push(displayOrder); }
    if (isActive !== undefined) { fields.push("is_active=?"); values.push(isActive ? 1 : 0); }
    if (!fields.length) return res.json({ success: true });
    values.push(req.params.id);
    await pool.query(`UPDATE review_stories SET ${fields.join(", ")} WHERE id=?`, values);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update story" });
  }
});

// PUT /api/review-stories/reorder/all (admin) - bulk save new drag order
router.put("/reorder/all", requireAdmin, async (req, res) => {
  const { ids } = req.body; // array of story ids, in new display order
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
  try {
    await Promise.all(ids.map((id, i) => pool.query("UPDATE review_stories SET display_order=? WHERE id=?", [i, id])));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reorder stories" });
  }
});

// DELETE /api/review-stories/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM review_stories WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete story" });
  }
});

module.exports = router;
