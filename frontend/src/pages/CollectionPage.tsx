import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigationType } from "react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { api } from "../utils/api";
import { Product, Collection } from "../types";
import ProductCard from "../components/ProductCard";
import { setSEO, setJSONLD, absUrl } from "../utils/useSEO";
import { titleCase } from "../utils/text";
import { useSiteSettings, ui } from "../utils/siteSettings";
import { sortForCollection } from "../utils/collectionOrder";
import { readCollectionView, writeCollectionView } from "../utils/collectionView";

// Static class names so Tailwind picks them up (Admin -> Customize -> grid columns).
const DESKTOP_COLS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-3 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
};
const MOBILE_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

type SortKey = "featured" | "price_asc" | "price_desc" | "newest";

const SORT_LABELS: Record<SortKey, string> = {
  featured: "Best Sellers",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  newest: "Newest First",
};

export default function CollectionPage() {
  const { slug } = useParams();
  const navType = useNavigationType();
  // Coming back (Back button / Back arrow) -> restore page, sort and scroll.
  const restoreRef = useRef(navType === "POP" ? readCollectionView(slug) : null);
  const skipReset = useRef(!!restoreRef.current);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(restoreRef.current?.page ?? 1);
  const [sort, setSort] = useState<SortKey>((restoreRef.current?.sort as SortKey) ?? "featured");
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [collectionsError, setCollectionsError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [retry, setRetry] = useState(0);
  const settings = useSiteSettings();
  const PRODUCTS_PER_PAGE = Math.floor(Math.min(96, Math.max(4, Number(ui(settings, "uiProductsPerPage")) || 24)));
  const desktopCols = DESKTOP_COLS[Number(ui(settings, "uiCollectionGridDesktopCols"))] || DESKTOP_COLS[3];
  const mobileCols = MOBILE_COLS[Number(ui(settings, "uiCollectionGridMobileCols"))] || MOBILE_COLS[2];

  useEffect(() => {
    let alive = true;
    setCollectionsLoaded(false);
    setProductsLoaded(false);
    setCollectionsError("");
    setProductsError("");
    api.get("/api/collections")
      .then((data) => { if (alive) setCollections(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) setCollectionsError(err.message || "Collections could not be loaded."); })
      .finally(() => { if (alive) setCollectionsLoaded(true); });
    api.get("/api/products")
      .then((data) => { if (alive) setProducts(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) setProductsError(err.message || "Products could not be loaded."); })
      .finally(() => { if (alive) setProductsLoaded(true); });
    return () => { alive = false; };
  }, [retry]);

  // Changing the sort order should always start again from page 1.
  useEffect(() => { if (skipReset.current) return; setPage(1); }, [sort]);

  useEffect(() => {
    if (skipReset.current) return;
    setSearchQuery("");
    setPage(1);
    setSort("featured");
  }, [slug]);

  // Fresh visit (not Back): start this collection from the top.
  useEffect(() => {
    if (!restoreRef.current) writeCollectionView(slug, { page: 1, sort: "featured", scrollY: 0 });
  }, [slug]);
  useEffect(() => {
    if (!skipReset.current) writeCollectionView(slug, { page, sort });
  }, [slug, page, sort]);

  useEffect(() => {
    if (!slug) {
      setSEO({
        title: "Shop All Collections",
        description: "Browse all 3DCaseMakers phone case and sticker collections — trending, custom, photo, and more.",
        url: "/collections",
      });
    }
  }, [slug]);

  const collection = collections.find((c) => c.slug === slug);

  const collectionProducts = useMemo(
    () => products.filter((p) => p.collectionId === collection?.id || p.collectionIds?.includes(collection?.id || "")),
    [products, collection]
  );

  const filteredAndSorted = useMemo(() => {
    let list = [...collectionProducts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) => p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    switch (sort) {
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "newest":
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        break;
      default:
        // Manual order set by the admin in the dashboard (Collections → Products)
        list = sortForCollection(list, collection);
    }
    return list;
  }, [collectionProducts, collection, searchQuery, sort]);

  useEffect(() => { if (skipReset.current) return; setPage(1); }, [searchQuery]);

  useEffect(() => {
    if (collection) {
      setSEO({
        title: collection.metaTitle || `${titleCase(collection.name)} Phone Cases`,
        description:
          collection.metaDescription ||
          collection.description ||
          `Shop the ${titleCase(collection.name)} phone case collection at 3DCaseMakers — custom prints, acrylic and gold finishes, durable protection, secure online payments.`,
        keywords: `${collection.name}, custom phone case, acrylic phone case, gold phone case`,
        url: `/collections/${collection.slug}`,
        image: collection.image ? api.imageUrl(collection.image) : undefined,
      });
      setJSONLD("breadcrumb", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
          { "@type": "ListItem", position: 2, name: "Collections", item: absUrl("/collections") },
          { "@type": "ListItem", position: 3, name: titleCase(collection.name), item: absUrl(`/collections/${collection.slug}`) },
        ],
      });
    }
  }, [collection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PRODUCTS_PER_PAGE));
  const pageProducts = filteredAndSorted.slice((page - 1) * PRODUCTS_PER_PAGE, page * PRODUCTS_PER_PAGE);
  useEffect(() => {
    // Don't clamp while data is still loading (totalPages is 1 then) - that
    // would throw away a restored page number.
    if (!productsLoaded || !collectionsLoaded) return;
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages, productsLoaded, collectionsLoaded]);

  // Restore the saved scroll position once the products are on screen.
  useEffect(() => {
    const saved = restoreRef.current;
    if (!saved || !productsLoaded || !collectionsLoaded) return;
    restoreRef.current = null;
    skipReset.current = false;
    if (!(saved.scrollY > 0)) return;
    const root = document.documentElement;
    const jump = () => {
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, saved.scrollY);
      root.style.scrollBehavior = prev;
    };
    jump();
    [60, 200, 500].forEach((ms) => window.setTimeout(() => { if (Math.abs(window.scrollY - saved.scrollY) > 4) jump(); }, ms));
  }, [productsLoaded, collectionsLoaded]);

  const loadFailure = (message: string) => (
    <div role="alert" className="py-10 text-center space-y-3"><p className="text-sm text-red-600">{message}</p><button type="button" onClick={() => setRetry((v) => v + 1)} className="glass-btn-grey text-sm font-semibold px-5 py-2.5 rounded-full">Try again</button></div>
  );

  if (collectionsError) {
    return <div className="max-w-xl mx-auto px-6 py-20 text-center"><h1 className="text-xl font-bold">Collections unavailable</h1>{loadFailure(collectionsError)}</div>;
  }
  if (!collectionsLoaded) {
    return <div role="status" className="max-w-xl mx-auto px-6 py-20 text-center text-zinc-500">Loading collections…</div>;
  }

  // -------- All-collections grid --------
  if (!slug) {
    return (
      <div className="max-w-[1600px] mx-auto px-2.5 sm:px-10 lg:px-20 py-10">
        <h1 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight mb-6">All Collections</h1>
        {!collections.some((c) => c.isVisible) && <p className="text-zinc-500 text-sm py-6">No collections are available yet.</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          {collections.filter((c) => c.isVisible).map((c) => (
            <Link key={c.id} to={`/collections/${c.slug}`} className="group soft-corners overflow-hidden glass-card">
              <div className="aspect-square overflow-hidden">
                {c.image ? (
                  <img src={api.thumbUrl(c.image, 480)} alt={titleCase(c.name)} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">{titleCase(c.name)}</div>
                )}
              </div>
              <div className="p-3.5 flex items-center justify-between gap-2">
                <span className="text-zinc-900 text-sm font-bold leading-snug min-w-0 break-words">{titleCase(c.name)}</span>
                <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0 group-hover:translate-x-1 group-hover:text-zinc-900 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // -------- Unknown collection slug --------
  if (collectionsLoaded && !collection) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-black text-zinc-900 mb-2">Collection not found</h1>
        <p className="text-sm text-zinc-500 mb-6">This collection may have been renamed or removed.</p>
        <Link to="/collections" className="glass-btn-primary text-white font-bold px-6 py-2.5 rounded-full text-sm inline-block">
          Browse all collections
        </Link>
      </div>
    );
  }

  // -------- Single-collection listing --------
  return (
    <div className={`max-w-[1600px] mx-auto px-1.5 sm:px-10 lg:px-20 ${collection?.bannerDesktop || collection?.bannerMobile || collection?.bannerVideoUrl ? "pt-0" : "pt-6"} sm:pt-8 pb-10`}>
      {(collection?.bannerDesktop || collection?.bannerMobile || collection?.bannerVideoUrl) && (
        <div className="collection-banner-frame mb-6 -mx-1.5 sm:mx-0 overflow-hidden">
          <div className="w-full" style={{ aspectRatio: "3548 / 1774" }}>
            {collection.bannerMediaType === "video" && collection.bannerVideoUrl ? (
              <video
                src={api.imageUrl(collection.bannerVideoUrl)}
                className="block w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              // Mobile banner on phones (when uploaded), desktop banner
              // everywhere else — the mobile banner was never used before.
              <picture className="block w-full h-full">
                {collection.bannerMobile && collection.bannerDesktop && (
                  <source media="(max-width: 639px)" srcSet={api.imageUrl(collection.bannerMobile)} />
                )}
                <img
                  src={api.imageUrl(collection.bannerDesktop || collection.bannerMobile)}
                  alt={`${titleCase(collection.name)} banner`}
                  className="block w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              </picture>
            )}
          </div>
        </div>
      )}

      {/* Breadcrumb — mirrors the reference site's Home > Category trail */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-zinc-500 mb-3 px-1 uppercase tracking-wide">
        <Link to="/" className="hover:text-zinc-900">HOME</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-zinc-900">{(collection?.name ? titleCase(collection.name) : slug || "").toUpperCase()}</span>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight uppercase break-words">{(collection?.name ? titleCase(collection.name) : slug || "").toUpperCase()}</h1>
          <p className="text-xs text-zinc-500 font-semibold mt-1 uppercase tracking-wide">{filteredAndSorted.length} ITEMS</p>
        </div>
      </div>

      {!productsLoaded ? (
        <div className={`grid ${mobileCols} ${desktopCols} gap-1.5 sm:gap-5 mt-6`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-zinc-100">
              <div className="sf-skeleton aspect-square" />
              <div className="p-3 space-y-2"><div className="sf-skeleton h-3 w-3/4" /><div className="sf-skeleton h-3 w-1/3" /></div>
            </div>
          ))}
        </div>
      ) : productsError ? loadFailure(productsError) : filteredAndSorted.length === 0 && collectionProducts.length === 0 ? (
        <p className="text-zinc-400 text-sm py-12 text-center">No products found.</p>
      ) : (
        <div className="mt-5 sm:mt-6">
          <div>
            {/* Toolbar: sort dropdown */}
            <div className="flex items-center justify-between gap-3 mb-4 px-1">
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden sm:inline text-xs font-bold text-zinc-500">Sort By:</span>
                <select
                  aria-label="Sort products"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="text-xs sm:text-sm font-bold text-zinc-900 border border-zinc-300 rounded-lg px-3 py-2 bg-white"
                >
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredAndSorted.length === 0 ? (
              <p className="text-zinc-400 text-sm py-12 text-center">No products found.</p>
            ) : (
              <>
                <div
                  className={`grid ${mobileCols} ${desktopCols} gap-1.5 sm:gap-5`}
                  onClickCapture={() => writeCollectionView(slug, { page, sort, scrollY: window.scrollY })}
                >
                  {pageProducts.map((p) => <ProductCard key={p.id} product={p} fromCollection={collection?.slug} />)}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-10">
                    <button
                      disabled={page === 1}
                      onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold glass-pill disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-xs font-bold text-zinc-500 px-2">Page {page} of {totalPages}</span>
                    <button
                      disabled={page === totalPages}
                      onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold glass-pill disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
