// Remembers which page / sort / scroll position the shopper was on in a
// collection, so pressing Back from a product returns to the same spot
// instead of restarting the collection at page 1, top of page.
const KEY = "3dcm:collection-view";

export type CollectionView = { slug: string; page: number; sort: string; scrollY: number };

export function readCollectionView(slug: string | undefined): CollectionView | null {
  if (!slug) return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (v && v.slug === slug && Number.isFinite(v.page)) return v as CollectionView;
  } catch { /* storage unavailable */ }
  return null;
}

export function writeCollectionView(slug: string | undefined, patch: Partial<CollectionView>) {
  if (!slug) return;
  try {
    const prev = readCollectionView(slug) || { slug, page: 1, sort: "featured", scrollY: 0 };
    sessionStorage.setItem(KEY, JSON.stringify({ ...prev, ...patch, slug }));
  } catch { /* storage unavailable */ }
}
