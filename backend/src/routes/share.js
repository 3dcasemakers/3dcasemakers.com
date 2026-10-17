// ══════════════════════════════════════════════════════════════
//  share.js — Link-preview (WhatsApp / social) pre-render routes
//
//  WHY THIS EXISTS:
//  3DCaseMakers's frontend is a client-rendered React SPA. Social apps
//  (WhatsApp, Facebook, Instagram, Telegram, X, etc.) do NOT run JS
//  when they fetch a link to build a preview card — they only read
//  the raw HTML on first response. So a product/collection page's
//  <meta og:image> (set later via useSEO.ts in a useEffect) is
//  invisible to them; they'd only ever see the generic homepage
//  banner from index.html.
//
//  FIX: the frontend's .htaccess detects known crawler user-agents
//  and redirects THEM ONLY to these routes, which fetch the real
//  product/collection/banner straight from the DB and return a tiny
//  static HTML document with the correct og:title/og:image/og:url.
//  Real visitors (non-bots) never hit this — they keep getting the
//  normal React app.
// ══════════════════════════════════════════════════════════════

const express = require("express");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const { uploadDir } = require("../config/uploads");

// sharp is optional (same approach as routes/thumb.js). Without it, preview
// images are served as the original upload and everything still works.
let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const router = express.Router();

const SITE_NAME = "3DCaseMakers";
const FRONTEND_URL = (process.env.CLIENT_URL || "https://3dcasemakers.com").split(",")[0].trim();
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || "https://api.3dcasemakers.com";
const DEFAULT_IMAGE = `${FRONTEND_URL}/og-image.jpg`;
const DEFAULT_DESCRIPTION =
  "3DCaseMakers.in — buy custom phone cases and stickers online in India. Trendy designs, quality prints, pan-India delivery.";

