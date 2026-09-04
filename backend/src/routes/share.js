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
const pool = require("../config/db");

const router = express.Router();

const SITE_NAME = "3DCaseMakers";
const FRONTEND_URL = (process.env.CLIENT_URL || "https://3dcasemakers.in").split(",")[0].trim();
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || "https://api.3dcasemakers.in";
const DEFAULT_IMAGE = `${FRONTEND_URL}/og-image.jpg`;
const DEFAULT_DESCRIPTION =
  "3DCaseMakers.in — buy custom phone cases and stickers online in India. Trendy designs, quality prints, pan-India delivery.";

function esc(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function resolveImage(imagePath) {
  if (!imagePath) return DEFAULT_IMAGE;
  return imagePath.startsWith("http") ? imagePath : `${BACKEND_URL}${imagePath}`;
}

// Renders the minimal OG-tagged HTML. `redirectTo` is the real SPA URL —
// a meta-refresh + JS fallback sends any non-bot (a human who taps the
// link preview itself) straight into the real app.
function renderShareHTML({ title, description, image, redirectTo }) {
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
<meta property="og:url" content="${safeUrl}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImage}" />

<meta http-equiv="refresh" content="0; url=${safeUrl}" />
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

// GET /share/home
router.get("/home", async (req, res) => {
  try {
    const [banners] = await pool.query(
      "SELECT * FROM banners WHERE active = 1 ORDER BY display_order ASC LIMIT 1"
    );
    const banner = banners[0];
    const image = banner ? resolveImage(banner.image_url) : DEFAULT_IMAGE;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderShareHTML({
        title: `${SITE_NAME} – Custom Phone Cases & Stickers India`,
        description: DEFAULT_DESCRIPTION,
        image,
        redirectTo: `${FRONTEND_URL}/`,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

// GET /share/product/:id
router.get("/product/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
    const p = rows[0];
    if (!p) {
      return res.redirect(302, `${FRONTEND_URL}/product/${encodeURIComponent(req.params.id)}`);
    }
    let images = [];
    try { images = JSON.parse(p.images || "[]"); } catch { images = []; }
    const description =
      p.meta_description ||
      (p.description || "").slice(0, 160) ||
      `Buy ${p.title} at 3DCaseMakers — custom phone case, durable print, secure online payments across India.`;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderShareHTML({
        title: `${p.meta_title || p.title} | ${SITE_NAME}`,
        description,
        image: resolveImage(images[0]),
        redirectTo: `${FRONTEND_URL}/product/${p.id}`,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

// GET /share/collections/:slug
router.get("/collections/:slug", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM collections WHERE slug = ?", [req.params.slug]);
    const c = rows[0];
    if (!c) {
      return res.redirect(302, `${FRONTEND_URL}/collections/${encodeURIComponent(req.params.slug)}`);
    }
    const description =
      c.description || `Shop the ${c.name} collection at 3DCaseMakers — custom phone cases & stickers, pan-India delivery.`;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderShareHTML({
        title: `${c.name} | ${SITE_NAME}`,
        description,
        image: resolveImage(c.image),
        redirectTo: `${FRONTEND_URL}/collections/${c.slug}`,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

module.exports = router;
