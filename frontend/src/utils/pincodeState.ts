/**
 * Indian PIN code -> state / union territory, using the India Post numbering
 * scheme (first 2-3 digits identify the postal circle / state). Returned names
 * match the checkout state dropdown exactly. Returns "" when it can't tell.
 */
const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

export function stateFromPincode(pincode: string): string {
  const code = String(pincode || "").trim();
  if (!/^\d{6}$/.test(code)) return "";
  const n6 = Number(code);
  const p3 = Number(code.slice(0, 3));
  const p2 = Number(code.slice(0, 2));

  // Exact 6-digit exceptions first (small enclaves inside other states' ranges)
  if (inRange(n6, 682551, 682559)) return "Lakshadweep";
  if (inRange(n6, 605001, 605014) || inRange(n6, 605101, 605111) || inRange(n6, 607401, 607403) || inRange(n6, 609601, 609609)) return "Puducherry";
  if (n6 === 673310 || n6 === 533464) return "Puducherry"; // Mahe, Yanam
  if (inRange(n6, 396210, 396240) || n6 === 362520) return "Dadra and Nagar Haveli and Daman and Diu";

  // 3-digit prefixes
  if (p3 === 160) return "Chandigarh";
  if (p3 === 194) return "Ladakh";
  if (p3 === 403) return "Goa";
  if (p3 === 737) return "Sikkim";
  if (p3 === 744) return "Andaman and Nicobar Islands";
  if ([246, 248, 249, 262, 263].includes(p3)) return "Uttarakhand";
  if (inRange(p3, 790, 792)) return "Arunachal Pradesh";
  if (inRange(p3, 793, 794)) return "Meghalaya";
  if (p3 === 795) return "Manipur";
  if (p3 === 796) return "Mizoram";
  if (inRange(p3, 797, 798)) return "Nagaland";
  if (p3 === 799) return "Tripura";
  if (inRange(p3, 500, 509)) return "Telangana";
  if (inRange(p3, 510, 535)) return "Andhra Pradesh";
  if ([814, 815, 816, 825, 826, 827, 828, 829].includes(p3) || inRange(p3, 831, 835)) return "Jharkhand";

  // 2-digit prefixes
  if (p2 === 11) return "Delhi";
  if (inRange(p2, 12, 13)) return "Haryana";
  if (inRange(p2, 14, 16)) return "Punjab";
  if (p2 === 17) return "Himachal Pradesh";
  if (inRange(p2, 18, 19)) return "Jammu and Kashmir";
  if (inRange(p2, 20, 28)) return "Uttar Pradesh";
  if (inRange(p2, 30, 34)) return "Rajasthan";
  if (inRange(p2, 36, 39)) return "Gujarat";
  if (inRange(p2, 40, 44)) return "Maharashtra";
  if (inRange(p2, 45, 48)) return "Madhya Pradesh";
  if (p2 === 49) return "Chhattisgarh";
  if (inRange(p2, 56, 59)) return "Karnataka";
  if (inRange(p2, 60, 64)) return "Tamil Nadu";
  if (inRange(p2, 67, 69)) return "Kerala";
  if (inRange(p2, 70, 74)) return "West Bengal";
  if (inRange(p2, 75, 77)) return "Odisha";
  if (p2 === 78) return "Assam";
  if (inRange(p2, 80, 85)) return "Bihar";
  return "";
}
