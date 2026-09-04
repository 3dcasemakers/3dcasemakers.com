// ══════════════════════════════════════════════════════════════
//  useSEO.ts — 3DCaseMakers SEO utility
//  Sets <title>, meta description/keywords, canonical URL and
//  Open Graph tags per page. Call setSEO(...) inside a useEffect.
// ══════════════════════════════════════════════════════════════

export interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
}

const SITE_NAME = "3DCaseMakers";
const BASE_URL = "https://3dcasemakers.in";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.jpg`;
// Core keyword set the whole site should reinforce — covers the exact phrases
// 3DCaseMakers wants to rank #1 for (custom / acrylic / gold phone cases) plus
// the branded term itself, so every page's <meta keywords> and copy nudge
// Google toward associating "3DCaseMakers" with these searches.
const BASE_KEYWORDS =
  "3dcasemakers, custom phone case, custom phone case India, acrylic phone case, acrylic case, strong acrylic case, glass phone case, premium phone case, gold phone case, gold case, personalised phone case, buy mobile cover India, custom photo phone case, phone case store India, phone case sale, 3dcasemakers.in";

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

/**
 * Injects or replaces a JSON-LD structured-data <script> tag identified by
 * `id`. Call with `data = null` to remove it (e.g. when leaving a page that
 * no longer applies, such as a product no longer in view).
 * Structured data is what lets Google show rich results — price, stock,
 * ratings, breadcrumbs — directly in search, which meaningfully improves
 * click-through rate versus a plain blue link.
 */
export function setJSONLD(id: string, data: object | object[] | null) {
  const scriptId = `ld-json-${id}`;
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!data) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("script");
    el.id = scriptId;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function setSEO({ title, description, keywords, image, url }: SEOProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  document.title = fullTitle;

  setMeta("name", "description", description);
  setMeta("name", "keywords", keywords ? `${keywords}, ${BASE_KEYWORDS}` : BASE_KEYWORDS);

  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", description);
  setMeta("property", "og:image", image || DEFAULT_IMAGE);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:site_name", SITE_NAME);

  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", description);

  const canonicalUrl = url ? `${BASE_URL}${url}` : window.location.href;
  setCanonical(canonicalUrl);
  setMeta("property", "og:url", canonicalUrl);
}

/** Builds an absolute URL for use in JSON-LD (canonical, image links, etc). */
export function absUrl(path: string) {
  if (!path) return BASE_URL;
  return path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
