// Generates public/sitemap.xml before every production build.
//
// Runs as the "prebuild" npm script (see package.json), so it always executes
// automatically as part of `npm run build` — no separate step to remember.
// It pulls live product + collection data from the backend API so every
// product page, collection page, and static page is included with a fresh
// <lastmod>, which is what search engines use to know what's worth
// re-crawling. If the API can't be reached (e.g. building offline), it falls
// back to just the static pages so the build never fails because of this.

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.VITE_SITE_URL || "https://3dcasemakers.in";
const API_URL = process.env.VITE_API_URL || "http://localhost:5000";
const OUT_PATH = join(__dirname, "..", "public", "sitemap.xml");

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/collections", priority: "0.8", changefreq: "daily" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/faqs", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.4", changefreq: "monthly" },
];

async function fetchJSON(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn(`[sitemap] Could not fetch ${path} from ${API_URL} — ${err.message}. Skipping dynamic URLs from this source.`);
    return [];
  }
}

function urlEntry(loc, { priority = "0.6", changefreq = "weekly", lastmod } = {}) {
  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const [products, collections] = await Promise.all([
    fetchJSON("/api/products"),
    fetchJSON("/api/collections"),
  ]);

  const entries = [];

  for (const page of STATIC_PAGES) {
    entries.push(urlEntry(`${SITE_URL}${page.path}`, page));
  }

  for (const c of collections) {
    if (c.isVisible === false) continue;
    entries.push(
      urlEntry(`${SITE_URL}/collections/${c.slug}`, { priority: "0.8", changefreq: "daily" })
    );
  }

  for (const p of products) {
    entries.push(
      urlEntry(`${SITE_URL}/product/${p.id}`, {
        priority: "0.9",
        changefreq: "weekly",
        lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : undefined,
      })
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join(
    "\n"
  )}\n</urlset>\n`;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, xml, "utf-8");
  console.log(
    `[sitemap] Wrote ${entries.length} URLs (${products.length} products, ${collections.length} collections) to public/sitemap.xml`
  );
}

main();
