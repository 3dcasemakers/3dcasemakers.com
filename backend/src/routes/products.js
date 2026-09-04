const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Default description applied to every product that doesn't have a custom one set
// (used as fallback on create/update so admin never has to retype it product-by-product).
const DEFAULT_PRODUCT_DESCRIPTION =
  "Protect your phone with confidence using our Premium Mobile Case, crafted from high-quality materials for long-lasting durability. Designed with reinforced edge protection, it absorbs shocks and helps safeguard your device from accidental drops and impacts. The precise fit ensures easy access to all buttons and ports while maintaining a sleek, stylish look. Its anti-slip grip offers comfortable handling and added security in everyday use. Built for both protection and elegance, this case keeps your phone safe without compromising on style.";

function rowToProduct(row, extraCollectionIds = []) {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    comparePrice: Number(row.compare_price),
    discount: row.discount,
    description: row.description,
    brand: row.brand || "",
    material: row.material || "",
    collectionId: row.collection_id,
    collectionIds: extraCollectionIds.length ? extraCollectionIds : [row.collection_id].filter(Boolean),
    tags: safeParse(row.tags, []),
    stockStatus: row.stock_status,
    isFeatured: !!row.is_featured,
    isTrending: !!row.is_trending,
    isNewArrival: !!row.is_new_arrival,
    isBestSeller: !!row.is_best_seller,
    isCustomizable: !!row.is_customizable,
    requiresCustomerName: !!row.requires_customer_name,
    customization: row.customization_json ? safeParse(row.customization_json, undefined) : undefined,
    images: safeParse(row.images, []),
    models: safeParse(row.models, []),
    variantGroupId: row.variant_group_id || "",
    materialSetId: row.material_set_id || "",
    rating: Number(row.rating),
    reviewsCount: row.reviews_count,
    displayOrder: row.display_order,
    trendingOrder: row.trending_order,
    bestSellerOrder: row.best_seller_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
  };
}

function safeParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

// GET /api/products  (optional ?collection=slug)
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY display_order ASC, created_at DESC");
    const [links] = await pool.query("SELECT * FROM product_collections");
    const byProduct = {};
    links.forEach((l) => {
      byProduct[l.product_id] = byProduct[l.product_id] || [];
      byProduct[l.product_id].push(l.collection_id);
    });
    const products = rows.map((r) => rowToProduct(r, byProduct[r.id] || []));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Product not found" });
    const [links] = await pool.query("SELECT collection_id FROM product_collections WHERE product_id = ?", [req.params.id]);
    res.json(rowToProduct(rows[0], links.map((l) => l.collection_id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// POST /api/products (admin)
router.post("/", requireAdmin, async (req, res) => {
  const p = req.body;
  const id = p.id || crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO products
      (id, title, price, compare_price, discount, description, brand, material, collection_id, tags, stock_status,
       is_featured, is_trending, is_new_arrival, is_best_seller, is_customizable, requires_customer_name, customization_json, images, models, variant_group_id, material_set_id, rating, reviews_count, display_order, trending_order, best_seller_order, meta_title, meta_description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, p.title, p.price || 0, p.comparePrice || 0, p.discount || 0, p.description || DEFAULT_PRODUCT_DESCRIPTION, p.brand || null, p.material || null,
        p.collectionId || null, JSON.stringify(p.tags || []), p.stockStatus || "in_stock",
        !!p.isFeatured, !!p.isTrending, !!p.isNewArrival, !!p.isBestSeller, !!p.isCustomizable, !!p.requiresCustomerName,
        p.customization ? JSON.stringify(p.customization) : null,
        JSON.stringify((p.images || []).slice(0, 5)), JSON.stringify(p.models || []), p.variantGroupId || null, p.materialSetId || null,
        p.rating || 5, p.reviewsCount || 0, p.displayOrder || 0, p.trendingOrder || 0, p.bestSellerOrder || 0,
        p.metaTitle || null, p.metaDescription || null,
      ]
    );
    const collIds = p.collectionIds && p.collectionIds.length ? p.collectionIds : [p.collectionId].filter(Boolean);
    for (const cid of collIds) {
      await pool.query("INSERT IGNORE INTO product_collections (product_id, collection_id) VALUES (?,?)", [id, cid]);
    }
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.sqlMessage || err.message || "Failed to create product" });
  }
});

// PUT /api/products/:id (admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const p = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      `UPDATE products SET title=?, price=?, compare_price=?, discount=?, description=?, brand=?, material=?, collection_id=?,
       tags=?, stock_status=?, is_featured=?, is_trending=?, is_new_arrival=?, is_best_seller=?, is_customizable=?, requires_customer_name=?, customization_json=?,
       images=?, models=?, variant_group_id=?, material_set_id=?, rating=?, reviews_count=?, display_order=?, trending_order=?, best_seller_order=?, meta_title=?, meta_description=? WHERE id=?`,
      [
        p.title, p.price || 0, p.comparePrice || 0, p.discount || 0, p.description || DEFAULT_PRODUCT_DESCRIPTION, p.brand || null, p.material || null,
        p.collectionId || null, JSON.stringify(p.tags || []), p.stockStatus || "in_stock",
        !!p.isFeatured, !!p.isTrending, !!p.isNewArrival, !!p.isBestSeller, !!p.isCustomizable, !!p.requiresCustomerName,
        p.customization ? JSON.stringify(p.customization) : null,
        JSON.stringify((p.images || []).slice(0, 5)), JSON.stringify(p.models || []), p.variantGroupId || null, p.materialSetId || null,
        p.rating || 5, p.reviewsCount || 0, p.displayOrder || 0, p.trendingOrder || 0, p.bestSellerOrder || 0,
        p.metaTitle || null, p.metaDescription || null, id,
      ]
    );
    if (p.collectionIds) {
      await pool.query("DELETE FROM product_collections WHERE product_id = ?", [id]);
      for (const cid of p.collectionIds) {
        await pool.query("INSERT IGNORE INTO product_collections (product_id, collection_id) VALUES (?,?)", [id, cid]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.sqlMessage || err.message || "Failed to update product" });
  }
});

// DELETE /api/products/:id (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// POST /api/products/bulk-delete (admin) - feature 17: bulk product actions
router.post("/bulk-delete", requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids array required" });
  try {
    await pool.query(`DELETE FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk delete failed" });
  }
});

// POST /api/products/bulk-update (admin) - feature 17: bulk edit (stock status, collection, featured flags)
router.post("/bulk-update", requireAdmin, async (req, res) => {
  const { ids, changes } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids array required" });
  if (!changes || typeof changes !== "object") return res.status(400).json({ error: "changes object required" });

  const fieldMap = {
    stockStatus: "stock_status",
    collectionId: "collection_id",
    isFeatured: "is_featured",
    isTrending: "is_trending",
    isNewArrival: "is_new_arrival",
    isBestSeller: "is_best_seller",
    isCustomizable: "is_customizable",
    requiresCustomerName: "requires_customer_name",
    discount: "discount",
    material: "material",
    variantGroupId: "variant_group_id",
  };
  const setClauses = [];
  const values = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in changes) {
      setClauses.push(`${col} = ?`);
      values.push(changes[key]);
    }
  }
  if (!setClauses.length) return res.status(400).json({ error: "No valid fields to update" });

  try {
    await pool.query(
      `UPDATE products SET ${setClauses.join(", ")} WHERE id IN (${ids.map(() => "?").join(",")})`,
      [...values, ...ids]
    );
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk update failed" });
  }
});

module.exports = router;
