import { Routes, Route, useLocation, Navigate } from "react-router";
import { useEffect, useState, useRef, Suspense, lazy, type ReactNode } from "react";
import Navbar from "./components/Navbar";
import AnnouncementBar from "./components/AnnouncementBar";
import OfferTimerBar from "./components/OfferTimerBar";
import OfferSavedPopup from "./components/OfferSavedPopup";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
// Home / Collection / Product stay eager — they're the pages people land on
// from search results, so they should paint with zero extra JS round-trips.
import Home from "./pages/Home";
import CollectionPage from "./pages/CollectionPage";
import ProductPage from "./pages/ProductPage";
// Everything below is lazy-loaded: each becomes its own small chunk that's
// only downloaded when a visitor actually navigates there, instead of being
// bundled into the initial page load for every single visitor.
const CartPage = lazy(() => import("./pages/CartPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderConfirmedPage = lazy(() =>
  import("./pages/OrderPages").then((m) => ({ default: m.OrderConfirmedPage }))
);
const TrackOrderPage = lazy(() =>
  import("./pages/OrderPages").then((m) => ({ default: m.TrackOrderPage }))
);
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));

// Guards /admin/dashboard (and any other /admin/* path). Checked synchronously
// during render so no dashboard content or data-fetching child components ever
// mount before we know a token exists — the old useEffect+navigate() check in
// AdminDashboard let the page paint (and its child tabs start fetching) for a
// frame before redirecting, which is the bypass that was reported.
function RequireAdminAuth({ children }: { children: ReactNode }) {
  const hasToken = !!sessionStorage.getItem("3dcasemakers_admin_token");
  if (!hasToken) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
import MobileBottomNav from "./components/MobileBottomNav";
import { api } from "./utils/api";
import { getSessionId } from "./utils/session";
import { applyTheme, PAGE_TRANSITIONS } from "./utils/theme";
import { useCart } from "./context/CartContext";
import { Collection } from "./types";
import { initMetaPixel, trackPageView } from "./utils/metaPixel";

// Fix: React Router doesn't reset scroll position on navigation by default,
// so clicking a product/collection/link from partway down a page used to
// land you at the same scroll offset instead of the top of the new page.
function useScrollToTopOnNavigate() {
  const location = useLocation();
  useEffect(() => {
    // If navigating to a real in-page anchor (e.g. /#faq), let the browser
    // jump to that section instead of forcing the top.
    if (location.hash) return;
    // Run after the new route has painted so a later content/image load on
    // the new page can't leave the viewport looking scrolled.
    const raf = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
    return () => cancelAnimationFrame(raf);
  }, [location.pathname, location.hash]);
}

// Removed: this used to artificially slow down mobile touch-scroll by
// intercepting touchmove and re-driving scrollBy at a reduced speed. It made
// scrolling feel laggy/heavy on phones, so normal native scrolling is used
// instead now.

// Tracks the visitor's most recent touch/scroll/click/keyboard interaction.
// Paired with useStorefrontHeartbeat below: once 7+ seconds pass with zero
// interaction, heartbeats stop going out, so the session's last_seen in the
// DB goes stale and the admin's Live Activity panel (which only shows
// visitors seen in the last 7 seconds — see backend analytics.js) correctly
// drops them as offline, even if the tab is still open on-screen.
const ACTIVITY_EVENTS = ["scroll", "touchstart", "touchmove", "mousemove", "click", "keydown", "wheel"] as const;
const IDLE_THRESHOLD_MS = 7000;

// Navbar is a fixed 68px, but OfferTimerBar's height isn't fixed - it wraps
// to 2 lines on narrow screens / long offer text. Guessing its height with a
// hardcoded margin (old approach) drifts out of sync and lets the
// AnnouncementBar / banners underneath slide up and overlap it. This measures
// the bar's *actual* rendered height and keeps that in sync live, so the
// layout spacer below it is always exactly right - nothing overlaps, ever.
function useOfferTimerBarHeight(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!active) {
      setHeight(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  return { ref, height };
}

function useActivityTracker() {
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const mark = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
  }, []);
  return lastActivityRef;
}

// Silent visitor heartbeat - powers the admin panel's Live Visitors view.
// No UI on the storefront itself (the old floating counter was removed).
function useStorefrontHeartbeat() {
  const { count } = useCart();
  const location = useLocation();
  const lastActivityRef = useActivityTracker();
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    const sessionId = getSessionId();
    // Landing on a new page counts as activity too — otherwise someone who
    // just clicked a link and hasn't touched the screen yet would look
    // "offline" the instant the new page loads.
    lastActivityRef.current = Date.now();
    const beat = () => {
      api.post("/api/analytics/heartbeat", {
        sessionId,
        page: location.pathname,
        cartCount: count,
        pageLabel: document.title || null,
        // document.referrer only reflects how the browser actually arrived at
        // the site (external search engine, Instagram bio link, etc.) — it
        // doesn't change on in-app SPA navigation, so this always captures
        // the visitor's true entry source for the day.
        referrer: document.referrer || "",
      }).catch(() => {});
    };
    beat();
    // Tick frequently (well under the 7s idle threshold) so last_seen stays
    // fresh while active, but only actually send when there's been real
    // interaction recently — an idle tab simply stops beating and ages out.
    const iv = setInterval(() => {
      if (Date.now() - lastActivityRef.current <= IDLE_THRESHOLD_MS) beat();
    }, 3000);
    return () => clearInterval(iv);
  }, [location.pathname, count]);
}

