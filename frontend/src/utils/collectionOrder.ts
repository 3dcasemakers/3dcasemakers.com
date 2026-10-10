import type { Collection, Product } from "../types";

/**
 * Manual order of products inside ONE collection.
 *
 * Admin > Collections > Products saves the order per collection (so reordering
 * "Acrylic Cases" never disturbs the same products in other collections).
 * Products that are not in the saved list yet (e.g. newly added ones) come
 * after the ordered ones, sorted by the global displayOrder as before.
 */
export function sortForCollection(products: Product[], collection?: Pick<Collection, "productOrder"> | null): Product[] {
  const rank = new Map<string, number>();
  (collection?.productOrder || []).forEach((id, i) => rank.set(id, i));
  return [...products].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });
}
