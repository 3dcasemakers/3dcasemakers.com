import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router";
import { Share2, ImagePlus, X, Loader2, CheckCircle2, ArrowLeft, ChevronLeft, ChevronRight, Zap, Smartphone, Tag } from "lucide-react";
import { api } from "../utils/api";
import { Product, Collection, VariantGroup, CustomizationSet, getCustomizationSets } from "../types";
import { useCart } from "../context/CartContext";
import { useOffers, getPrimaryDisplayOffer } from "../utils/useOffers";
import ProductCard from "../components/ProductCard";
import ProductReviews from "../components/ProductReviews";
import { DEFAULT_BRAND_MODELS } from "../utils/brandModels";
import { Material, GelTextStyle, GEL_TEXT_PLATE_SURCHARGE } from "../types";
import SearchableSelect from "../components/SearchableSelect";
import gelTextPlateImg from "../assets/gel-text/text-plate-gold.png";
import gelTextPrintImg from "../assets/gel-text/text-print.png";
import { setSEO, setJSONLD, absUrl } from "../utils/useSEO";
import { trackViewContent } from "../utils/metaPixel";

// Fixed info graphic (engraving quality / visibility notes) appended as the
// last product image for every Gold-material product — existing and future,
// since it's driven off product.material rather than stored per-product.
const GOLD_CASE_INFO_IMAGE = "https://3dcasemakers.in/gold-case-info.png";

// A product's image slot can be a photo or a video (admin can upload either) —
// tell them apart by extension so the gallery renders the right tag.
function isVideoFile(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url || "");
}

