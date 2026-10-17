const express = require("express");
const pool = require("../config/db");

const router = express.Router();

// Where the storefront (not this API) is hosted — used to build the product
// page links that go inside the feed. MERCHANT_SITE_URL wins if set. Otherwise
// we take CLIENT_URL (which can hold several comma-separated origins) and skip
// localhost / the old 3dcasemakers.store domain, so a leftover old origin first
// in the list can never put dead "URL not found" links into Google Merchant.
function pickSiteUrl() {
  const explicit = (process.env.MERCHANT_SITE_URL || "").trim();
  const list = (explicit || process.env.CLIENT_URL || "https://3dcasemakers.com")
    .split(",")
    .map((u) => u.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const good = list.filter((u) => /^https?:\/\//i.test(u) && !/localhost|127\.0\.0\.1|3dcasemakers\.store/i.test(u));
  return good.find((u) => /^https:\/\/3dcasemakers\.com$/i.test(u)) || good[0] || "https://3dcasemakers.com";
}
const SITE_URL = pickSiteUrl();

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

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

// Public https base of the API/uploads host. Behind Hostinger/Cloudflare proxies
// req.protocol can come back as "http", which Google rejects for images.
function publicBase(req) {
  const env = (process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = req.get("x-forwarded-host") || req.get("host");
  return `https://${host}`;
}

// Absolute, URL-safe image link. Encodes spaces/unicode in file names (an
// un-encoded space is a classic cause of "image not found" in Merchant Center).
function absoluteImageUrl(req, path) {
  if (!path || typeof path !== "string") return "";
  let p = path.trim();
  if (!p) return "";
  if (!/^https?:\/\//i.test(p)) {
    if (p.startsWith("data:")) return "";
    if (!p.startsWith("/")) p = `/${p}`;
    p = `${publicBase(req)}${p}`;
  }
  try {
    return new URL(p).toString();
  } catch {
    return encodeURI(p);
  }
}

// Strip characters XML 1.0 forbids (control chars etc). A single stray one in
// any product title/description makes Google reject the WHOLE feed, which is
// exactly how "new products stopped updating" happens.
function xmlSafe(str) {
  return String(str ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
}

function xmlEscape(str) {
  return xmlSafe(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvEscape(str) {
  const s = xmlSafe(str);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function plainText(str) {
  return xmlSafe(str).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function loadFeedProducts(req, { includeSkipped = false } = {}) {
  const [rows] = await pool.query("SELECT * FROM products ORDER BY display_order ASC, created_at DESC");
  const ok = [];
  const skipped = [];
  for (const row of rows) {
    const images = safeParse(row.images, []).filter((img) => typeof img === "string" && img.trim() && !VIDEO_RE.test(img));
    const price = Number(row.price);
    const compare = Number(row.compare_price);
    const issues = [];
    if (!images.length) issues.push("no usable image (missing or video only)");
    if (!Number.isFinite(price) || price <= 0) issues.push("price is 0");
    const title = plainText(row.title).slice(0, 150);
    if (!title) issues.push("no title");
    const onSale = Number.isFinite(compare) && compare > price;
    const item = {
      id: row.id,
      title,
      description: plainText(row.meta_description || row.description || "").slice(0, 5000) || title,
      link: `${SITE_URL}/product/${encodeURIComponent(row.id)}`,
      imageLink: absoluteImageUrl(req, images[0]),
      additionalImages: images.slice(1, 10).map((img) => absoluteImageUrl(req, img)).filter(Boolean),
      availability: row.stock_status === "out_of_stock" ? "out of stock" : "in stock",
      price: `${price.toFixed(2)} INR`,
      salePrice: onSale ? `${price.toFixed(2)} INR` : null,
      regularPrice: onSale ? `${compare.toFixed(2)} INR` : null,
      brand: plainText(row.brand) || "3DCaseMakers",
      condition: "new",
      googleCategory: DEFAULT_GOOGLE_CATEGORY,
      isCustomizable: !!row.is_customizable,
    };
    if (issues.length) skipped.push({ id: row.id, title: row.title, link: item.link, issues });
    else ok.push(item);
  }
  return includeSkipped ? { products: ok, skipped } : ok;
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
    res.set("Cache-Control", "no-store, max-age=0");
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
    const header = ["id", "title", "description", "link", "image_link", "availability", "price", "brand", "condition", "google_product_category"];
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
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Content-Disposition", 'attachment; filename="3dcasemakers-merchant-feed.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate merchant feed CSV" });
  }
});

// GET /api/merchant-feed/report — quick health check: which products make it
// into the feed, and which are skipped (and why). Open it in the browser after
// adding products. Only exposes data that is already public on the storefront.
router.get("/merchant-feed/report", async (req, res) => {
  try {
    const { products, skipped } = await loadFeedProducts(req, { includeSkipped: true });
    res.set("Cache-Control", "no-store");
    res.json({
      siteUrl: SITE_URL,
      imageBase: publicBase(req),
      inFeed: products.length,
      skippedCount: skipped.length,
      skipped,
      sampleLinks: products.slice(0, 5).map((p) => ({ title: p.title, link: p.link, image: p.imageLink })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build merchant feed report" });
  }
});

module.exports = router;
