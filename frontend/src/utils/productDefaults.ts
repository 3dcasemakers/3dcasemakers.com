import type { Collection, Product } from "../types";

const STORAGE_KEY = "3dcasemakers_product_collections";
type CollectionHistory = { last?: string; materials?: Record<string, string> };

function readHistory(): CollectionHistory {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function rememberProductCollection(collectionId: string, material?: string) {
  if (!collectionId) return;
  try {
    const history = readHistory();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      last: collectionId,
      materials: { ...history.materials, ...(material ? { [material]: collectionId } : {}) },
    }));
  } catch {
    // Creation still works when browser storage is unavailable.
  }
}

export function defaultProductCollection(collections: Collection[], products: Product[], material?: string): string {
  const history = readHistory();
  const valid = (id: unknown): id is string => typeof id === "string" && collections.some((c) => c.id === id);
  const remembered = material ? history.materials?.[material] : history.last;
  if (valid(remembered)) return remembered;

  // Existing products also supply defaults on a new browser/device. Use creation
  // time, since editing or reordering an old product must not change the default.
  const latest = [...products]
    .filter((p) => (!material || p.material === material) && valid(p.collectionId))
    .sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0))[0];
  if (latest) return latest.collectionId;

  const matching = material && collections.find((c) =>
    c.name.toLowerCase().includes(material.toLowerCase()) || material.toLowerCase().includes(c.name.toLowerCase())
  );
  if (matching) return matching.id;
  return valid(history.last) ? history.last : "";
}

export function collectionProductTitle(collections: Collection[], collectionId: string): string {
  return collections.find((c) => c.id === collectionId)?.name || "";
}

export function titleAfterCollectionChange(title: string, previousDefault: string, nextDefault: string): string {
  return !title.trim() || title === previousDefault ? nextDefault : title;
}
