const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM collections ORDER BY display_order ASC");
    const [subs] = await pool.query("SELECT * FROM subcollections ORDER BY display_order ASC");
    // Manual per-collection product order (may not exist yet on an old DB).
    const orderByCollection = {};
    try {
      const [ord] = await pool.query("SELECT collection_id, product_id FROM collection_product_order ORDER BY collection_id, sort_order ASC");
      ord.forEach((o) => {
        (orderByCollection[o.collection_id] = orderByCollection[o.collection_id] || []).push(o.product_id);
      });
    } catch (e) {
      /* table not created yet - ordering falls back to products.display_order */
    }
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
      productOrder: orderByCollection[r.id] || [],
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

// "Summer Sale!" -> "summer-sale"
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectionError(err, fallback) {
  if (err && err.code === "ER_DUP_ENTRY") return { status: 409, error: "Another collection already uses this URL slug — pick a different slug." };
  return { status: 500, error: fallback };
}

router.post("/", requireAdmin, async (req, res) => {
  const c = req.body || {};
  if (!c.name || !String(c.name).trim()) return res.status(400).json({ error: "Collection name is required" });
  c.slug = slugify(c.slug || c.name);
  if (!c.slug) return res.status(400).json({ error: "Collection URL slug is required" });
  const id = c.id || crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO collections (id, name, slug, image, banner_mobile, banner_desktop, banner_media_type, banner_video_url, description, is_visible, is_highlighted, variant_group_id, display_order, meta_title, meta_description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, c.name, c.slug, c.image || "", c.bannerMobile || "", c.bannerDesktop || "", c.bannerMediaType || "image", c.bannerVideoUrl || "", c.description || "", c.isVisible !== false, !!c.isHighlighted, c.variantGroupId || null, c.displayOrder || 0, c.metaTitle || "", c.metaDescription || ""]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    const e = collectionError(err, "Failed to create collection");
    res.status(e.status).json({ error: e.error });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  const c = req.body || {};
  if (!c.name || !String(c.name).trim()) return res.status(400).json({ error: "Collection name is required" });
  c.slug = slugify(c.slug || c.name);
  if (!c.slug) return res.status(400).json({ error: "Collection URL slug is required" });
  try {
    await pool.query(
      "UPDATE collections SET name=?, slug=?, image=?, banner_mobile=?, banner_desktop=?, banner_media_type=?, banner_video_url=?, description=?, is_visible=?, is_highlighted=?, variant_group_id=?, display_order=?, meta_title=?, meta_description=? WHERE id=?",
      [c.name, c.slug, c.image || "", c.bannerMobile || "", c.bannerDesktop || "", c.bannerMediaType || "image", c.bannerVideoUrl || "", c.description || "", c.isVisible !== false, !!c.isHighlighted, c.variantGroupId || null, c.displayOrder || 0, c.metaTitle || "", c.metaDescription || "", req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    const e = collectionError(err, "Failed to update collection");
    res.status(e.status).json({ error: e.error });
  }
});

// PUT /api/collections/:id/product-order  { ids: [productId, ...] }
// Saves the manual order of products inside ONE collection (first id = first shown).
router.put("/:id/product-order", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
  if (!ids || ids.length > 5000) return res.status(400).json({ error: "ids array required" });
  const unique = [...new Set(ids)];
  const conn = await pool.getConnection();
  try {
    const [[col]] = await conn.query("SELECT COUNT(*) AS cnt FROM collections WHERE id = ?", [req.params.id]);
    if (!col.cnt) return res.status(404).json({ error: "Collection not found" });
    await conn.beginTransaction();
    await conn.query("DELETE FROM collection_product_order WHERE collection_id = ?", [req.params.id]);
    if (unique.length) {
      await conn.query(
        "INSERT INTO collection_product_order (collection_id, product_id, sort_order) VALUES " + unique.map(() => "(?,?,?)").join(","),
        unique.flatMap((pid, i) => [req.params.id, pid, i])
      );
    }
    await conn.commit();
    res.json({ success: true, count: unique.length });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    console.error(err);
    res.status(500).json({ error: "Failed to save product order" });
  } finally {
    conn.release();
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM collections WHERE id = ?", [req.params.id]);
    try { await pool.query("DELETE FROM collection_product_order WHERE collection_id = ?", [req.params.id]); } catch (e) { /* table may not exist */ }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

module.exports = router;