// Meta Pixel — boots once with whatever Pixel ID is saved in Admin -> Settings
// -> Meta Ads, then fires a PageView on every storefront route change. Never
// runs on /admin routes.
function useMetaPixelTracking() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    initMetaPixel();
  }, []);
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    trackPageView();
  }, [location.pathname]);
}

export default function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settings, setSettings] = useState<any>({});
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  useStorefrontHeartbeat();
  useScrollToTopOnNavigate();
  useMetaPixelTracking();
  // (mobile scroll slowdown removed)

  useEffect(() => {
    api.get("/api/collections").then((c) => setCollections(c.filter((x: Collection) => x.isVisible))).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  // Re-theme the whole storefront the moment settings arrive/change, so an
  // admin's saved brand color takes effect without a code deploy.
  useEffect(() => {
    applyTheme(settings);
  }, [
    settings?.themePrimaryColor,
    settings?.themeButtonShape,
    settings?.themeFont,
    settings?.themeFontSize,
    settings?.themeMobileNavBg,
    settings?.themeMobileNavText,
    settings?.themeMobileNavActive,
  ]);

  // WhatsApp floating button: shown on all storefront pages. Can be switched
  // off site-wide from Admin -> Settings -> Website Widgets.
  const path = location.pathname;
  const isHome = path === "/";
  const isCollectionsPage = path === "/collections" || path.startsWith("/collections/");
  const isProductPage = path.startsWith("/product/");
  // Announcement bar: Home & Collections pages. (Mobile bottom nav flag is
  // set below, separately — it now shows on every page except Cart & Checkout.)
  const showAnnouncementBar = isHome || isCollectionsPage;
  // Offer timer bar (Admin -> Discounts): Home, Collections & Product pages.
  const showOfferTimerBar = isHome || isCollectionsPage || isProductPage;
  const { ref: offerTimerBarRef, height: offerTimerBarHeight } = useOfferTimerBarHeight(showOfferTimerBar);
  // Mobile bottom nav: every storefront page EXCEPT cart & checkout (those
  // have their own full-width bottom action bar / payment flow, so the tab
  // bar would just get in the way there).
  const isCartPage = path === "/cart";
  const isCheckoutPage = path === "/checkout";
  const showBottomNav = !isCartPage && !isCheckoutPage;
  // Collections listing keeps just: top navbar, banner, collection name, products.
  // No footer there (no announcement bar either) — but the mobile bottom nav
  // still shows here like on every other non-cart/checkout page.
  const showFooter = !isCollectionsPage;
  const showWhatsApp = settings.whatsappFloatingEnabled !== false;

  // Page transition: admin-picked animation (Admin -> Themes -> Page Transition).
  // <main> remounts on every route change via key={location.pathname}, which
  // re-triggers the CSS "enter" keyframe animation automatically.
  const transitionClass =
    PAGE_TRANSITIONS.find((t) => t.key === (settings.pageTransition || "slide-up"))?.className || "";

  // Admin panel renders standalone - no storefront navbar/footer/cart wrapping it,
  // and always accessible even while Maintenance Mode is on for visitors.
  if (isAdminRoute) {
    return (
      <>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<RequireAdminAuth><AdminDashboard /></RequireAdminAuth>} />
            {/* Any other /admin/* path (typos, old bookmarks, /admin itself) lands on the dashboard,
                guarded the same way - redirects to login if there's no saved token instead of a blank page. */}
            <Route path="/admin" element={<RequireAdminAuth><AdminDashboard /></RequireAdminAuth>} />
            <Route path="/admin/*" element={<RequireAdminAuth><AdminDashboard /></RequireAdminAuth>} />
          </Routes>
        </Suspense>
      </>
    );
  }

  // Maintenance Mode: block the entire public storefront behind a simple notice page.
  if (settings.maintenanceMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight mb-3">We'll be right back</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            {settings.maintenanceMessage || "We're upgrading 3DCaseMakers right now. Back shortly — thanks for your patience!"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${showBottomNav ? "pb-16 lg:pb-0" : ""}`}>
      <Navbar collections={collections} />
      {showOfferTimerBar && <OfferTimerBar ref={offerTimerBarRef} />}
      {/* Navbar + OfferTimerBar are fixed to the viewport (mobile browsers can break
          position:sticky when an ancestor has overflow-x hidden), so this spacer
          reserves the same space in normal flow to stop content sliding under
          them. Its height is the real, live-measured height of both bars -
          never a guess - so AnnouncementBar/banners can never overlap them,
          even when the timer bar wraps to 2 lines. */}
      <div style={{ height: 68 + offerTimerBarHeight }} />
      {showAnnouncementBar && <AnnouncementBar />}
      <main className={`flex-1 ${transitionClass}`} key={location.pathname}>
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<CollectionPage />} />
          <Route path="/collections/:slug" element={<CollectionPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmed/:id" element={<OrderConfirmedPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/faqs" element={<FAQPage />} />
          <Route path="/faqs/:category" element={<FAQPage />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/policy/:slug" element={<PolicyPage />} />
          {/* Unknown storefront URL -> Home, instead of a blank page */}
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </main>
      {showFooter && <Footer collections={collections} />}
      <OfferSavedPopup />
      {showWhatsApp && <WhatsAppButton hasBottomNav={showBottomNav} />}
      {showBottomNav && <MobileBottomNav />}
    </div>
  );
}
