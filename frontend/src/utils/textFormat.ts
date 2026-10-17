// Converts a full-caps SKU/product name (e.g. "IPHONE 15 PRO MAX CASE")
// into a clean Title Case display string (e.g. "Iphone 15 Pro Max Case").
// Numbers and words already containing mixed case are left as-is.
export function toTitleCase(text: string): string {
  if (!text) return text;
  return text
    .split(" ")
    .map((word) => {
      if (!word) return word;
      // Keep pure numbers / alphanumerics like "5G", "16E" readable:
      // capitalize first letter, lowercase the rest.
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
