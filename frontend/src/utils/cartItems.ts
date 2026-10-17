import type { CartItem } from "../types";

// Different photos, text or variants of the same model are separate cart lines.
export function cartItemKey(item: CartItem): string {
  return JSON.stringify([
    item.product.id, item.selectedModel, item.customVariant || "",
    item.customImage || "", item.customName || "",
    item.customImage2 || "", item.customName2 || "",
    item.customImage3 || "", item.customName3 || "",
    item.gelPlateText || "", item.gelPlateStyle || "",
  ]);
}

export function restoreCart(raw: string | null): CartItem[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const optionalText = ["customImage", "customName", "customImage2", "customName2", "customImage3", "customName3", "customVariant", "gelPlateText"];
    return parsed.filter((item) =>
      item && typeof item.product?.id === "string" &&
      typeof item.product.title === "string" &&
      Number.isFinite(item.product.price) && item.product.price >= 0 &&
      typeof item.selectedModel === "string" &&
      Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 50 &&
      optionalText.every((key) => item[key] == null || typeof item[key] === "string") &&
      (item.gelPlateStyle == null || item.gelPlateStyle === "image" || item.gelPlateStyle === "plate")
    ).slice(0, 50).map((item) => ({
      ...item,
      product: {
        ...item.product,
        images: Array.isArray(item.product.images) ? item.product.images.filter((v: unknown) => typeof v === "string") : [],
        models: Array.isArray(item.product.models) ? item.product.models.filter((v: unknown) => typeof v === "string") : [],
        comparePrice: Number.isFinite(item.product.comparePrice) ? item.product.comparePrice : item.product.price,
      },
    }));
  } catch {
    return [];
  }
}

export function setCartItemQuantity(items: CartItem[], target: CartItem, quantity: number): CartItem[] {
  if (!Number.isInteger(quantity) || quantity > 50) return items;
  const key = cartItemKey(target);
  if (quantity <= 0) return items.filter((item) => cartItemKey(item) !== key);
  return items.map((item) => cartItemKey(item) === key ? { ...item, quantity } : item);
}
