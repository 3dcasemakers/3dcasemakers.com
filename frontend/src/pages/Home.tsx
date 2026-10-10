import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Truck, ShieldCheck, Headphones, Users, Star, Award, Package, Clock3, MessageCircle, IndianRupee } from "lucide-react";
import { api, readCached, writeCached } from "../utils/api";
import { Product, Collection } from "../types";
import ProductCard from "../components/ProductCard";
import HeroBanner from "../components/HeroBanner";
import Reveal from "../components/Reveal";
import { setSEO, setJSONLD, absUrl } from "../utils/useSEO";
import { titleCase } from "../utils/text";

// Feature bar (the 3 icon+text badges under the hero banner) — fully admin
// editable from Admin -> Home Page -> Feature Bar. Icon key is stored in
// settings.featureBar; this map is how that key renders as an actual icon.
export const FEATURE_BAR_ICON_MAP: Record<string, any> = {
  truck: Truck,
  shield: ShieldCheck,
  headphones: Headphones,
  star: Star,
  award: Award,
  package: Package,
  clock: Clock3,
  message: MessageCircle,
  users: Users,
  rupee: IndianRupee,
};

export const DEFAULT_FEATURE_BAR = [
  { icon: "truck", title: "Free Shipping", subtitle: "On order above ₹499" },
  { icon: "shield", title: "Premium Quality", subtitle: "Acrylic strong glass" },
  { icon: "headphones", title: "Customer Support", subtitle: "We're here to help" },
];

// Home page is intentionally short: Shop By Collections -> Popular Products ->
// Best Selling Products -> footer. Per-collection rows live on each collection page.
export const DEFAULT_HOME_SECTIONS = [
  "collectionsGrid",
  "newArrivals",
  "popularProducts",
  "bestSellers",
] as const;

export const HOME_SECTION_LABELS: Record<string, string> = {
  collectionsGrid: "Shop By Collections",
  newArrivals: "New Arrival",
  popularProducts: "Popular Products",
  bestSellers: "Best Selling Products",
};

// Product-grid sections on the home page always show between 8 and 20 products.
export const HOME_PRODUCTS_MIN = 8;
export const HOME_PRODUCTS_MAX = 20;

// "New Arrival" (right under Shop By Collections) shows between 2 and 10
// products, picked from Admin -> Home Page -> New Arrival.
export const HOME_NEW_ARRIVAL_MIN = 2;
export const HOME_NEW_ARRIVAL_MAX = 10;

// Where a section sits when the admin's saved order predates it: "New
// Arrival" goes straight after Shop By Collections, everything else last.
export function mergeHomeSectionOrder(saved: string[]): string[] {
  const all = DEFAULT_HOME_SECTIONS as readonly string[];
  const valid = saved.filter((k) => all.includes(k));
  if (!valid.length) return [...all];
  const out = [...valid];
  for (const k of all) {
    if (out.includes(k)) continue;
    if (k === "newArrivals" && out.includes("collectionsGrid")) out.splice(out.indexOf("collectionsGrid") + 1, 0, k);
    else out.push(k);
  }
  return out;
}

function ProductGridSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-10 sm:mt-14">
      <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border border-zinc-100">
            <div className="sf-skeleton aspect-square" />
            <div className="p-3 space-y-2">
              <div className="sf-skeleton h-3 w-3/4" />
              <div className="sf-skeleton h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  // Collections + settings start from the last-known copy (localStorage) so
  // "Shop By Collections" is on screen on the first paint of a repeat visit;
  // the fresh fetch below then replaces it silently.
  const [collections, setCollections] = useState<Collection[]>(() => readCached<Collection[]>("/api/collections") ?? []);
  const [settings, setSettings] = useState<any>(() => readCached<any>("/api/settings") ?? {});
  const [collectionsReady, setCollectionsReady] = useState(() => readCached("/api/collections") !== null && readCached("/api/settings") !== null);
  const [collectionsFetched, setCollectionsFetched] = useState(false);
  const [settingsFetched, setSettingsFetched] = useState(false);
  const [query, setQuery] = useState("");
  const [productsLoaded, setProductsLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/products").then(setProducts).catch(() => {}).finally(() => setProductsLoaded(true));
    api.get("/api/collections")
      .then((c: Collection[]) => { setCollections(c); writeCached("/api/collections", c); })
      .catch(() => {})
      .finally(() => setCollectionsFetched(true));
    let active = true;
    let sequence = 0;
    const refreshSettings = () => {
      const requestSequence = ++sequence;
      return api.get("/api/settings")
        .then((st: any) => { if (active && requestSequence === sequence) { setSettings(st); writeCached("/api/settings", st); } })
        .catch(() => {})
        .finally(() => { if (active && requestSequence === sequence) setSettingsFetched(true); });
    };
    refreshSettings();
    window.addEventListener("3dcasemakers:settings-updated", refreshSettings);
    return () => { active = false; window.removeEventListener("3dcasemakers:settings-updated", refreshSettings); };
  }, []);

  // First-ever visit (nothing cached): wait for BOTH collections and settings
  // before drawing tiles, so the grid never flashes "all collections" and then
  // jumps to the admin-chosen list. Until then a same-size skeleton holds the spot.
  useEffect(() => {
    if (collectionsFetched && settingsFetched) setCollectionsReady(true);
  }, [collectionsFetched, settingsFetched]);

  useEffect(() => {
    setSEO({
      title: "Custom, Acrylic & Gold Phone Cases India",
      description:
        "Buy strong acrylic & glass phone cases at 3DCaseMakers, India's custom case store. Premium photo cases, gold finishes, on sale with pan-India delivery.",
      keywords:
        "custom phone case, acrylic phone case, strong acrylic case, glass phone case, gold phone case, gold case, premium phone case, personalised phone case India, phone case sale",
      url: "/",
    });
    setJSONLD("organization", {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "3DCaseMakers",
      alternateName: "3DCaseMakers.in",
      url: absUrl("/"),
      logo: absUrl("/favicon-512.png"),
      description:
        "3DCaseMakers sells custom phone cases, acrylic phone cases and gold phone cases online across India.",
      sameAs: [],
    });
    setJSONLD("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "3DCaseMakers",
      url: absUrl("/"),
      potentialAction: {
        "@type": "SearchAction",
        target: `${absUrl("/search")}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });
    // Clear any leftover product-page structured data from a prior route
    setJSONLD("product", null);
    setJSONLD("breadcrumb", null);
  }, []);

  const visibleCollections = useMemo(
    () =>
      collections
        .filter((c) => c.isVisible)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [collections]
  );

  // "Shop By Category" list. Admin can pick exactly which collections appear
  // (and in what order) via settings.homeCategoryIds. When that setting has
  // never been saved, fall back to every visible collection (original behaviour).
  const categoryCollections = useMemo(() => {
    const ids = settings?.homeCategoryIds;
    if (!Array.isArray(ids)) return visibleCollections;
    return ids
      .map((id: string) => visibleCollections.find((c) => c.id === id))
      .filter((c: Collection | undefined): c is Collection => !!c);
  }, [settings, visibleCollections]);

  const productsByOrder = useMemo(
    () => [...products].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [products]
  );

  // Pads a hand-picked list up to the minimum so the grid never looks sparse.
  const padToMin = (picked: Product[]) => {
    if (picked.length >= HOME_PRODUCTS_MIN) return picked.slice(0, HOME_PRODUCTS_MAX);
    const out = [...picked];
    for (const p of productsByOrder) {
      if (out.length >= HOME_PRODUCTS_MIN) break;
      if (!out.some((x) => x.id === p.id)) out.push(p);
    }
    return out;
  };

  // Popular Products: admin picks 8-20 products (Admin -> Home Page ->
  // Popular Products). Until it has been set, show the first 12 products.
  const popularProducts = useMemo(() => {
    const ids = settings?.homePopularProductIds;
    if (!Array.isArray(ids)) return productsByOrder.slice(0, 12);
    const byId = new Map(products.map((p) => [p.id, p]));
    const picked = ids.map((id: string) => byId.get(id)).filter((p: Product | undefined): p is Product => !!p);
    return padToMin(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, products, productsByOrder]);

  // Best Selling Products: same mechanism as Trending was (flag + order from
  // Admin -> Products -> Manage Best Selling), 8-20 products.
  const bestSellers = useMemo(() => {
    const picked = products
      .filter((p) => p.isBestSeller)
      .sort((a, b) => (a.bestSellerOrder ?? 0) - (b.bestSellerOrder ?? 0))
      .slice(0, HOME_PRODUCTS_MAX);
    return padToMin(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, productsByOrder]);

  // New Arrival: admin picks 2-10 products (Admin -> Home Page -> New
  // Arrival). Until picked, it shows products flagged "New Arrival", then the
  // newest products, so the section always has at least 2 products.
  const newArrivals = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const ids = settings?.homeNewArrivalProductIds;
    let picked: Product[] = Array.isArray(ids)
      ? ids.map((id: string) => byId.get(id)).filter((p: Product | undefined): p is Product => !!p)
      : [];
    if (!Array.isArray(ids)) {
      picked = products.filter((p) => p.isNewArrival);
    }
    picked = picked.slice(0, HOME_NEW_ARRIVAL_MAX);
    if (picked.length < HOME_NEW_ARRIVAL_MIN) {
      const newest = [...products].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      for (const p of newest) {
        if (picked.length >= HOME_NEW_ARRIVAL_MIN) break;
        if (!picked.some((x) => x.id === p.id)) picked.push(p);
      }
    }
    return picked;
  }, [settings, products]);

  const orderedSections = useMemo(() => {
    const saved: string[] = Array.isArray(settings?.homeSectionsOrder) ? settings.homeSectionsOrder : [];
    const all: string[] = mergeHomeSectionOrder(saved);
    // Admin -> Customize -> Home Page: sections switched off entirely.
    const hidden: string[] = Array.isArray(settings?.uiHomeHiddenSections) ? settings.uiHomeHiddenSections : [];
    return all.filter((k) => !hidden.includes(k));
  }, [settings]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <>
    <HeroBanner />

    <h1 className="sr-only">Custom Phone Cases, Acrylic Cases &amp; Gold Cases Online — 3DCaseMakers</h1>

    {/* Feature bar (Admin -> Home Page -> Feature Bar). It was editable in
        the admin panel but never actually rendered on the storefront. Can be
        hidden from Admin -> Customize -> Home Sections. */}
    {!(Array.isArray(settings?.uiHomeHiddenSections) && settings.uiHomeHiddenSections.includes("featureBar")) && (
      <div className="border-b border-zinc-200 bg-white">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-10 lg:px-20 grid grid-cols-3 divide-x divide-zinc-200">
          {(Array.isArray(settings?.featureBar) && settings.featureBar.length ? settings.featureBar : DEFAULT_FEATURE_BAR).slice(0, 3).map((f: any, i: number) => {
            const Icon = FEATURE_BAR_ICON_MAP[f.icon] || Truck;
            return (
              <div key={i} className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3 py-3 sm:py-4 px-1 text-center sm:text-left">
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900 shrink-0" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-sm font-bold text-zinc-900 uppercase tracking-wide leading-tight">{f.title}</p>
                  {f.subtitle && <p className="hidden sm:block text-xs text-zinc-500 mt-0.5">{f.subtitle}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20">
      {orderedSections.map((key) => {
        const node = (() => {
        switch (key) {
          case "collectionsGrid":
            if (!collectionsReady) {
              return (
                <section key={key} className="mt-8 sm:mt-14">
                  <div className="flex items-center justify-between mb-5 sm:mb-6">
                    <h2 className="text-xl sm:text-2xl font-black text-zinc-900 uppercase tracking-wide">
                      {settings?.homeCollectionsTitle || "Shop By Collections"}
                    </h2>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3 sm:gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="sf-skeleton aspect-square w-full" />
                        <div className="sf-skeleton h-3 w-2/3 mt-2" />
                      </div>
                    ))}
                  </div>
                </section>
              );
            }
            return categoryCollections.length > 0 ? (
              <section key={key} className="mt-8 sm:mt-14">
                <div className="flex items-center justify-between mb-5 sm:mb-6">
                  <h2 className="text-xl sm:text-2xl font-black text-zinc-900 uppercase tracking-wide">
                    {settings?.homeCollectionsTitle || "Shop By Collections"}
                  </h2>
                  <Link to="/collections" className="text-xs sm:text-sm font-bold text-zinc-900 border border-zinc-200 rounded-full px-3 py-1.5 hover:bg-zinc-50 whitespace-nowrap">
                    View all →
                  </Link>
                </div>
                <div className={`grid ${settings?.collectionsGridMobileCols === 2 ? "grid-cols-2" : "grid-cols-3"} md:grid-cols-5 gap-3 sm:gap-6`}>
                  {categoryCollections.map((c, idx) => (
                    <Link key={c.id} to={`/collections/${c.slug}`} className="group flex flex-col items-center">
                      <div
                        className={`aspect-square w-full overflow-hidden soft-corners bg-zinc-100 shadow-sm ${
                          c.isHighlighted
                            ? "border-2 border-[var(--brand-accent,#000000)] ring-2 ring-[var(--brand-accent-soft,#f4f4f5)]"
                            : "border border-zinc-200"
                        }`}
                      >
                        {c.image ? (
                          <img
                            src={api.thumbUrl(c.image, 400)}
                            alt={titleCase(c.name)}
                            // First two rows (above the fold) load immediately at high priority.
                            loading={idx < 10 ? "eager" : "lazy"}
                            fetchPriority={idx < 10 ? "high" : "auto"}
                            decoding="async"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">{titleCase(c.name)}</div>
                        )}
                      </div>
                      <span className={`mt-2 text-[11px] sm:text-sm font-bold leading-snug text-center ${c.isHighlighted ? "text-[var(--brand-accent,#000000)]" : "text-zinc-800"}`}>{titleCase(c.name)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null;

          case "newArrivals":
            if (!productsLoaded) return <ProductGridSkeleton key={key} title={settings?.homeNewArrivalTitle || "New Arrival"} />;
            return newArrivals.length > 0 ? (
              <section key={key} className="mt-10 sm:mt-14">
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">
                  {settings?.homeNewArrivalTitle || "New Arrival"}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
                  {newArrivals.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </section>
            ) : null;

          case "popularProducts":
            if (!productsLoaded) return <ProductGridSkeleton key={key} title={settings?.uiPopularTitle || "Popular Products"} />;
            return popularProducts.length > 0 ? (
              <section key={key} className="mt-10 sm:mt-14">
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">
                  {settings?.uiPopularTitle || "Popular Products"}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
                  {popularProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </section>
            ) : null;

          case "bestSellers":
            if (!productsLoaded) return null;
            return bestSellers.length > 0 ? (
              <section key={key} className="mt-10 sm:mt-14 mb-10 sm:mb-14">
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">
                  {(settings?.homeBestSellersTitle || "Best Selling Products").toUpperCase()}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
                  {bestSellers.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </section>
            ) : null;

          default:
            return null;
        }
        })();
        // The first section sits above the fold: no fade/slide-in, it must be
        // visible the instant it renders. Later sections still reveal on scroll.
        if (key === "collectionsGrid") return node;
        return node ? <Reveal key={key}>{node}</Reveal> : null;
      })}
    </div>
    </>
  );
}