function esc(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

// Share-preview sizes. WhatsApp/Facebook show a big card for 1200x630 and
// silently drop images that are too heavy (roughly > 300-600 KB), so every
// uploaded image is converted to a light JPEG of exactly these sizes.
const OG_SIZES = {
  wide: { w: 1200, h: 630 },   // banners, collections, home
  square: { w: 800, h: 800 },  // product photos
};
const OG_CACHE_DIR = path.join(uploadDir, ".og-cache");

// Turns a stored image path into an absolute URL that crawlers can fetch.
//  - "/uploads/<file>"  -> our /share/img/<mode>/<file>.jpg (light JPEG)
//  - "https://..."      -> used as-is
//  - empty / video      -> DEFAULT_IMAGE
function resolveImage(imagePath, mode = "wide") {
  if (!imagePath || typeof imagePath !== "string") return DEFAULT_IMAGE;
  const clean = imagePath.trim();
  if (!clean || VIDEO_RE.test(clean)) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(clean)) return clean;
  const rel = clean.startsWith("/") ? clean : `/${clean}`;
  const m = rel.match(/^\/uploads\/([^/?#]+)/);
  if (m) return `${BACKEND_URL}/share/img/${mode}/${encodeURIComponent(m[1])}.jpg`;
  return `${BACKEND_URL}${rel}`;
}

// First usable (non-video) image from a list / JSON string.
function firstImage(list) {
  let arr = list;
  if (typeof arr === "string") {
    try { arr = JSON.parse(arr || "[]"); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return "";
  return arr.find((i) => typeof i === "string" && i.trim() && !VIDEO_RE.test(i)) || "";
}

function pickFirst(...vals) {
  return vals.find((v) => typeof v === "string" && v.trim() && !VIDEO_RE.test(v)) || "";
}

// Renders the minimal OG-tagged HTML. `redirectTo` is the real SPA URL —
// a meta-refresh + JS fallback sends any non-bot (a human who taps the
// link preview itself) straight into the real app.
function renderShareHTML({ title, description, image, redirectTo, imageWidth, imageHeight }) {
  const safeTitle = esc(title);
  const safeDesc = esc(description);
  const safeImage = esc(image);
  const safeUrl = esc(redirectTo);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />
<link rel="canonical" href="${safeUrl}" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:image" content="${safeImage}" />
<meta property="og:image:secure_url" content="${safeImage}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="${imageWidth || 1200}" />
<meta property="og:image:height" content="${imageHeight || 630}" />
<meta property="og:image:alt" content="${safeTitle}" />
<meta property="og:locale" content="en_IN" />
<meta property="og:url" content="${safeUrl}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImage}" />

<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body>
<p>Redirecting to <a href="${safeUrl}">${safeUrl}</a>&hellip;</p>
</body>
</html>`;
}

// Renders a full, self-contained content page for SEO/audit crawlers that
// don't execute JS (Ahrefs, Semrush, SEOptimer, Screaming Frog, etc). Unlike
// renderShareHTML this does NOT redirect — non-JS bots would just follow a
// meta-refresh straight back to the empty SPA shell and see nothing, which
// is exactly the "no H1 / poor headings / few internal links" problem this
// exists to fix. Real human visitors (JS on) never see this route at all.
function esc2(str = "") { return esc(str); }

function renderCrawlHTML({ collections }) {
  const collectionLinks = (collections || [])
    .map((c) => `<li><a href="${FRONTEND_URL}/collections/${esc2(c.slug)}">${esc2(c.name)}</a></li>`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>3DCaseMakers | Custom, Acrylic &amp; Gold Phone Cases India</title>
<meta name="description" content="Buy strong acrylic &amp; glass phone cases at 3DCaseMakers, India's custom case store. Premium photo cases, gold finishes, on sale with pan-India delivery." />
<link rel="canonical" href="${FRONTEND_URL}/" />
<meta name="robots" content="index, follow" />
</head>
<body>
  <header>
    <a href="${FRONTEND_URL}/" aria-label="3DCaseMakers home">3DCaseMakers</a>
  </header>

  <main>
    <h1>3DCaseMakers — Custom Phone Cases, Acrylic Cases &amp; Gold Cases India</h1>
    <p>
      3DCaseMakers.in is India's home for strong, premium acrylic phone cases, glass phone
      cases and gold-finish phone cases. We print custom, personalised photo cases,
      nameplates and home decor on durable materials and deliver pan-India, with cases
      regularly on sale.
    </p>

    <h2>Shop By Collection</h2>
    <ul>
      ${collectionLinks || `<li><a href="${FRONTEND_URL}/collections">All Collections</a></li>`}
    </ul>

    <h2>Why Buy From 3DCaseMakers</h2>
    <p>
      Every case is made to order with durable, scratch-resistant materials and shipped
      pan-India with tracked delivery. Free shipping, secure cashless payment and
      dedicated customer support on every order.
    </p>

    <h2>Explore 3DCaseMakers</h2>
    <ul>
      <li><a href="${FRONTEND_URL}/collections">All Collections</a></li>
      <li><a href="${FRONTEND_URL}/reviews">Customer Reviews</a></li>
      <li><a href="${FRONTEND_URL}/about-us">About Us</a></li>
      <li><a href="${FRONTEND_URL}/contact">Contact Us</a></li>
      <li><a href="${FRONTEND_URL}/faqs">FAQs</a></li>
      <li><a href="${FRONTEND_URL}/track-order">Track Order</a></li>
      <li><a href="${FRONTEND_URL}/policy/shipping">Shipping Policy</a></li>
      <li><a href="${FRONTEND_URL}/policy/terms">Terms &amp; Conditions</a></li>
      <li><a href="${FRONTEND_URL}/policy/privacy">Privacy Policy</a></li>
      <li><a href="${FRONTEND_URL}/policy/returns">Cancellations &amp; Refunds</a></li>
    </ul>
  </main>
</body>
</html>`;
}

// GET /share/crawl-home — full, final content page for non-JS SEO audit
// bots (Ahrefs, Semrush, SEOptimer, Screaming Frog, etc). No redirect, so
// the crawler sees real H1/H2s and internal links right here instead of
// bouncing back into the empty SPA shell.
router.get("/crawl-home", async (req, res) => {
  try {
    const [collections] = await pool.query(
      "SELECT name, slug FROM collections WHERE is_visible = 1 ORDER BY display_order ASC LIMIT 12"
    );
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(renderCrawlHTML({ collections }));
  } catch (err) {
    console.error(err);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(renderCrawlHTML({ collections: [] }));
  }
});

function sendShare(res, payload) {
  res.set("Content-Type", "text/html; charset=utf-8");
  // Short cache so edits to a banner/product show up quickly, but repeated
  // crawler hits don't hammer the database.
  res.set("Cache-Control", "public, max-age=300");
  res.send(renderShareHTML(payload));
}

// GET /share/img/:mode/:file.jpg — light, correctly-sized JPEG for link previews.
// Reads from the uploads folder (never modifies originals) and caches the
// converted copy in uploads/.og-cache. Falls back to the original file when
// sharp is not available or conversion fails, so previews never break.
router.get("/img/:mode/:file", async (req, res) => {
  try {
    const mode = OG_SIZES[req.params.mode] ? req.params.mode : "wide";
    const requested = req.params.file;
    const file = requested.replace(/\.jpg$/i, "");
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\") || file.startsWith(".")) {
      return res.redirect(302, DEFAULT_IMAGE);
    }
    const srcPath = path.join(uploadDir, file);
    if (!fs.existsSync(srcPath) || VIDEO_RE.test(file)) {
      return res.redirect(302, DEFAULT_IMAGE);
    }

    if (!sharp) {
      return res.redirect(302, `${BACKEND_URL}/uploads/${encodeURIComponent(file)}`);
    }

    const { w, h } = OG_SIZES[mode];
    fs.mkdirSync(OG_CACHE_DIR, { recursive: true });
    const cachePath = path.join(OG_CACHE_DIR, `${path.parse(file).name}-${mode}.jpg`);
    const stale = !fs.existsSync(cachePath) || fs.statSync(cachePath).mtimeMs < fs.statSync(srcPath).mtimeMs;

    if (stale) {
      const build = (quality) => {
        let img = sharp(srcPath).rotate().flatten({ background: "#ffffff" });
        img =
          mode === "square"
            ? img.resize(w, h, { fit: "contain", background: "#ffffff" })
            : img.resize(w, h, { fit: "cover", position: "attention" });
        return img.jpeg({ quality, mozjpeg: true }).toBuffer();
      };
      let buf = await build(82);
      // Keep under ~300 KB so WhatsApp always shows the image.
      if (buf.length > 300 * 1024) buf = await build(66);
      if (buf.length > 300 * 1024) buf = await build(50);
      fs.writeFileSync(cachePath, buf);
    }

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    return fs.createReadStream(cachePath).pipe(res);
  } catch (err) {
    console.warn("[share] og image generation failed, using original:", err.message);
    return res.redirect(302, `${BACKEND_URL}/uploads/${encodeURIComponent(req.params.file.replace(/\.jpg$/i, ""))}`);
  }
});

// GET /share/home — preview shows the first active homepage banner.
router.get("/home", async (req, res) => {
  try {
    const [banners] = await pool.query(
      "SELECT * FROM banners WHERE active = 1 ORDER BY display_order ASC"
    );
    // First active IMAGE banner (video banners can't be used as a preview).
    const banner =
      banners.find((b) => (b.media_type || "image") !== "video" && pickFirst(b.image_url, b.mobile_image_url)) ||
      banners.find((b) => pickFirst(b.image_url, b.mobile_image_url));
    const image = banner ? resolveImage(pickFirst(banner.image_url, banner.mobile_image_url), "wide") : DEFAULT_IMAGE;
    sendShare(res, {
      title: `${SITE_NAME} – Custom Phone Cases & Stickers India`,
      description: DEFAULT_DESCRIPTION,
      image,
      redirectTo: `${FRONTEND_URL}/`,
    });
  } catch (err) {
    console.error(err);
    sendShare(res, {
      title: `${SITE_NAME} – Custom Phone Cases & Stickers India`,
      description: DEFAULT_DESCRIPTION,
      image: DEFAULT_IMAGE,
      redirectTo: `${FRONTEND_URL}/`,
    });
  }
});

// GET /share/product/:id — preview shows that product's first photo.
router.get("/product/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
    const p = rows[0];
    if (!p) {
      return res.redirect(302, `${FRONTEND_URL}/product/${encodeURIComponent(req.params.id)}`);
    }
    const priceLine = p.price ? ` Starting at ₹${p.price}.` : "";
    const description =
      p.meta_description ||
      (p.description || "").replace(/\s+/g, " ").trim().slice(0, 160) ||
      `Buy ${p.title} at 3DCaseMakers — custom phone case, durable print, secure online payments across India.${priceLine}`;
    sendShare(res, {
      title: `${p.meta_title || p.title} | ${SITE_NAME}`,
      description,
      image: resolveImage(firstImage(p.images), "square"),
      imageWidth: 800,
      imageHeight: 800,
      redirectTo: `${FRONTEND_URL}/product/${encodeURIComponent(p.id)}`,
    });
  } catch (err) {
    console.error(err);
    res.redirect(302, `${FRONTEND_URL}/product/${encodeURIComponent(req.params.id)}`);
  }
});

// GET /share/collections/:slug — preview shows the collection image / banner.
router.get("/collections/:slug", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM collections WHERE slug = ?", [req.params.slug]);
    const c = rows[0];
    if (!c) {
      return res.redirect(302, `${FRONTEND_URL}/collections/${encodeURIComponent(req.params.slug)}`);
    }
    const description =
      c.meta_description ||
      c.description ||
      `Shop the ${c.name} collection at 3DCaseMakers — custom phone cases & stickers, pan-India delivery.`;
    const img = pickFirst(c.banner_desktop, c.image, c.banner_mobile);
    sendShare(res, {
      title: `${c.meta_title || c.name} | ${SITE_NAME}`,
      description,
      image: resolveImage(img, "wide"),
      redirectTo: `${FRONTEND_URL}/collections/${encodeURIComponent(c.slug)}`,
    });
  } catch (err) {
    console.error(err);
    res.redirect(302, `${FRONTEND_URL}/collections/${encodeURIComponent(req.params.slug)}`);
  }
});

module.exports = router;
