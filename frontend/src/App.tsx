import { Routes, Route, useLocation, useNavigationType, Navigate } from "react-router";
import { useEffect, useLayoutEffect, useState, useRef, useCallback, Suspense, lazy, type ReactNode } from "react";
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
const PaymentResultPage = lazy(() => import("./pages/PaymentResultPage"));
const DirectUpiPaymentPage = lazy(() => import("./pages/DirectUpiPaymentPage"));
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
// True when a JWT's `exp` claim is in the past (or the token is malformed).
// The signature is still verified server-side on every request — this only
// avoids rendering the dashboard with a token we already know is dead.
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function RequireAdminAuth({ children }: { children: ReactNode }) {
  const token = sessionStorage.getItem("3dcasemakers_admin_token");
  if (!token || isTokenExpired(token)) {
    sessionStorage.removeItem("3dcasemakers_admin_token");
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

// Small "back to top" button on long storefront pages (Admin -> Customize).
function BackToTopButton({ raised }: { raised: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed left-4 ${raised ? "bottom-24 lg:bottom-6" : "bottom-6"} z-30 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-zinc-200 shadow-lg text-zinc-800 flex items-center justify-center hover:bg-white`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
import MobileBottomNav from "./components/MobileBottomNav";
import { api } from "./utils/api";
import { getSessionId } from "./utils/session";
import { applyTheme, applyStorefrontCustomization, clearStorefrontCustomization, PAGE_TRANSITIONS } from "./utils/theme";
import { useCart } from "./context/CartContext";
import { Collection } from "./types";
import { initMetaPixel, trackPageView } from "./utils/metaPixel";
import { trackGooglePageView } from "./utils/googleAnalytics";
import { readCollectionView } from "./utils/collectionView";

// Every route change must land at the very top of the new page. Native
// scroll restoration is off (main.tsx), and the page-wide CSS
// `scroll-behavior: smooth` can turn a scrollTo into a slow animation that late
// layout (lazy chunks, images) interrupts, leaving the pointer parked near the
// bottom. So: scroll with smooth-scroll disabled, before paint, and re-assert
// the top briefly while the new page settles, unless the visitor starts
// scrolling themselves.
function scrollTopNow() {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  root.scrollTop = 0;
  root.style.scrollBehavior = prev;
}

function useScrollToTopOnNavigate() {
  const location = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    // Real in-page anchor (e.g. /#faq): let the browser jump to the section.
    if (location.hash) return;
    // Back to a collection the shopper had scrolled: CollectionPage restores
    // the exact position itself, so don't force it to the top.
    if (navType === "POP" && location.pathname.startsWith("/collections/")) {
      const saved = readCollectionView(decodeURIComponent(location.pathname.slice("/collections/".length).split("/")[0]));
      if (saved && saved.scrollY > 0) return;
    }
    scrollTopNow();
    let userScrolled = false;
    const stop = () => { userScrolled = true; };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    const again = () => { if (!userScrolled && window.scrollY !== 0) scrollTopNow(); };
    const raf = requestAnimationFrame(again);
    const timers = [60, 200, 500].map((ms) => window.setTimeout(again, ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
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
// visitors seen in the last 30 seconds — see backend analytics.js) correctly
// ages them out after its short grace window, even if the tab remains open.
const ACTIVITY_EVENTS = ["scroll", "touchstart", "touchmove", "mousemove", "click", "keydown", "wheel"] as const;
const IDLE_THRESHOLD_MS = 7000;

// Navbar is a fixed 68px, but OfferTimerBar's height isn't fixed - it wraps
// to 2 lines on narrow screens / long offer text. Guessing its height with a
// hardcoded margin (old approach) drifts out of sync and lets the
// AnnouncementBar / banners underneath slide up and overlap it. This measures
// the bar's *actual* rendered height and keeps that in sync live, so the
// layout spacer below it is always exactly right - nothing overlaps, ever.
function useOfferTimerBarHeight(active: boolean) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!active || !element) {
      setHeight(0);
      return;
    }
    const el = element;
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
  }, [active, element]);

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
      if (document.visibilityState !== "visible") return;
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
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastActivityRef.current = Date.now();
        beat();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    // Tick frequently (well under the 7s idle threshold) so last_seen stays
    // fresh while active, but only actually send when there's been real
    // interaction recently — an idle tab simply stops beating and ages out.
    const iv = setInterval(() => {
      if (Date.now() - lastActivityRef.current <= IDLE_THRESHOLD_MS) beat();
    }, 3000);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVisible); };
  }, [location.pathname, count]);
}

// Meta Pixel — boots once with whatever Pixel ID is saved in Admin -> Settings
// -> Meta Ads, then fires a PageView on every storefront route change. Never
// runs on /admin routes.
function useMetaPixelTracking() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith("/admin")) return;
    trackGooglePageView(location.pathname + location.search);
    let active = true;
    initMetaPixel().then((ready) => { if (active && ready) trackPageView(); });
    return () => { active = false; };
  }, [location.pathname, location.search]);
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
    let active = true;
    let refreshSequence = 0;
    const refresh = () => {
      const sequence = ++refreshSequence;
      return api.get("/api/settings").then((next) => { if (active && sequence === refreshSequence) setSettings(next); }).catch(() => {});
    };
    refresh();
    window.addEventListener("3dcasemakers:settings-updated", refresh);
    return () => { active = false; window.removeEventListener("3dcasemakers:settings-updated", refresh); };
  }, [isAdminRoute]);

  // Re-theme the whole storefront the moment settings arrive/change, so an
  // admin's saved brand color takes effect without a code deploy.
  useEffect(() => {
    applyTheme(isAdminRoute ? {} : settings);
  }, [
    settings?.themePrimaryColor,
    settings?.themeButtonShape,
    settings?.themeFont,
    settings?.themeFontSize,
    settings?.themeMobileNavBg,
    settings?.themeMobileNavText,
    settings?.themeMobileNavActive,
    isAdminRoute,
  ]);

  // Admin -> Customize: colours, corner styles and custom CSS. Never applied
  // inside the admin panel itself.
  useEffect(() => {
    if (isAdminRoute) clearStorefrontCustomization();
    else applyStorefrontCustomization(settings);
  }, [settings, isAdminRoute]);

  // WhatsApp floating button: shown on all storefront pages. Can be switched
  // off site-wide from Admin -> Settings -> Website Widgets.
  const path = location.pathname;
  const isHome = path === "/";
  const isCollectionsPage = path === "/collections" || path.startsWith("/collections/");
  const isProductPage = path.startsWith("/product/");
  // Announcement bar: Home & Collections pages. (Mobile bottom nav flag is
  // set below, separately — it shows on every page except Checkout.)
  const showAnnouncementBar = isHome || isCollectionsPage;
  // Offer timer bar (Admin -> Discounts): Home, Collections & Product pages.
  const showOfferTimerBar = isHome || isCollectionsPage || isProductPage;
  const { ref: offerTimerBarRef, height: offerTimerBarHeight } = useOfferTimerBarHeight(showOfferTimerBar);
  // Mobile bottom nav: every storefront page EXCEPT checkout (payment flow).
  // The Cart page now shows it too.
  const isCheckoutPage = path === "/checkout";
  const showBottomNav = !isCheckoutPage;
  // Collections listing keeps just: top navbar, banner, collection name, products.
  // No footer there (no announcement bar either) — but the mobile bottom nav
  // still shows here like on every other non-checkout page.
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
    <div className={`min-h-screen flex flex-col ${showBottomNav ? "storefront-bottom-space lg:pb-0" : ""}`}>
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
          <Route path="/payment-result" element={<PaymentResultPage />} />
          <Route path="/payment/upi/:orderId" element={<DirectUpiPaymentPage />} />
          <Route path="/order-confirmed/:id" element={<OrderConfirmedPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/faqs" element={<FAQPage />} />
          <Route path="/faqs/:category" element={<FAQPage />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/policy/:slug" element={<PolicyPage />} />
          {/* Unknown storefront URL -> redirect Home (so the address bar isn't left on a wrong URL) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      {showFooter && <Footer collections={collections} />}
      <OfferSavedPopup />
      {showWhatsApp && <WhatsAppButton hasBottomNav={showBottomNav} />}
      {settings.uiShowBackToTop !== false && <BackToTopButton raised={showBottomNav} />}
      {showBottomNav && <MobileBottomNav />}
    </div>
  );
}
