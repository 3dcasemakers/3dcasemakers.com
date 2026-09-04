import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { api } from "../utils/api";
import { Product, Collection } from "../types";
import ProductCard from "../components/ProductCard";
import { setSEO, setJSONLD, absUrl } from "../utils/useSEO";
import { titleCase } from "../utils/text";

const PRODUCTS_PER_PAGE = 24;

type SortKey = "featured" | "price_asc" | "price_desc" | "newest";

const SORT_LABELS: Record<SortKey, string> = {
  featured: "Best Sellers",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  newest: "Newest First",
};

export default function CollectionPage() {
  const { slug } = useParams();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("featured");

  useEffect(() => {
    api.get("/api/collections").then(setCollections).catch(() => {});
    api.get("/api/products").then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    setSearchQuery("");
    setPage(1);
    setSort("featured");
  }, [slug]);

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
        // Manual order set by the admin in the dashboard (Collections → Reorder Products)
        list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return list;
  }, [collectionProducts, searchQuery, sort]);

  useEffect(() => { setPage(1); }, [searchQuery]);

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

  // -------- All-collections grid --------
  if (!slug) {
    return (
      <div className="max-w-[1600px] mx-auto px-2.5 sm:px-10 lg:px-20 py-10">
        <h1 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight mb-6">All Collections</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          {collections.filter((c) => c.isVisible).map((c) => (
            <Link key={c.id} to={`/collections/${c.slug}`} className="group rounded-2xl overflow-hidden glass-card">
              <div className="aspect-square overflow-hidden">
                {c.image ? (
                  <img src={api.thumbUrl(c.image, 480)} alt={titleCase(c.name)} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">{titleCase(c.name)}</div>
                )}
              </div>
              <div className="p-3.5 flex items-center justify-between gap-2">
                <span className="text-zinc-900 text-sm font-bold leading-snug">{titleCase(c.name)}</span>
                <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0 group-hover:translate-x-1 group-hover:text-zinc-900 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // -------- Single-collection listing --------
  return (
    <div className="max-w-[1600px] mx-auto px-1.5 sm:px-10 lg:px-20 pt-0 sm:pt-8 pb-10">
      {(collection?.bannerDesktop || collection?.bannerMobile || collection?.bannerVideoUrl) && (
        <div className="mb-6 -mx-1.5 sm:mx-0 rounded-none sm:rounded-2xl overflow-hidden">
          <div className="w-full" style={{ aspectRatio: "3548 / 1774" }}>
            {collection.bannerMediaType === "video" && collection.bannerVideoUrl ? (
              <video
                src={api.imageUrl(collection.bannerVideoUrl)}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                src={api.imageUrl(collection.bannerDesktop || collection.bannerMobile)}
                alt={`${titleCase(collection.name)} banner`}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
              />
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
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight uppercase">{(collection?.name ? titleCase(collection.name) : slug || "").toUpperCase()}</h1>
          <p className="text-xs text-zinc-500 font-semibold mt-1 uppercase tracking-wide">{filteredAndSorted.length} ITEMS</p>
        </div>
      </div>

      {filteredAndSorted.length === 0 && collectionProducts.length === 0 ? (
        <p className="text-zinc-400 text-sm py-12 text-center">No products found.</p>
      ) : (
        <div className="mt-5 sm:mt-6">
          <div>
            {/* Toolbar: sort dropdown */}
            <div className="flex items-center justify-between gap-3 mb-4 px-1">
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden sm:inline text-xs font-bold text-zinc-500">Sort By:</span>
                <select
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-5">
                  {pageProducts.map((p) => <ProductCard key={p.id} product={p} />)}
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
