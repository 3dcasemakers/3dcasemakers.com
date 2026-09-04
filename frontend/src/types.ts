export type Material =
  | "Gold Case"
  | "Gold Gel Case"
  | "Acrylic Case"
  | "Acrylic Gel Case"
  | "Phone Skin with Transparent Case";

// Fixed pricing per material — offer price is what customers pay, actual price is the
// struck-through "compare at" price. All materials ship free.
export const MATERIAL_PRICING: Record<Material, { price: number; comparePrice: number }> = {
  "Gold Case": { price: 499, comparePrice: 999 },
  "Gold Gel Case": { price: 599, comparePrice: 999 },
  "Acrylic Case": { price: 499, comparePrice: 999 },
  "Acrylic Gel Case": { price: 599, comparePrice: 999 },
  "Phone Skin with Transparent Case": { price: 399, comparePrice: 799 },
};

export const MATERIAL_OPTIONS: Material[] = [
  "Gold Case",
  "Gold Gel Case",
  "Acrylic Case",
  "Acrylic Gel Case",
  "Phone Skin with Transparent Case",
];

// A "Material Set" groups the materials that belong to one product concept —
// e.g. a Gold case always comes in a plain finish AND a gel finish. When the
// admin adds a new product from one of these sets, one product is created
// per material in the set (same title/description/collection/etc, but its
// own 2 images), instead of adding one material at a time.
export interface MaterialSetDef {
  id: string;
  label: string;
  description: string;
  materials: Material[];
}
export const MATERIAL_SETS: MaterialSetDef[] = [
  {
    id: "gold-set",
    label: "Gold Case Set",
    description: "Gold Case + Gold Gel Case",
    materials: ["Gold Case", "Gold Gel Case"],
  },
  {
    id: "acrylic-set",
    label: "Acrylic Case Set",
    description: "Acrylic Case + Acrylic Gel Case + Phone Skin with Transparent Case",
    materials: ["Acrylic Case", "Acrylic Gel Case", "Phone Skin with Transparent Case"],
  },
];

// "Gel Cases" material products let the customer type a word/name to be
// personalized, then choose whether it's printed directly on the case image
// (free) or added as a raised/engraved physical text plate (+₹99).
export const GEL_TEXT_PLATE_SURCHARGE = 99;
export type GelTextStyle = "image" | "plate";

export interface Product {
  id: string;
  title: string;
  price: number;
  comparePrice: number;
  discount: number;
  description: string;
  collectionId: string;
  collectionIds: string[];
  tags: string[];
  // Case material — driving the fixed price/comparePrice per MATERIAL_PRICING.
  material?: Material;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
  isFeatured: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  images: string[];
  models: string[];
  // Admin-assigned "Variant Options" dropdown group id (see store_settings.variantGroups).
  // Empty/undefined = product has no extra variant dropdown.
  variantGroupId?: string;
  // Links sibling products created together from the same Material Set (see
  // MATERIAL_SETS above) — e.g. the Acrylic Case, Acrylic Gel Case and Phone
  // Skin products for the same design all share one materialSetId, so the
  // storefront product page can offer a "switch material" selector between
  // them. Unrelated to variantGroupId (that's for the price-adding options
  // dropdown, this is for switching to a sibling PRODUCT).
  materialSetId?: string;
  brand?: string;
  rating?: number;
  reviewsCount?: number;
  displayOrder?: number;
  trendingOrder?: number;
  bestSellerOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  metaTitle?: string;
  metaDescription?: string;
  // Custom / photo-case products ask the customer to upload their own image to print.
  // LEGACY fields — still read as a fallback for products saved before the
  // generalized `customization` field below existed (see
  // getCustomizationSets()). New products are edited via `customization`.
  isCustomizable?: boolean;
  // Ask the customer to type a name to be printed on the product.
  requiresCustomerName?: boolean;
  // Generalized "ask the customer for N photos / N text boxes" config —
  // replaces the old single isCustomizable/requiresCustomerName pair.
  // Up to 3 sets; each set can ask for an image, a text box, or both, and
  // each of those independently required or optional at checkout.
  customization?: { sets: CustomizationSet[] };
}

export interface CustomizationSet {
  image: boolean;
  text: boolean;
  // Only meaningful when `image`/`text` above is true.
  imageRequired: boolean;
  textRequired: boolean;
}

// Preset combos shown in the admin product form. Picking one seeds
// Product.customization.sets with sensible defaults (image required, text
// optional — matching the old behaviour) which the admin can then flip
// per-box via the Required/Optional selector next to each row.
export interface CustomizationPreset {
  id: string;
  label: string;
  sets: CustomizationSet[];
}
export const CUSTOMIZATION_PRESETS: CustomizationPreset[] = [
  { id: "none", label: "None", sets: [] },
  { id: "1img1text", label: "Require 1 Image + 1 Text Box", sets: [
    { image: true, text: true, imageRequired: true, textRequired: false },
  ]},
  { id: "2img2text", label: "Require 2 Image + 2 Text Box (2 sets)", sets: [
    { image: true, text: true, imageRequired: true, textRequired: false },
    { image: true, text: true, imageRequired: true, textRequired: false },
  ]},
  { id: "3img3text", label: "Require 3 Image + 3 Text Box (3 sets)", sets: [
    { image: true, text: true, imageRequired: true, textRequired: false },
    { image: true, text: true, imageRequired: true, textRequired: false },
    { image: true, text: true, imageRequired: true, textRequired: false },
  ]},
  { id: "1text", label: "Requires 1 Text Box Only", sets: [
    { image: false, text: true, imageRequired: false, textRequired: false },
  ]},
  { id: "2text", label: "Requires 2 Text Box Only", sets: [
    { image: false, text: true, imageRequired: false, textRequired: false },
    { image: false, text: true, imageRequired: false, textRequired: false },
  ]},
  { id: "1img", label: "Requires 1 Image Only", sets: [
    { image: true, text: false, imageRequired: true, textRequired: false },
  ]},
  { id: "2img", label: "Requires 2 Image Only", sets: [
    { image: true, text: false, imageRequired: true, textRequired: false },
    { image: true, text: false, imageRequired: true, textRequired: false },
  ]},
];