export default function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [brandModels, setBrandModels] = useState<Record<string, string[]>>(DEFAULT_BRAND_MODELS);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [model, setModel] = useState("");
  const [modelError, setModelError] = useState(false);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [selectedVariantOption, setSelectedVariantOption] = useState("");
  const [variantCustomText, setVariantCustomText] = useState("");
  const [variantError, setVariantError] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const offers = useOffers();
  const currentOffer = getPrimaryDisplayOffer(offers);
  const { addItem, openDrawer } = useCart();
  const touchStartX = useRef<number | null>(null);

  // Custom / photo-case products: ask the customer to upload their own image to print
  const [customImage, setCustomImage] = useState<string>("");
  const [customPreview, setCustomPreview] = useState<string>("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const [customIsVideo, setCustomIsVideo] = useState(false);

  // 2nd customization set (Product.customization.sets[1]) — image + text.
  const [customImage2, setCustomImage2] = useState<string>("");
  const [customPreview2, setCustomPreview2] = useState<string>("");
  const [uploadingPhoto2, setUploadingPhoto2] = useState(false);
  const [uploadError2, setUploadError2] = useState("");
  const [photoError2, setPhotoError2] = useState(false);
  const [customName2, setCustomName2] = useState<string>("");

  // 3rd customization set (Product.customization.sets[2]) — image + text.
  const [customImage3, setCustomImage3] = useState<string>("");
  const [customPreview3, setCustomPreview3] = useState<string>("");
  const [uploadingPhoto3, setUploadingPhoto3] = useState(false);
  const [uploadError3, setUploadError3] = useState("");
  const [photoError3, setPhotoError3] = useState(false);
  const [customName3, setCustomName3] = useState<string>("");

  // Custom name to be printed on the product (when admin requires it) — set 1.
  const [customName, setCustomName] = useState<string>("");

  // "Gel Cases" material: word/name to personalize + which style (image print
  // vs physical engraved plate, +₹99).
  const [gelPlateText, setGelPlateText] = useState<string>("");
  const [gelPlateStyle, setGelPlateStyle] = useState<GelTextStyle | "">("");
  const [gelPlateError, setGelPlateError] = useState(false);

  const [related, setRelated] = useState<Product[]>([]);
  // Sibling products from the same Material Set (e.g. this exact design's
  // Acrylic Case / Acrylic Gel Case / Phone Skin), so the shopper can switch
  // between materials without losing the design they're looking at.
  const [setSiblings, setSetSiblings] = useState<Product[]>([]);
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, { image?: string; para1?: string; para2?: string }>>({});
  const [materialProductDescriptions, setMaterialProductDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get("/api/settings").then((s) => {
      // One shared Brand & Model catalog for every case material — no more
      // per-material scoping. Falls back to any old per-material data
      // (merged into one list) or the built-in default catalog.
      if (s?.brandModels && Object.keys(s.brandModels).length) {
        setBrandModels(s.brandModels);
      } else if (s?.materialBrandModels && Object.keys(s.materialBrandModels).length) {
        const merged: Record<string, string[]> = {};
        Object.values(s.materialBrandModels as Record<string, Record<string, string[]>>).forEach((perBrand) => {
          Object.entries(perBrand || {}).forEach(([brand, models]) => {
            merged[brand] = Array.from(new Set([...(merged[brand] || []), ...(models || [])]));
          });
        });
        setBrandModels(merged);
      }
      if (Array.isArray(s?.variantGroups)) setVariantGroups(s.variantGroups);
      if (s?.materialDescriptions) setMaterialDescriptions(s.materialDescriptions);
      if (s?.materialProductDescriptions) setMaterialProductDescriptions(s.materialProductDescriptions);
    }).catch(() => {});
    api.get("/api/collections").then(setCollections).catch(() => {});
  }, []);


  useEffect(() => {
    if (!id) return;
    setProduct(null);
    api.get(`/api/products/${id}`).then((p) => {
      // Gold-material products always show the engraving/visibility info
      // graphic as their last image — appended here so it applies to every
      // existing and future Gold product automatically.
      if ((p.material || "").trim().toLowerCase() === "gold") {
        const imgs = p.images || [];
        if (!imgs.includes(GOLD_CASE_INFO_IMAGE)) {
          p.images = [...imgs, GOLD_CASE_INFO_IMAGE];
        }
      }
      setProduct(p);
      trackViewContent({ productId: p.id, productName: p.title, price: p.price });
      setActiveImg(0);
      setSelectedBrand(p.brand && (p.models || []).length ? p.brand : "");
      setModel("");
      setCustomImage("");
      setCustomPreview("");
      setPhotoError(false);
      setUploadError("");
      setCustomName("");
      setCustomImage2("");
      setCustomPreview2("");
      setPhotoError2(false);
      setUploadError2("");
      setCustomName2("");
      setGelPlateText("");
      setGelPlateStyle("");
      setGelPlateError(false);
      setSelectedVariantOption("");
      setVariantCustomText("");
      setVariantError(false);
      const seoImages = (p.images || []).filter((img: string) => !isVideoFile(img));
      setSEO({
        title: p.metaTitle || p.title,
        description: p.metaDescription || (p.description || "").slice(0, 160) || `Buy ${p.title} at 3DCaseMakers — custom phone case, durable print, secure online payments across India.`,
        keywords: `${p.title}, ${p.brand ? p.brand + " phone case, " : ""}custom phone case, acrylic phone case, gold phone case`,
        image: seoImages[0] ? api.imageUrl(seoImages[0]) : undefined,
        url: `/product/${p.id}`,
      });
      setJSONLD("product", {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.title,
        description: p.metaDescription || (p.description || "").slice(0, 500),
        image: seoImages.map((img: string) => api.imageUrl(img)),
        sku: p.id,
        brand: { "@type": "Brand", name: "3DCaseMakers" },
        ...(p.rating && p.reviewsCount
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: p.rating,
                reviewCount: p.reviewsCount,
              },
            }
          : {}),
        offers: {
          "@type": "Offer",
          url: absUrl(`/product/${p.id}`),
          priceCurrency: "INR",
          price: p.price,
          availability:
            p.stockStatus === "out_of_stock"
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
        },
      });
      setJSONLD("breadcrumb", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
          { "@type": "ListItem", position: 2, name: "Products", item: absUrl("/collections") },
          { "@type": "ListItem", position: 3, name: p.title, item: absUrl(`/product/${p.id}`) },
        ],
      });
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (product) {
      api.get("/api/products").then((all: Product[]) => {
        const sameCollection = all.filter(
          (p) => p.id !== product.id && p.collectionId === product.collectionId
        );
        const pool = sameCollection.length ? sameCollection : all.filter((p) => p.id !== product.id);
        setRelated(pool.slice(0, 4));
        setSetSiblings(
          product.materialSetId
            ? all.filter((p) => p.id !== product.id && p.materialSetId === product.materialSetId)
            : []
        );
      }).catch(() => {});
    }
  }, [product]);

  if (!product) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-24 text-center">
        <div className="w-10 h-10 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const hasDiscount = product.comparePrice && product.comparePrice > product.price;
  const discountPct = hasDiscount ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100) : 0;
  // If the admin specified a brand + models list for this exact product, restrict the
  // buyer's choice to only those models — otherwise fall back to the full global list.
  const hasModelRestriction = !!product.brand && (product.models || []).length > 0;

  // Buyers pick a Brand first, then a Model from just that brand — matching
  // the reference site's two-step selector instead of one giant flat list.
  let brandOptions: string[];
  let modelsForSelectedBrand: string[];
  if (hasModelRestriction) {
    brandOptions = [product.brand as string];
    modelsForSelectedBrand = product.models || [];
  } else {
    brandOptions = Object.keys(brandModels);
    modelsForSelectedBrand = selectedBrand ? brandModels[selectedBrand] || [] : [];
  }
  const collectionName = (collections.find((c) => c.id === product.collectionId)?.name || product.collectionId || "").replace(/-/g, " ");

  // Admin-assigned "Variant Options" dropdown (e.g. Charger Type) shown under the phone model picker.
  // A product's own setting always wins; otherwise fall back to whichever of its
  // collections has a group assigned (Admin > Collections).
  const collectionVariantGroupId = (() => {
    const ids = (product.collectionIds && product.collectionIds.length ? product.collectionIds : [product.collectionId]).filter(Boolean);
    for (const cid of ids) {
      const match = collections.find((c) => c.id === cid && c.variantGroupId);
      if (match?.variantGroupId) return match.variantGroupId;
    }
    return "";
  })();
  const effectiveVariantGroupId = product.variantGroupId || collectionVariantGroupId;
  const activeVariantGroup = variantGroups.find((g) => g.id === effectiveVariantGroupId && g.options.length > 0) || null;
  const selectedVariantOptionObj = activeVariantGroup?.options.find((o) => o.id === selectedVariantOption) || null;
  const variantNeedsCustomText = !!selectedVariantOptionObj?.isCustomText;

  // Up to 3 customization sets (each an image and/or text box, independently
  // required/optional) — set by the admin via the "Customer Customization"
  // preset picker. Falls back to the legacy single isCustomizable/
  // requiresCustomerName pair for older products, and — failing that — to a
  // title/tags/collection keyword heuristic so nothing already live breaks.
  const customKeywords = /custom|photo\s*case|personali[sz]ed/i;
  const keywordImplied =
    customKeywords.test(product.title || "") ||
    (product.tags || []).some((t) => customKeywords.test(t)) ||
    customKeywords.test(collectionName || "");
  const customSets: CustomizationSet[] = (() => {
    const sets = getCustomizationSets(product);
    if (sets.length) return sets;
    if (keywordImplied) return [{ image: true, text: false, imageRequired: true, textRequired: false }];
    return [];
  })();
  // Back-compat aliases used throughout the rest of this file.
  const isCustomizable = customSets.length > 0;
  const isMagicCase = false;

  // "Gel Cases" material products: ask for a word/name to personalize, then
  // whether it goes on as a print (free) or a physical engraved plate (+₹99).
  const isGelCase = product.material === "Gold Gel Case" || product.material === "Acrylic Gel Case";
  const gelSurcharge = gelPlateStyle === "plate" ? GEL_TEXT_PLATE_SURCHARGE : 0;

  // Checks that an uploaded video is square (1:1) before it's allowed through —
  // that's the only aspect ratio the print pipeline supports for video uploads.
  const checkVideoIsSquare = (file: File): Promise<boolean> =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.videoWidth > 0 && video.videoWidth === video.videoHeight);
      };
      video.onerror = () => resolve(false);
      video.src = URL.createObjectURL(file);
    });

  const handlePhotoSelect = async (file: File | null) => {
    if (!file) return;
    setUploadError("");

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) { setUploadError("Please choose an image or video file."); return; }
    if (isMagicCase && isVideo) { setUploadError("This product only accepts photos, not videos."); return; }

    const maxSize = isVideo ? 60 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(isVideo ? "Video must be under 60MB." : "Image must be under 5MB.");
      return;
    }

    if (isVideo) {
      const isSquare = await checkVideoIsSquare(file);
      if (!isSquare) {
        setUploadError("Only 1:1 (square) resolution videos are supported. Please crop your video to a square first.");
        return;
      }
    }

    setCustomPreview(URL.createObjectURL(file));
    setCustomIsVideo(isVideo);
    setUploadingPhoto(true);
    try {
      const res = await api.customerUpload(file);
      setCustomImage(res.url);
      setPhotoError(false);
    } catch {
      setUploadError("Upload failed, please try again.");
      setCustomPreview("");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = () => {
    setCustomImage("");
    setCustomPreview("");
    setCustomIsVideo(false);
  };

  // Second photo slot for "Magic Cases" — images only (no video), mandatory.
  const handlePhotoSelect2 = async (file: File | null) => {
    if (!file) return;
    setUploadError2("");
    if (!file.type.startsWith("image/")) { setUploadError2("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError2("Image must be under 5MB."); return; }

    setCustomPreview2(URL.createObjectURL(file));
    setUploadingPhoto2(true);
    try {
      const res = await api.customerUpload(file);
      setCustomImage2(res.url);
      setPhotoError2(false);
    } catch {
      setUploadError2("Upload failed, please try again.");
      setCustomPreview2("");
    } finally {
      setUploadingPhoto2(false);
    }
  };

  const removePhoto2 = () => {
    setCustomImage2("");
    setCustomPreview2("");
  };

  // Third photo slot (Product.customization.sets[2]) — images only, like slot 2.
  const handlePhotoSelect3 = async (file: File | null) => {
    if (!file) return;
    setUploadError3("");
    if (!file.type.startsWith("image/")) { setUploadError3("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError3("Image must be under 5MB."); return; }

    setCustomPreview3(URL.createObjectURL(file));
    setUploadingPhoto3(true);
    try {
      const res = await api.customerUpload(file);
      setCustomImage3(res.url);
      setPhotoError3(false);
    } catch {
      setUploadError3("Upload failed, please try again.");
      setCustomPreview3("");
    } finally {
      setUploadingPhoto3(false);
    }
  };

  const removePhoto3 = () => {
    setCustomImage3("");
    setCustomPreview3("");
  };

  // Per-set image/text values, keyed the same order as customSets, so the
  // render loop and validation below can stay generic instead of repeating
  // near-identical JSX/logic 3 times.
  const setImageValues = [customImage, customImage2, customImage3];
  const setImagePreviews = [customPreview, customPreview2, customPreview3];
  const setImageUploading = [uploadingPhoto, uploadingPhoto2, uploadingPhoto3];
  const setImageErrors = [uploadError, uploadError2, uploadError3];
  const setPhotoErrors = [photoError, photoError2, photoError3];
  const setImageSelectHandlers = [handlePhotoSelect, handlePhotoSelect2, handlePhotoSelect3];
  const setImageRemoveHandlers = [removePhoto, removePhoto2, removePhoto3];
  const setTextValues = [customName, customName2, customName3];
  const setTextSetters = [setCustomName, setCustomName2, setCustomName3];

  const validateSelection = () => {
    let ok = true;
    if (!selectedBrand || !model) { setModelError(true); ok = false; }
    customSets.forEach((set, i) => {
      if (set.image && set.imageRequired && !setImageValues[i]) {
        if (i === 0) setPhotoError(true);
        else if (i === 1) setPhotoError2(true);
        else setPhotoError3(true);
        ok = false;
      }
      if (set.text && set.textRequired && !setTextValues[i].trim()) {
        ok = false;
      }
    });
    if (activeVariantGroup) {
      const variantIsRequired = activeVariantGroup.required !== false;
      if (!selectedVariantOptionObj) {
        if (variantIsRequired) { setVariantError(true); ok = false; }
      } else if (variantNeedsCustomText && !variantCustomText.trim()) {
        setVariantError(true); ok = false;
      }
    }
    // Gel Cases personalization is fully optional — but IF a font style is
    // picked (Text Plate / Text Print), the text field must be filled.
    if (isGelCase && gelPlateStyle && !gelPlateText.trim()) {
      setGelPlateError(true); ok = false;
    }
    return ok;
  };

  const buildVariantText = () => {
    if (!activeVariantGroup || !selectedVariantOptionObj) return undefined;
    const value = variantNeedsCustomText ? variantCustomText.trim() : selectedVariantOptionObj.label;
    return value ? `${activeVariantGroup.name}: ${value}` : undefined;
  };

  // Combines the generic variant-group text (if any) with the Gel Cases
  // personalization text, since both share the CartItem.customVariant slot
  // that's already wired up everywhere (cart, checkout, admin orders).
  const buildCombinedVariantText = () => {
    const parts: string[] = [];
    const v = buildVariantText();
    if (v) parts.push(v);
    if (isGelCase && gelPlateStyle && gelPlateText.trim()) {
      const styleLabel = gelPlateStyle === "plate" ? `Gold Plate (+₹${GEL_TEXT_PLATE_SURCHARGE})` : "Print (Free)";
      parts.push(`Text: "${gelPlateText.trim()}" — ${styleLabel}`);
    }
    return parts.length ? parts.join(" | ") : undefined;
  };

  // When the customer picks the physical engraved plate, ₹99 is folded
  // straight into this cart line's product price/comparePrice — that way the
  // cart subtotal, checkout total, and admin order totals
  // all pick it up automatically with zero changes anywhere else.
  const buildCartProduct = (): Product => {
    if (!gelSurcharge) return product;
    return { ...product, price: product.price + gelSurcharge, comparePrice: (product.comparePrice || product.price) + gelSurcharge };
  };

  const handleAdd = () => {
    if (!validateSelection()) return;
    addItem(buildCartProduct(), `${selectedBrand} - ${model}`, 1, customImage || undefined, customName.trim() || undefined, buildCombinedVariantText(), customImage2 || undefined, customName2.trim() || undefined, customImage3 || undefined, customName3.trim() || undefined);
    openDrawer(); // "Add to Cart" always lands on the full /cart page now
  };

  const handleBuyNow = () => {
    if (!validateSelection()) return;
    addItem(buildCartProduct(), `${selectedBrand} - ${model}`, 1, customImage || undefined, customName.trim() || undefined, buildCombinedVariantText(), customImage2 || undefined, customName2.trim() || undefined, customImage3 || undefined, customName3.trim() || undefined);
    // Buy Now also lands on the full /cart page now, same as Add to Cart -
    // checkout only ever starts from the cart's own "Proceed to Checkout"
    // button, so the customer always sees the full order (offers, "You may
    // also like", everything) before paying, regardless of which button
    // they tapped on the product page.
    openDrawer();
  };

  const handleBrandChange = (b: string) => {
    setSelectedBrand(b);
    setModel("");
    setModelError(false);
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    if (hasModelRestriction) setSelectedBrand(product.brand as string);
    setModelError(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div className="py-4 sm:py-10 bg-white font-sans min-h-screen">
      <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20">

        {/* Back */}
        <div className="mb-5">
          <Link
            to={collections.find((c) => c.id === product.collectionId)?.slug ? `/collections/${collections.find((c) => c.id === product.collectionId)?.slug}` : "/collections"}
            aria-label="Back"
            className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg border border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50 transition-all inline-flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">

          {/* Gallery */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="lg:sticky lg:top-28 w-full space-y-4">
              <div
                className="bg-zinc-100/40 rounded-3xl w-full mx-auto flex items-center justify-center relative overflow-hidden border border-zinc-100"
                style={{ aspectRatio: "1/1", maxHeight: "520px", maxWidth: "520px" }}
                onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (touchStartX.current === null || !product.images || product.images.length < 2) return;
                  const deltaX = e.changedTouches[0].clientX - touchStartX.current;
                  const SWIPE_THRESHOLD = 40;
                  if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
                    const goingLeft = deltaX < 0;
                    setActiveImg((prev) => {
                      const len = product.images.length;
                      if (goingLeft) return (prev + 1) % len; // swipe left -> next
                      return (prev - 1 + len) % len; // swipe right -> prev
                    });
                  }
                  touchStartX.current = null;
                }}
              >
                {product.images?.[activeImg] ? (
                  isVideoFile(product.images[activeImg]) ? (
                    <video
                      key={activeImg}
                      src={api.imageUrl(product.images[activeImg])}
                      className="w-full h-full object-cover rounded-3xl select-none"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      key={activeImg}
                      src={api.imageUrl(product.images[activeImg])}
                      alt={product.title}
                      className="w-full h-full object-cover rounded-3xl select-none"
                      draggable={false}
                      loading={activeImg === 0 ? "eager" : "lazy"}
                      // @ts-ignore - fetchpriority isn't in older React DOM typings yet
                      fetchpriority={activeImg === 0 ? "high" : undefined}
                      decoding="async"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.onerror = null;
                        el.style.display = "none";
                        el.parentElement?.insertAdjacentHTML(
                          "beforeend",
                          '<div class="w-full h-full flex items-center justify-center text-zinc-400">No image</div>'
                        );
                      }}
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">No image</div>
                )}

                {product.images?.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous image"
                      onClick={() =>
                        setActiveImg((prev) => (prev - 1 + product.images.length) % product.images.length)
                      }
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-8 sm:h-8 text-zinc-500/70 hover:text-zinc-900 flex items-center justify-center transition-colors"
                    >
                      <ChevronLeft className="w-6 h-6" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next image"
                      onClick={() =>
                        setActiveImg((prev) => (prev + 1) % product.images.length)
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-8 sm:h-8 text-zinc-500/70 hover:text-zinc-900 flex items-center justify-center transition-colors"
                    >
                      <ChevronRight className="w-6 h-6" strokeWidth={2} />
                    </button>

                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-white/70 backdrop-blur text-[11px] font-medium text-zinc-600 tabular-nums">
                      {activeImg + 1}/{product.images.length}
                    </div>
                  </>
                )}

              </div>

              {product.images?.length > 1 && (
                <div className="flex sm:justify-center gap-3 w-full overflow-x-auto scrollbar-none px-0.5 -mx-0.5 snap-x snap-mandatory">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`w-16 h-16 shrink-0 snap-start bg-zinc-100/40 rounded-2xl overflow-hidden flex items-center justify-center transition-all hover:scale-105 ${
                        i === activeImg ? "ring-2 ring-zinc-900 opacity-100" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {isVideoFile(img) ? (
                        <video
                          src={`${api.imageUrl(img)}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        <img
                          src={api.thumbUrl(img, 160)}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover rounded-2xl"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.style.opacity = "0.2";
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* Details / Buy box */}
          <div className="lg:col-span-6 space-y-7">
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl tracking-tight font-black text-zinc-900 leading-tight">
                {product.title}
              </h1>
            </div>

            <div className="py-1 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-black text-zinc-900">₹{product.price + gelSurcharge}</span>
                  {gelSurcharge > 0 && (
                    <span className="text-[10px] font-bold text-[var(--brand-accent,#000000)] uppercase">incl. +₹{gelSurcharge} plate</span>
                  )}
                  {hasDiscount && (
                    <>
                      <span className="text-lg line-through text-zinc-400 font-medium">₹{product.comparePrice}</span>
                      <span className="text-emerald-600 text-sm font-bold">{discountPct}% off</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {currentOffer && (
                    <span className="inline-flex items-center gap-1 bg-[var(--brand-accent,#000000)] text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-full whitespace-nowrap">
                      <Zap className="w-3 h-3 shrink-0" />
                      {currentOffer.badgeText}
                    </span>
                  )}
                  <button
                    onClick={handleShare}
                    aria-label="Share"
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                      shareCopied ? "bg-emerald-500 text-white border-emerald-500" : "text-zinc-900 hover:text-white hover:bg-zinc-900 bg-transparent border-zinc-900"
                    }`}
                  >
                    {shareCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium text-zinc-400">Free shipping within Tamil Nadu only. Additional charges (Door Delivery) apply for other states.</p>
            </div>

            {setSiblings.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs tracking-wider uppercase font-black text-zinc-900">Material</span>
                <div className="flex flex-wrap gap-2.5">
                  <div className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border-2 border-zinc-900 bg-zinc-900 text-white min-w-[92px]">
                    <span className="text-xs font-bold text-center leading-tight">{product.material}</span>
                    <span className="text-[11px] font-semibold text-zinc-300">₹{product.price}</span>
                  </div>
                  {setSiblings.map((sib) => (
                    <Link
                      key={sib.id}
                      to={`/product/${sib.id}`}
                      className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border-2 border-zinc-200 hover:border-zinc-900 bg-white text-zinc-700 hover:text-zinc-900 transition-colors min-w-[92px]"
                    >
                      <span className="text-xs font-bold text-center leading-tight">{sib.material}</span>
                      <span className="text-[11px] font-semibold text-zinc-400">₹{sib.price}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`space-y-3.5 rounded-2xl p-4 border transition-colors ${
                modelError
                  ? "bg-red-50/40 border-red-200 ring-1 ring-red-100"
                  : hasModelRestriction
                  ? model
                    ? "bg-emerald-50/40 border-emerald-200"
                    : "bg-zinc-50 border-zinc-200"
                  : selectedBrand && model
                  ? "bg-emerald-50/40 border-emerald-200"
                  : "bg-zinc-50 border-zinc-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <Smartphone className="w-3.5 h-3.5 text-[var(--brand-accent,#18181b)]" />
                  <span className="text-xs tracking-wider uppercase font-black">Choose Your Phone Model</span>
                </div>
                {((hasModelRestriction && model) || (!hasModelRestriction && selectedBrand && model)) && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Selected
                  </span>
                )}
              </div>

              {!hasModelRestriction && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide pl-0.5">1. Brand</span>
                  <SearchableSelect
                    value={selectedBrand}
                    onChange={handleBrandChange}
                    options={brandOptions}
                    placeholder="-- Choose your phone brand --"
                    searchPlaceholder="Search brand..."
                    error={modelError && !selectedBrand}
                    icon={<Tag className="w-3.5 h-3.5" />}
                  />
                </div>
              )}

              <div className="space-y-1">
                {!hasModelRestriction && (
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide pl-0.5">2. Model</span>
                )}
                <SearchableSelect
                  value={model}
                  onChange={handleModelChange}
                  options={modelsForSelectedBrand}
                  placeholder={hasModelRestriction || selectedBrand ? "-- Choose your phone model --" : "-- Select a brand first --"}
                  searchPlaceholder="Search your phone model..."
                  disabled={!hasModelRestriction && !selectedBrand}
                  error={modelError && !model}
                  icon={<Smartphone className="w-3.5 h-3.5" />}
                />
              </div>

              {modelError && <p className="text-red-500 text-[11px] font-bold">Please select your phone brand and model</p>}
              <p className="text-[11px] text-zinc-500 font-medium">
                If your model is not found, kindly message us on WhatsApp.
              </p>
            </div>

            {isGelCase && (
              <div className={`space-y-3 rounded-2xl p-4 bg-zinc-50 border border-zinc-200 ${gelPlateError ? "ring-1 ring-red-400" : ""}`}>
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <span className="text-xs tracking-wider uppercase font-black">If any Text need Type Here</span>
                  <span className="text-[10px] font-semibold tracking-wide text-zinc-400 normal-case">(optional)</span>
                </div>
                <input
                  type="text"
                  value={gelPlateText}
                  maxLength={20}
                  onChange={(e) => { setGelPlateText(e.target.value); setGelPlateError(false); }}
                  placeholder="Type name / word to personalize (optional)"
                  className={`w-full bg-white border rounded-xl px-3.5 py-3 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 ${gelPlateError ? "border-red-400" : "border-zinc-200 focus:border-zinc-900"}`}
                />
                <p className="text-xs font-bold text-zinc-900">
                  Text: <span className="font-semibold text-zinc-600">Gold Plate / Print</span>
                  {gelPlateStyle === "plate" && <span className="text-[var(--brand-accent,#000000)]"> (+₹{GEL_TEXT_PLATE_SURCHARGE})</span>}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setGelPlateStyle(gelPlateStyle === "plate" ? "" : "plate"); setGelPlateError(false); }}
                    title={`Gold Plate (+₹${GEL_TEXT_PLATE_SURCHARGE})`}
                    className={`w-[54px] h-[54px] shrink-0 rounded-lg border-2 overflow-hidden bg-white flex items-center justify-center transition-all cursor-pointer ${gelPlateStyle === "plate" ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    <img src={gelTextPlateImg} alt="Gold Plate" className="w-full h-full object-contain p-1" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setGelPlateStyle(gelPlateStyle === "image" ? "" : "image"); setGelPlateError(false); }}
                    title="Print (Free)"
                    className={`w-[54px] h-[54px] shrink-0 rounded-lg border-2 overflow-hidden bg-white flex items-center justify-center transition-all cursor-pointer ${gelPlateStyle === "image" ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    <img src={gelTextPrintImg} alt="Print" className="w-full h-full object-contain p-1" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500">
                  <span className="w-[54px] text-center">Gold Plate</span>
                  <span className="w-[54px] text-center">Print</span>
                </div>
                {gelPlateError && (
                  <p className="text-red-500 text-[11px] font-bold">Please type the text you want on the {gelPlateStyle === "plate" ? "Gold Plate" : "Print"}</p>
                )}
              </div>
            )}

            {activeVariantGroup && (
              <div className={`space-y-3 rounded-2xl p-4 bg-zinc-50 border border-zinc-200 ${variantError && !selectedVariantOptionObj ? "ring-1 ring-red-400" : ""}`}>
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <span className="text-xs tracking-wider uppercase font-black">{activeVariantGroup.name}</span>
                  {activeVariantGroup.required === false && (
                    <span className="text-[10px] font-semibold tracking-wide text-zinc-400 normal-case">(optional)</span>
                  )}
                </div>
                <select
                  value={selectedVariantOption}
                  onChange={(e) => {
                    setSelectedVariantOption(e.target.value);
                    setVariantError(false);
                    if (!activeVariantGroup.options.find((o) => o.id === e.target.value)?.isCustomText) setVariantCustomText("");
                  }}
                  className={`w-full bg-white border rounded-xl px-3.5 py-3 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 ${variantError && !selectedVariantOptionObj ? "border-red-400" : "border-zinc-200 focus:border-zinc-900"}`}
                >
                  <option value="">
                    {activeVariantGroup.required === false
                      ? `-- Choose ${activeVariantGroup.name} (optional) --`
                      : `-- Choose ${activeVariantGroup.name} --`}
                  </option>
                  {activeVariantGroup.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {variantError && !selectedVariantOptionObj && (
                  <p className="text-red-500 text-[11px] font-bold">Please select an option</p>
                )}
                {variantNeedsCustomText && (
                  <>
                    <input
                      type="text"
                      value={variantCustomText}
                      maxLength={80}
                      onChange={(e) => { setVariantCustomText(e.target.value); setVariantError(false); }}
                      placeholder="Type your own text here"
                      className={`w-full bg-white border rounded-xl px-3.5 py-3 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 ${variantError && !variantCustomText.trim() ? "border-red-400" : "border-zinc-200 focus:border-zinc-900"}`}
                    />
                    {variantError && !variantCustomText.trim() && (
                      <p className="text-red-500 text-[11px] font-bold">Please type your text</p>
                    )}
                  </>
                )}
              </div>
            )}

            {customSets.map((set, i) => {
              const isFirstImageSlot = i === 0; // only slot 1 accepts video + shows the bigger preview
              const preview = setImagePreviews[i];
              const image = setImageValues[i];
              const uploading = setImageUploading[i];
              const error = setImageErrors[i];
              const photoErr = setPhotoErrors[i];
              const select = setImageSelectHandlers[i];
              const remove = setImageRemoveHandlers[i];
              const textValue = setTextValues[i];
              const setTextValue = setTextSetters[i];
              const multiSet = customSets.length > 1;
              return (
                <div key={i} className={`space-y-3 glass rounded-2xl p-4 ${photoErr ? "ring-1 ring-red-400" : ""}`}>
                  {set.image && (
                    <>
                      <div className="flex items-center gap-2 font-bold text-zinc-900">
                        <ImagePlus className="w-4 h-4" />
                        <span className="text-xs tracking-wider uppercase font-black">
                          {multiSet ? `Upload Photo ${i + 1}` : "Upload Your Photo"}
                          {!set.imageRequired && <span className="text-zinc-400 normal-case font-semibold"> (optional)</span>}
                        </span>
                      </div>
                      {!preview ? (
                        <label className="glass-pill flex flex-col items-center justify-center gap-2 rounded-2xl py-8 cursor-pointer text-zinc-500 hover:text-zinc-900">
                          <ImagePlus className="w-6 h-6" />
                          <span className="text-xs font-bold">Tap to choose {isFirstImageSlot ? "a photo or video" : "a photo"}</span>
                          <span className="text-[10px] text-zinc-400">{isFirstImageSlot ? "JPG/PNG up to 5MB, or a 1:1 (square) video up to 60MB" : "JPG or PNG, up to 5MB"}</span>
                          <input
                            type="file"
                            accept={isFirstImageSlot ? "image/*,video/*" : "image/*"}
                            className="hidden"
                            onChange={(e) => select(e.target.files?.[0] || null)}
                          />
                        </label>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="relative w-20 h-20 rounded-2xl overflow-hidden glass shrink-0">
                            {isFirstImageSlot && customIsVideo ? (
                              <video src={preview} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              <img src={preview} alt="Your upload" className="w-full h-full object-cover" />
                            )}
                            {uploading && (
                              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-zinc-900 animate-spin" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {uploading ? (
                              <p className="text-xs font-bold text-zinc-500">Uploading…</p>
                            ) : image ? (
                              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {isFirstImageSlot && customIsVideo ? "Video" : "Photo"} ready to print
                              </p>
                            ) : null}
                            <button
                              onClick={remove}
                              className="mt-1.5 text-[11px] font-bold text-zinc-500 hover:text-red-500 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3 h-3" /> Remove & choose another
                            </button>
                          </div>
                        </div>
                      )}
                      {error && <p className="text-red-500 text-[11px] font-bold">{error}</p>}
                      {photoErr && !error && (
                        <p className="text-red-500 text-[11px] font-bold">Please upload your photo to continue</p>
                      )}
                    </>
                  )}

                  {set.text && (
                    <div className="space-y-1.5">
                      <label className="text-xs tracking-wider uppercase font-black text-zinc-900 block">
                        {multiSet ? `Text ${i + 1}` : "Name to Print"}{" "}
                        <span className="text-zinc-400 normal-case font-semibold">({set.textRequired ? "required" : "optional"})</span>
                      </label>
                      <input
                        type="text"
                        value={textValue}
                        maxLength={40}
                        onChange={(e) => setTextValue(e.target.value)}
                        placeholder="e.g. Priya"
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-3 text-xs font-bold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex gap-3">
              <button onClick={handleAdd} className="flex-1 glass-btn-grey text-white font-black text-sm py-3.5 rounded-full cursor-pointer">
                Add to Cart
              </button>
              <button onClick={handleBuyNow} className="flex-1 glass-btn-gold font-black text-sm py-3.5 rounded-full cursor-pointer">
                Buy Now
              </button>
            </div>

            {(() => {
              const matInfo = product.material ? materialDescriptions[product.material] : undefined;
              const hasMatInfo = !!(matInfo && (matInfo.para1 || matInfo.para2 || matInfo.image));
              const matProductDesc = product.material ? materialProductDescriptions[product.material] : undefined;
              const displayDescription = matProductDesc?.trim() ? matProductDesc : product.description;
              return (
                <div className="pt-2 space-y-5">
                  <p className="text-zinc-600 text-sm whitespace-pre-line leading-relaxed">{displayDescription}</p>

                  {hasMatInfo && (
                    <div className="pt-4 border-t border-zinc-100">
                      <h3 className="text-xs font-black uppercase tracking-wide text-zinc-900 mb-3">Material Details</h3>
                      <div className="space-y-4">
                        {matInfo?.para1 && (
                          <div className="flex flex-row gap-4 items-start">
                            {matInfo.image && (
                              <img
                                src={api.imageUrl(matInfo.image)}
                                alt={`${product.material} material`}
                                className="w-1/2 max-w-[220px] rounded-xl object-cover shrink-0"
                                loading="lazy"
                              />
                            )}
                            <p className="text-zinc-600 text-sm whitespace-pre-line leading-relaxed flex-1">{matInfo.para1}</p>
                          </div>
                        )}
                        {matInfo?.para2 && (
                          <p className="text-zinc-600 text-sm whitespace-pre-line leading-relaxed">{matInfo.para2}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <ProductReviews productId={product.id} />

          {related.length > 0 && (
            <div className="lg:col-span-12 mt-6 pt-8 border-t border-zinc-100">
              <h2 className="text-lg font-black text-zinc-900 mb-4 uppercase tracking-tight">You may also like</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {related.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
