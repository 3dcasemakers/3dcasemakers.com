// One auto-managed collection per product Material.
//
// Every product whose material matches `material` is placed in the collection
// with `slug` (created once on boot by migrate.js), and any product sitting in
// a themed sub-collection ("Murugan Acrylic Gel Cases", "Shivan Phone Skins",
// ...) is also listed in the parent. Sub-collections are matched by slug/name
// suffix, so new themes work automatically.
//
// NOTE: suffixes are chosen so one material never swallows another, e.g.
// "% gold cases" does NOT match "... gold gel cases", and "% acrylic cases"
// does NOT match "... acrylic gel cases".
const MATERIAL_COLLECTIONS = [
  {
    key: "acrylic",
    material: "Acrylic Case",
    name: "Acrylic Cases",
    slug: "acrylic-cases",
    description: "Premium crystal-clear acrylic phone cases - every design, one place.",
    slugSuffixes: ["-acrylic-cases"],
    nameSuffixes: [" acrylic cases"],
    // legacy flag names (kept so existing databases do not re-run the seed)
    seededFlag: "acrylicCasesCollectionSeeded",
    backfilledFlag: "acrylicSubCollectionsBackfilled",
  },
  {
    key: "acrylicGel",
    material: "Acrylic Gel Case",
    name: "Acrylic Gel Cases",
    slug: "acrylic-gel-cases",
    description: "Flexible acrylic gel phone cases with a soft grip - every design, one place.",
    slugSuffixes: ["-acrylic-gel-cases"],
    nameSuffixes: [" acrylic gel cases"],
    seededFlag: "acrylicGelCasesCollectionSeeded",
    backfilledFlag: "acrylicGelSubCollectionsBackfilled",
  },
  {
    key: "phoneSkin",
    material: "Phone Skin with Transparent Case",
    name: "Phone Skin + Transparent Cases",
    slug: "phone-skin-transparent-cases",
    description: "Phone skin with a transparent case - every design, one place.",
    slugSuffixes: ["-phone-skins", "-phone-skin-transparent-cases"],
    nameSuffixes: [" phone skins", " phone skin + transparent cases"],
    seededFlag: "phoneSkinCasesCollectionSeeded",
    backfilledFlag: "phoneSkinSubCollectionsBackfilled",
  },
  {
    key: "gold",
    material: "Gold Case",
    name: "Gold Cases",
    slug: "gold-cases",
    description: "Premium gold-finish phone cases - every design, one place.",
    slugSuffixes: ["-gold-cases"],
    nameSuffixes: [" gold cases"],
    seededFlag: "goldCasesCollectionSeeded",
    backfilledFlag: "goldSubCollectionsBackfilled",
  },
  {
    key: "goldGel",
    material: "Gold Gel Case",
    name: "Gold Gel Cases",
    slug: "gold-gel-cases",
    description: "Gold-finish gel phone cases with a soft grip - every design, one place.",
    slugSuffixes: ["-gold-gel-cases"],
    nameSuffixes: [" gold gel cases"],
    seededFlag: "goldGelCasesCollectionSeeded",
    backfilledFlag: "goldGelSubCollectionsBackfilled",
  },
];

// SQL fragment + params matching sub-collections of `cfg` (alias `c`).
function subCollectionCondition(cfg) {
  const parts = [];
  const params = [];
  for (const s of cfg.slugSuffixes) { parts.push("c.slug LIKE ?"); params.push("%" + s); }
  for (const n of cfg.nameSuffixes) { parts.push("LOWER(TRIM(c.name)) LIKE ?"); params.push("%" + n); }
  return { sql: "(" + parts.join(" OR ") + ")", params };
}

module.exports = { MATERIAL_COLLECTIONS, subCollectionCondition };