// Resolves the customization sets to actually render/validate for a product —
// prefers the new `customization.sets`, and falls back to the legacy
// isCustomizable/requiresCustomerName pair (as ONE set) for older products
// saved before this feature existed, so nothing already live breaks.
export function getCustomizationSets(product: Pick<Product, "customization" | "isCustomizable" | "requiresCustomerName">): CustomizationSet[] {
  if (product.customization?.sets?.length) return product.customization.sets;
  const image = !!product.isCustomizable;
  const text = !!product.requiresCustomerName;
  if (!image && !text) return [];
  return [{ image, text, imageRequired: true, textRequired: false }];
}

export interface SubCollection {
  id: string;
  name: string;
  image?: string;
  displayOrder?: number;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  image: string;
  bannerMobile?: string;
  bannerDesktop?: string;
  // Collection page banner can be a looping video instead of a static image,
  // same as the home page Hero banner. Defaults to "image" when unset.
  bannerMediaType?: "image" | "video";
  bannerVideoUrl?: string;
  description: string;
  isVisible: boolean;
  displayOrder?: number;
  subcollections?: SubCollection[];
  metaTitle?: string;
  metaDescription?: string;
  // Special/Designed Cases collections get a highlighted border on the home page grid.
  isHighlighted?: boolean;
  // Collection-wide "Variant Options" dropdown — applies to every product inside this
  // collection unless a product has its own override set (see Product.variantGroupId).
  variantGroupId?: string;
}

// Public "Write a Review" submission on the storefront's /reviews page.
// Lands as isApproved=false until an admin approves it in the admin panel.
export interface SiteReview {
  id: string;
  name: string;
  rating: number;
  comment: string;
  image?: string;
  isApproved: boolean;
  createdAt: string;
}

// Per-product review submitted via the "Write a Review" form on a product page.
// Lands as is_approved=0 until an admin approves it in the admin panel.
export interface ProductReview {
  id: string;
  product_id: string;
  product_title?: string;
  name: string;
  rating: number;
  comment: string;
  image?: string;
  is_approved: number | boolean;
  created_at: string;
}

// Admin-posted "story" (Instagram Highlights style) shown as circular
// bubbles at the top of the public /reviews page.
export interface ReviewStory {
  id: string;
  image: string;
  video?: string | null;
  media_type?: "image" | "video";
  name: string;
  caption?: string;
  display_order: number;
  is_active: number | boolean;
  created_at: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  mediaType?: "image" | "video";
  videoUrl?: string;
  link: string;
  active: boolean;
  order: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedModel: string;
  // Uploaded reference photo for customized/photo-case products (server path, e.g. /uploads/xyz.jpg)
  customImage?: string;
  // Name typed by the customer to be printed on the product.
  customName?: string;
  // Selected value from the product's admin-assigned "Variant Options" dropdown
  // (e.g. "Charger Type: Type-C"), plus free text if they picked "Create your own text".
  customVariant?: string;
  // "Magic Cases" material products take a SECOND mandatory photo + an
  // optional second text box (e.g. two people/photos printed on one case).
  customImage2?: string;
  customName2?: string;
  // Third customization set (see Product.customization — up to 3 sets).
  customImage3?: string;
  customName3?: string;
  // "Gel Cases" material products: the word/name typed by the customer, plus
  // which style they picked — printed on the case image (free) or a physical
  // raised/engraved text plate (+₹99, folded into product.price on this item).
  gelPlateText?: string;
  gelPlateStyle?: GelTextStyle;
}

export interface VariantOption {
  id: string;
  label: string;
  // When true, selecting this option reveals a free-text box under the dropdown.
  isCustomText?: boolean;
}

export interface VariantGroup {
  id: string;
  name: string;
  options: VariantOption[];
  // Defaults to true (backward-compatible with groups saved before this setting
  // existed) - when false, customers can submit without picking an option.
  required?: boolean;
}

export interface Order {
  id: string;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  customerAltPhone?: string;
  shippingAddress: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: "cod";
  paymentStatus?: "pending" | "paid" | "failed" | "refunded";
  status: string;
  trackingId?: string;
  previewRequested?: boolean;
  previewRequestedAt?: string | null;
  // "manual" = created by an admin via the Orders tab's "Create Order"
  // button rather than placed by a customer on the storefront.
  source?: "website" | "manual";
  createdAt: string;
}

export interface Customer {
  phone: string;
  name: string;
  email?: string;
  altPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  isFrequent: boolean;
}
