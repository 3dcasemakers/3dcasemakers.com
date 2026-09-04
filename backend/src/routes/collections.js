const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM collections ORDER BY display_order ASC");
    const [subs] = await pool.query("SELECT * FROM subcollections ORDER BY display_order ASC");
    const collections = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      image: r.image,
      bannerMobile: r.banner_mobile || "",
      bannerDesktop: r.banner_desktop || "",
      bannerMediaType: r.banner_media_type || "image",
      bannerVideoUrl: r.banner_video_url || "",
      description: r.description,
      isVisible: !!r.is_visible,
      isHighlighted: !!r.is_highlighted,
      variantGroupId: r.variant_group_id || "",
      displayOrder: r.display_order,
      metaTitle: r.meta_title || "",
      metaDescription: r.meta_description || "",
      subcollections: subs.filter((s) => s.collection_id === r.id).map((s) => ({
        id: s.id, name: s.name, image: s.image, displayOrder: s.display_order,
      })),
    }));
    res.json(collections);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const c = req.body;
  const id = c.id || crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO collections (id, name, slug, image, banner_mobile, banner_desktop, banner_media_type, banner_video_url, description, is_visible, is_highlighted, variant_group_id, display_order, meta_title, meta_description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, c.name, c.slug, c.image || "", c.bannerMobile || "", c.bannerDesktop || "", c.bannerMediaType || "image", c.bannerVideoUrl || "", c.description || "", c.isVisible !== false, !!c.isHighlighted, c.variantGroupId || null, c.displayOrder || 0, c.metaTitle || "", c.metaDescription || ""]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create collection" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  const c = req.body;
  try {
    await pool.query(
      "UPDATE collections SET name=?, slug=?, image=?, banner_mobile=?, banner_desktop=?, banner_media_type=?, banner_video_url=?, description=?, is_visible=?, is_highlighted=?, variant_group_id=?, display_order=?, meta_title=?, meta_description=? WHERE id=?",
      [c.name, c.slug, c.image || "", c.bannerMobile || "", c.bannerDesktop || "", c.bannerMediaType || "image", c.bannerVideoUrl || "", c.description || "", c.isVisible !== false, !!c.isHighlighted, c.variantGroupId || null, c.displayOrder || 0, c.metaTitle || "", c.metaDescription || "", req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update collection" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM collections WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

module.exports = router;
