const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM banners ORDER BY display_order ASC");
    res.json(
      rows.map((b) => ({
        id: b.id, title: b.title, subtitle: b.subtitle, badge: b.badge,
        imageUrl: b.image_url, mobileImageUrl: b.mobile_image_url,
        mediaType: b.media_type || "image", videoUrl: b.video_url || "",
        link: b.link, active: !!b.active, order: b.display_order,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const b = req.body;
  const id = b.id || crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO banners (id, title, subtitle, badge, image_url, mobile_image_url, media_type, video_url, link, active, display_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, b.title || "", b.subtitle || "", b.badge || "", b.imageUrl || "", b.mobileImageUrl || "", b.mediaType || "image", b.videoUrl || "", b.link || "", b.active !== false, b.order || 0]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create banner" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  const b = req.body;
  try {
    await pool.query(
      "UPDATE banners SET title=?, subtitle=?, badge=?, image_url=?, mobile_image_url=?, media_type=?, video_url=?, link=?, active=?, display_order=? WHERE id=?",
      [b.title || "", b.subtitle || "", b.badge || "", b.imageUrl || "", b.mobileImageUrl || "", b.mediaType || "image", b.videoUrl || "", b.link || "", b.active !== false, b.order || 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update banner" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM banners WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

module.exports = router;
