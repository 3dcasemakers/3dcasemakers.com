const express = require("express");
const pool = require("../config/db");

const router = express.Router();

// Where the storefront (not this API) is hosted — used to build the product
// page links that go inside the feed. Falls back to the same value used for
// CORS so this doesn't need a second env var in most setups.
const SITE_URL = (process.env.CLIENT_URL || "https://3dcasemakers.in").split(",")[0].trim();

// Default Google product category for phone cases/accessories. Can be
// overridden per-request via env if 3DCaseMakers ever diversifies categories.
const DEFAULT_GOOGLE_CATEGORY = process.env.GOOGLE_PRODUCT_CATEGORY || "Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases";

function safeParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function absoluteImageUrl(req, path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}${path}`;
}

function xmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvEscape(str) {
  const s = String(str ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function loadFeedProducts(req) {
  const [rows] = await pool.query("SELECT * FROM products ORDER BY display_order ASC");
  return rows.map((row) => {
    const images = safeParse(row.images, []);
    return {
      id: row.id,
      title: row.title,
      description: (row.meta_description || row.description || "").slice(0, 5000) || row.title,
      link: `${SITE_URL}/product/${row.id}`,
      imageLink: absoluteImageUrl(req, images[0]),
      additionalImages: images.slice(1, 10).map((img) => absoluteImageUrl(req, img)),
      availability: row.stock_status === "out_of_stock" ? "out of stock" : row.stock_status === "low_stock" ? "in stock" : "in stock",
      price: `${Number(row.price).toFixed(2)} INR`,
      salePrice: row.compare_price && Number(row.compare_price) > Number(row.price) ? `${Number(row.price).toFixed(2)} INR` : null,
      regularPrice: row.compare_price && Number(row.compare_price) > Number(row.price) ? `${Number(row.compare_price).toFixed(2)} INR` : null,
      brand: row.brand || "3DCaseMakers",
      condition: "new",
      googleCategory: DEFAULT_GOOGLE_CATEGORY,
      itemGroupId: row.collection_id || undefined,
      isCustomizable: !!row.is_customizable,
    };
  });
}

// GET /api/merchant-feed.xml — Google Shopping RSS 2.0 feed. Paste this URL
// directly into Google Merchant Center (Products > Feeds > Add feed >
// Scheduled fetch) so it stays in sync automatically as products change.
router.get("/merchant-feed.xml", async (req, res) => {
  try {
    const products = await loadFeedProducts(req);
    const items = products
      .map((p) => {
        const priceNode = p.salePrice
          ? `<g:price>${xmlEscape(p.regularPrice)}</g:price>\n      <g:sale_price>${xmlEscape(p.salePrice)}</g:sale_price>`
          : `<g:price>${xmlEscape(p.price)}</g:price>`;
        return `    <item>
      <g:id>${xmlEscape(p.id)}</g:id>
      <title>${xmlEscape(p.title)}</title>
      <description>${xmlEscape(p.description)}</description>
      <link>${xmlEscape(p.link)}</link>
      <g:image_link>${xmlEscape(p.imageLink)}</g:image_link>
      ${p.additionalImages.map((img) => `<g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${p.availability}</g:availability>
      ${priceNode}
      <g:brand>${xmlEscape(p.brand)}</g:brand>
      <g:condition>${p.condition}</g:condition>
      <g:google_product_category>${xmlEscape(p.googleCategory)}</g:google_product_category>
      <g:shipping>
        <g:country>IN</g:country>
        <g:price>0.00 INR</g:price>
      </g:shipping>
      ${p.itemGroupId ? `<g:item_group_id>${xmlEscape(p.itemGroupId)}</g:item_group_id>` : ""}
      <g:identifier_exists>no</g:identifier_exists>
      ${p.isCustomizable ? "<g:custom_label_0>customizable</g:custom_label_0>" : ""}
    </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>3DCaseMakers Product Feed</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>3DCaseMakers custom, acrylic and gold phone case product feed for Google Merchant Center</description>
${items}
  </channel>
</rss>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate merchant feed" });
  }
});

// GET /api/merchant-feed.csv — same data as a downloadable CSV, for manual
// upload into Merchant Center instead of a scheduled fetch, if preferred.
router.get("/merchant-feed.csv", async (req, res) => {
  try {
    const products = await loadFeedProducts(req);
    const header = ["id", "title", "description", "link", "image_link", "availability", "price", "brand", "condition", "google_product_category", "item_group_id"];
    const rows = products.map((p) =>
      [
        p.id,
        p.title,
        p.description,
        p.link,
        p.imageLink,
        p.availability,
        p.salePrice || p.price,
        p.brand,
        p.condition,
        p.googleCategory,
        p.itemGroupId || "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="3dcasemakers-merchant-feed.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate merchant feed CSV" });
  }
});

module.exports = router;
