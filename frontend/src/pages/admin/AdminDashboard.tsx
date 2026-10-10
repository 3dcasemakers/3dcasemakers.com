import { useEffect, useState, useRef, useMemo, Fragment, Component, type ReactNode, type ErrorInfo } from "react";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import { api, API_URL } from "../../utils/api";
import { defaultOffers, Offer } from "../../utils/useOffers";
import { Product, Collection, Order, Customer, Banner, Material, MATERIAL_PRICING, MATERIAL_OPTIONS, MATERIAL_SETS, MaterialSetDef, SiteReview, ProductReview, ReviewStory, CustomizationSet, CUSTOMIZATION_PRESETS, FrameSize, DEFAULT_FRAME_SIZE_LABELS, getCustomizationSets, ManualUpiPayment } from "../../types";
import { LayoutGrid, Boxes, Package, LogOut, X, LayoutDashboard, HelpCircle, Smartphone, FileText, Settings as SettingsIcon, Copy, MessageCircle, Menu, Plus, Users, Star, IndianRupee, Clock3, Eye, EyeOff, BarChart3, Download, Upload, TrendingUp, Award, Repeat, Wrench, GripVertical, Layers, Palette, Brush, Truck, Headphones, Images, Trash2, Search, ShoppingCart, ArrowDownAZ, ListFilter, Percent, Zap, RefreshCw, ChevronRight, ChevronDown, ChevronLeft, Home as HomeIcon, TrendingUp as GrowthIcon, Store, Grid3x3, PieChart, Bell, PenSquare, Camera, PlayCircle, Heart, MoreHorizontal, SlidersHorizontal, Columns3, Globe, CreditCard, PanelLeftClose, PanelLeftOpen, Mail, List, Check, CheckCircle2, AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";
import { DEFAULT_BRAND_MODELS } from "../../utils/brandModels";
import { AdminToastProvider, useToast } from "../../context/AdminToastContext";
import BrandLogo from "../../components/BrandLogo";
import { DEFAULT_HOME_SECTIONS, HOME_SECTION_LABELS, DEFAULT_FEATURE_BAR, FEATURE_BAR_ICON_MAP, HOME_PRODUCTS_MIN, HOME_PRODUCTS_MAX, HOME_NEW_ARRIVAL_MIN, HOME_NEW_ARRIVAL_MAX, mergeHomeSectionOrder } from "../Home";
import { Testimonial } from "../../components/CustomerReviews";
import ImageCropModal from "../../components/admin/ImageCropModal";
import DragReorderList from "../../components/admin/DragReorderList";
import { sortForCollection } from "../../utils/collectionOrder";
import { applyTheme, PAGE_TRANSITIONS } from "../../utils/theme";
import { collectionProductTitle, defaultProductCollection, rememberProductCollection, titleAfterCollectionChange } from "../../utils/productDefaults";
import { saveChangedSettings, saveSettingsPatch, settingsChanges } from "../../components/admin/settingsPersistence";
import { REPORT_PERIODS, ExportData, exportSalesExcel, exportCustomerExcel } from "../../utils/reportExport";
import { defaultShippingZones, DEFAULT_FALLBACK_SHIPPING_RATE, ShippingZone, ALL_INDIAN_STATES } from "../../utils/shippingZones";
import { WA_ORDER_TEMPLATE_KEYS, WA_DEFAULT_TEMPLATES, fillOrderTemplate, toWhatsAppNumber } from "../../utils/whatsapp";

const TABS = ["Overview", "Growth", "Visitors", "Live", "Reports", "Analytics", "Gmail Manager", "Orders", "Payment Verification", "Customers", "Abandoned Checkouts", "Products", "Pricing", "Material Details", "Collections", "Phone Models", "Variant Options", "Content", "Customize", "Home Page", "Website Content", "Discounts", "Reviews", "Themes", "FAQs", "Queries", "File Manager", "Settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, any> = {
  Overview: LayoutDashboard,
  Growth: GrowthIcon,
  Content: FileText,
  Customize: SlidersHorizontal,
  Visitors: Eye,
  Live: Globe,
  Reports: BarChart3,
  Analytics: PieChart,
  "Gmail Manager": Mail,
  Orders: Package,
  "Payment Verification": CreditCard,
  Customers: Users,
  "Abandoned Checkouts": ShoppingCart,
  Products: Boxes,
  Pricing: IndianRupee,
  "Material Details": FileText,
  Collections: Layers,
  "Phone Models": Smartphone,
  "Variant Options": ListFilter,
  "Home Page": LayoutGrid,
  "Website Content": FileText,
  Discounts: Percent,
  Reviews: Star,
  Themes: Brush,
  FAQs: HelpCircle,
  Queries: MessageCircle,
  "File Manager": Images,
  Settings: Wrench,
};

// Sidebar mirrors the real Shopify admin nav tree exactly: a flat list of
// top-level items, some of which expand to reveal sub-tools beneath them.
// This keeps every one of our existing tabs reachable while looking/behaving
// like the reference screenshots (Home, Orders > Abandoned checkouts,
// Products > Pricing/Collections/etc., Content > Home Page/Reviews/etc.).
type NavLeaf = { kind: "tab"; tab: Tab; label?: string };
type NavNode = {
  label: string;
  icon: any;
  tab?: Tab; // clicking the parent row itself navigates here (if set)
  children?: NavLeaf[];
};
const NAV_TREE: NavNode[] = [
  { label: "Home", icon: HomeIcon, tab: "Overview" },
  {
    label: "Orders",
    icon: Package,
    tab: "Orders",
    children: [
      { kind: "tab", tab: "Payment Verification", label: "Payment Verification" },
      { kind: "tab", tab: "Abandoned Checkouts", label: "Abandoned checkouts" },
    ],
  },
  {
    label: "Products",
    icon: Boxes,
    tab: "Products",
    children: [
      { kind: "tab", tab: "Pricing" },
      { kind: "tab", tab: "Material Details" },
      { kind: "tab", tab: "Collections" },
      { kind: "tab", tab: "Phone Models" },
      { kind: "tab", tab: "Variant Options" },
    ],
  },
  { label: "Customers", icon: Users, tab: "Customers" },
  { label: "Queries", icon: MessageCircle, tab: "Queries" },
  {
    label: "Growth",
    icon: GrowthIcon,
    tab: "Growth",
    children: [
      { kind: "tab", tab: "Visitors", label: "Attribution" },
      { kind: "tab", tab: "Live", label: "Live View" },
      { kind: "tab", tab: "Reports", label: "Reports" },
    ],
  },
  { label: "Discounts", icon: Percent, tab: "Discounts" },
  {
    label: "Content",
    icon: FileText,
    tab: "Content",
    children: [
      { kind: "tab", tab: "Customize", label: "Customize Store" },
      { kind: "tab", tab: "Home Page" },
      { kind: "tab", tab: "Website Content" },
      { kind: "tab", tab: "Reviews" },
      { kind: "tab", tab: "Themes" },
      { kind: "tab", tab: "FAQs" },
      { kind: "tab", tab: "File Manager" },
    ],
  },
  { label: "Analytics", icon: PieChart, tab: "Analytics" },
  { label: "Gmail Manager", icon: Mail, tab: "Gmail Manager" },
];

const FEATURE_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: "truck", label: "Truck (shipping)" },
  { key: "shield", label: "Shield (quality/security)" },
  { key: "headphones", label: "Headphones (support)" },
  { key: "star", label: "Star (rating)" },
  { key: "award", label: "Award (badge)" },
  { key: "package", label: "Package (order)" },
  { key: "clock", label: "Clock (fast dispatch)" },
  { key: "message", label: "Message (chat/support)" },
  { key: "users", label: "Users (customers)" },
  { key: "rupee", label: "Rupee (payment)" },
];

// feature: live order notification bell (polls unseen count, badges Orders nav)
// Red dot on the Orders sidebar tab: stays lit as long as at least one order
// is still "pending" — it only goes away once each order is moved to
// Processing (or further), not just because the admin opened the tab.
// Plays a short "new order" chime. Browsers block audio autoplay until the
// user has interacted with the page at least once, so we lazily create the
// Audio element and just swallow the (harmless) rejected-promise error on
// the very first attempt before any click has happened.
let orderSoundEl: HTMLAudioElement | null = null;
function playOrderNotificationSound() {
  try {
    if (!orderSoundEl) {
      orderSoundEl = new Audio("/sounds/order-notification.mp3");
      orderSoundEl.volume = 1;
    }
    orderSoundEl.currentTime = 0;
    void orderSoundEl.play().catch(() => {
      /* autoplay blocked until admin interacts with the page once - safe to ignore */
    });
  } catch {
    /* ignore - non-critical UX feature */
  }
}

function usePendingOrdersCount() {
  const [pending, setPending] = useState(0);
  const prevPendingRef = useRef<number | null>(null);

  const refresh = async () => {
    try {
      const r = await api.getAuth("/api/orders/notifications/unseen-count");
      const count = r?.count || 0;
      setPending(count);

      const prev = prevPendingRef.current;
      // Only chime once we know the previous count (skip the very first
      // load) and the count went UP, meaning a new order came in.
      if (prev !== null && count > prev) {
        playOrderNotificationSound();
      }
      prevPendingRef.current = count;
    } catch {
      /* silent - admin may be mid-login */
    }
  };

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 20000); // poll every 20s
    return () => clearInterval(iv);
  }, []);

  return pending;
}

function usePendingVerificationCount() {
  const [pending, setPending] = useState(0);

  const refresh = async () => {
    try {
      const r = await api.getAuth("/api/payments/manual-upi/admin/pending-count");
      setPending(r?.count || 0);
    } catch {
      /* silent - admin may be mid-login */
    }
  };

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 15000); // poll every 15s
    return () => clearInterval(iv);
  }, []);

  return { pending, refresh };
}

// One tab throwing during render (e.g. an API returned an unexpected shape)
// used to unmount the ENTIRE admin panel into a blank white screen. Each tab
// is now wrapped in this boundary, so a failure is contained to that tab
// with a readable message + retry, and the sidebar keeps working.
class TabErrorBoundary extends Component<{ children: ReactNode; tab: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[admin] "${this.props.tab}" tab crashed:`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bg-white border border-[#e1e3e5] rounded-xl p-6 text-center max-w-lg mx-auto mt-6">
        <p className="text-sm font-bold text-[#202223]">This section couldn't load</p>
        <p className="text-xs text-[#6d7175] mt-1.5 break-words">{this.state.error.message}</p>
        <p className="text-[11px] text-[#8c9196] mt-1">Usually the server returned unexpected data or is offline. Other sections still work.</p>
        <button type="button"
          onClick={() => this.setState({ error: null })}
          className="btn-liquid-dark text-white px-4 py-2 rounded-lg text-sm font-semibold mt-4"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default function AdminDashboard() {
  return (
    <AdminToastProvider>
      <AdminDashboardInner />
    </AdminToastProvider>
  );
}

// The open tab lives in the URL hash (#Orders, #Products...) so a refresh,
// the browser back button, or a shared link lands on the same screen instead
// of always bouncing back to Overview.
function tabFromHash(): Tab {
  try {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    return (TABS as readonly string[]).includes(h) ? (h as Tab) : "Overview";
  } catch {
    return "Overview";
  }
}

function AdminDashboardInner() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const { showToast } = useToast();

  useEffect(() => {
    const want = `#${encodeURIComponent(tab)}`;
    if (window.location.hash !== want) window.history.pushState(null, "", want);
  }, [tab]);
  useEffect(() => {
    const onPop = () => setTab(tabFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Safety net: many save/delete handlers across the tabs only had
  // try/finally (no catch), so a failed request did nothing visible — the
  // button just looked "broken". Any such uncaught failure now surfaces as
  // an error toast with the server's message.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = (e.reason && (e.reason.message || String(e.reason))) || "Something went wrong";
      if (/abort/i.test(msg)) return;
      showToast(msg, "error");
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [showToast]);

  // Scroll the content column back to the top whenever the tab changes.
  const mainScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Dark mode option was removed from Settings — always render light. (Hook
  // kept so any stale "1" in localStorage from before this change is simply
  // ignored rather than causing a dark flash.)
  const darkMode = false;
  // Desktop-only sidebar collapse (icon rail). Persisted so it survives
  // refreshes/tab switches; mobile drawer is unaffected by this.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("3dcasemakers_admin_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("3dcasemakers_admin_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore (e.g. private browsing storage restrictions)
    }
  }, [sidebarCollapsed]);
  // Sliding "liquid glass" indicator behind the active icon on the mobile
  // bottom tab bar — measures the active button's real on-screen position
  // so the highlight glides to it (spring easing) instead of the icon just
  // flashing white in place. Same measure-and-slide technique as LiquidPillGroup.
  const bottomNavTrackRef = useRef<HTMLDivElement>(null);
  const bottomNavBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bottomNavIndicator, setBottomNavIndicator] = useState<{ left: number; width: number; ready: boolean }>({ left: 0, width: 0, ready: false });
  // which top-level nav rows are expanded — Shopify keeps a node open once
  // you're viewing one of its children, and lets you toggle others by hand.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Quick "find a tool/setting" filter at the top of the sidebar — matches
  // against both the top-level label and every child/sub-tool label, so
  // typing e.g. "faq" or "pricing" jumps straight to it without having to
  // know which parent section it lives under.
  const [navFilter, setNavFilter] = useState("");
  const navigate = useNavigate();
  const pendingOrders = usePendingOrdersCount();
  const { pending: pendingVerifications, refresh: refreshPendingVerifications } = usePendingVerificationCount();

  // Auth is now enforced by RequireAdminAuth in App.tsx *before* this component
  // ever mounts, so no separate check is needed here.

  const logout = () => {
    sessionStorage.removeItem("3dcasemakers_admin_token");
    navigate("/admin/login");
  };

  const selectTab = (t: Tab) => {
    setTab(t);
    setSidebarOpen(false);
  };

  // Measure + re-measure the active bottom-nav button whenever the active
  // tab changes or the track resizes (e.g. orientation change), so the
  // sliding indicator always sits exactly behind the current icon.
  const measureBottomNav = () => {
    const el = bottomNavBtnRefs.current[tab];
    const track = bottomNavTrackRef.current;
    if (el && track) {
      setBottomNavIndicator({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    }
    else setBottomNavIndicator((p) => ({ ...p, ready: false })); // current tab isn't in the bottom bar
  };
  useEffect(() => {
    measureBottomNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    const track = bottomNavTrackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(measureBottomNav);
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeContainsActiveTab = (node: NavNode) => node.tab === tab || !!node.children?.some((c) => c.tab === tab);

  // Filtered nav tree — when navFilter is non-empty, keep only nodes whose
  // own label matches OR that have at least one matching child, and trim
  // children down to just the matches (so "reviews" surfaces Content ->
  // Reviews without also listing every other Content sub-tool).
  const filterQuery = navFilter.trim().toLowerCase();
  const visibleNavTree: NavNode[] = !filterQuery
    ? NAV_TREE
    : NAV_TREE.map((node) => {
        const selfMatches = node.label.toLowerCase().includes(filterQuery);
        const matchingChildren = (node.children || []).filter((c) => (c.label || c.tab).toLowerCase().includes(filterQuery));
        if (selfMatches) return node;
        if (matchingChildren.length) return { ...node, children: matchingChildren };
        return null;
      }).filter((n): n is NavNode => n !== null);
  const settingsMatchesFilter = !filterQuery || "settings".includes(filterQuery);

  // NOTE: called as a plain function (SidebarContent()), not <SidebarContent />.
  // As a JSX component, its identity is a brand-new function on every render
  // of AdminDashboardInner, so React would treat it as a different component
  // type each time and remount the whole subtree — including the search
  // input below, which lost focus after every single keystroke. Calling it
  // as a function inlines its returned JSX directly into the parent, so the
  // <input> keeps its identity/focus while typing.
  // `collapsed` only ever applies to the desktop rail (the mobile drawer
  // always calls this with collapsed=false, since there's no room benefit
  // to an icon-only rail on a phone-width drawer).
  const SidebarContent = (collapsed: boolean = false) => (
    <>
      <div className="px-2.5 mb-4 md:hidden">
        <BrandLogo markClassName="h-8 w-8" textClassName="text-base" gap="gap-1.5" />
      </div>
      {!collapsed && (
        <div className="px-1 mb-2.5">
          <div className="flex items-center gap-2 bg-[#f1f1f1] rounded-lg px-2.5 py-1.5">
            <Search size={14} className="text-[#8c9196] shrink-0" />
            <input
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Find a tool or setting"
              className="flex-1 min-w-0 bg-transparent text-xs font-medium text-[#202223] placeholder:text-[#8c9196] outline-none"
            />
            {navFilter && (
              <button type="button" onClick={() => setNavFilter("")} className="shrink-0 text-[#8c9196] hover:text-[#202223]">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      <nav className={`flex-1 space-y-0.5 overflow-y-auto admin-sidebar-scroll ${collapsed ? "overflow-x-hidden" : ""}`}>
        {!collapsed && visibleNavTree.length === 0 && (
          <p className="text-xs text-[#8c9196] px-3.5 py-2">No tools match "{navFilter}"</p>
        )}
        {visibleNavTree.map((node) => {
          const Icon = node.icon;
          const isOpen = filterQuery ? true : expanded[node.label] ?? nodeContainsActiveTab(node);
          const showBadge = node.label === "Orders" && (pendingOrders > 0 || pendingVerifications > 0);

          if (collapsed) {
            // Icon-only rail: a node with children jumps straight to its
            // first child on click (there's no room for a flyout here),
            // so every icon stays a single, predictable click.
            const active = node.tab === tab || nodeContainsActiveTab(node);
            return (
              <button type="button"
                key={node.label}
                onClick={() => selectTab(node.tab ?? node.children?.[0]?.tab ?? node.label as Tab)}
                title={node.label}
                aria-label={node.label}
                className={`group relative w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                  active ? "bg-[#1a1a1a] text-white" : "text-[#494c50] hover:bg-[#e9e9e9]"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={18} strokeWidth={2} />
                  {showBadge && <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-500" />}
                </span>
              </button>
            );
          }

          return (
            <div key={node.label}>
              <div className="flex items-stretch">
                <button type="button"
                  onClick={() => (node.tab ? selectTab(node.tab) : setExpanded((e) => ({ ...e, [node.label]: !isOpen })))}
                  className={`group relative flex-1 flex items-center gap-3 pl-3.5 pr-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                    node.tab === tab ? "bg-[#1a1a1a] text-white" : "text-[#494c50] hover:bg-[#e9e9e9]"
                  }`}
                >
                  <span className="relative shrink-0">
                    <Icon size={17} strokeWidth={2} />
                    {showBadge && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />}
                  </span>
                  <span className="truncate">{node.label}</span>
                  {node.label === "Orders" && (pendingOrders > 0 || pendingVerifications > 0) && (
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold ${node.tab === tab ? "bg-white text-black" : "bg-amber-500 text-white"}`}>
                      {pendingVerifications > 0 ? `${pendingVerifications} verify` : pendingOrders}
                    </span>
                  )}
                </button>
                {node.children && (
                  <button type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [node.label]: !isOpen }))}
                    className="shrink-0 w-7 flex items-center justify-center text-[#8c9196] hover:text-[#202223]"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>
              {node.children && isOpen && (
                <div className="mt-0.5 ml-[22px] pl-3 border-l border-[#e1e3e5] space-y-0.5">
                  {node.children.map((c) => {
                    const active = c.tab === tab;
                    const isPV = c.tab === "Payment Verification";
                    return (
                      <button type="button"
                        key={c.tab}
                        onClick={() => selectTab(c.tab)}
                        className={`w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors truncate ${
                          active ? "bg-[#1a1a1a] text-white" : "text-[#494c50] hover:bg-[#e9e9e9]"
                        }`}
                      >
                        <span className="truncate">{c.label || c.tab}</span>
                        {isPV && pendingVerifications > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${active ? "bg-white text-black" : "bg-amber-500 text-white"}`}>
                            {pendingVerifications}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className={`pt-3 mt-3 border-t border-[#e1e3e5] ${collapsed ? "flex flex-col items-center gap-0.5" : ""}`}>
        {settingsMatchesFilter && (
          <button type="button"
            onClick={() => selectTab("Settings")}
            title={collapsed ? "Settings" : undefined}
            aria-label="Settings"
            className={`${collapsed ? "w-full flex items-center justify-center py-2.5" : "w-full flex items-center gap-3 pl-3.5 pr-3 py-2"} rounded-lg text-sm font-medium transition-colors ${
              tab === "Settings" ? "bg-[#1a1a1a] text-white" : "text-[#494c50] hover:bg-[#e9e9e9]"
            }`}
          >
            <Wrench size={collapsed ? 18 : 17} /> {!collapsed && "Settings"}
          </button>
        )}
        <button type="button"
          onClick={logout}
          title={collapsed ? "Log out" : undefined}
          aria-label="Log out"
          className={`${collapsed ? "w-full flex items-center justify-center py-2.5" : "w-full flex items-center gap-3 pl-3.5 pr-3 py-2"} rounded-lg text-sm font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-colors`}
        >
          <LogOut size={collapsed ? 18 : 17} /> {!collapsed && "Log out"}
        </button>
      </div>
    </>
  );

  return (
    <div className={`admin-glass h-[100dvh] flex flex-col w-full overflow-hidden bg-white ${darkMode ? "admin-dark" : ""}`}>
      <div className="flex-1 flex w-full min-h-0">
        {/* Sidebar - desktop: fixed height, own scroll, never moves while page content scrolls.
           Collapses to a narrow icon rail (w-16) via sidebarCollapsed, persisted per-browser. */}
        <aside
          className={`admin-glass-sidebar shrink-0 bg-white py-4 hidden md:flex flex-col h-full border-r border-[#e1e3e5] relative transition-[width] duration-200 ${
            sidebarCollapsed ? "w-16 px-2" : "w-60 px-2.5"
          }`}
        >
          {/* Toggle now sits in normal document flow as its own header row
             instead of being absolutely positioned/half-overlapping the
             sidebar edge — that approach kept drifting (it depended on a
             fragile negative-margin trick and a magic top offset that broke
             across states/zoom levels, landing on top of the search box
             instead of the sidebar edge). A plain flow row is guaranteed to
             sit above everything else and never overlap sidebar content:
             right-aligned when expanded, centered above the icon rail when
             collapsed. */}
          <div className={`flex mb-2 px-0.5 ${sidebarCollapsed ? "justify-center" : "justify-end"}`}>
            <button type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="admin-sidebar-toggle group w-7 h-7 rounded-full btn-liquid-dark flex items-center justify-center shrink-0 active:scale-90"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={14} strokeWidth={2.25} className="text-white/90 group-hover:text-white transition-colors" />
              ) : (
                <PanelLeftClose size={14} strokeWidth={2.25} className="text-white/90 group-hover:text-white transition-colors" />
              )}
            </button>
          </div>
          {SidebarContent(sidebarCollapsed)}
        </aside>

        {/* Sidebar - mobile drawer — near-opaque glass (not the lighter
           translucent sidebar tint) so page content behind it never bleeds
           through and reads as overlapping text on small screens. */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="side-menu-backdrop absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <aside className="side-menu-panel admin-glass-sidebar admin-mobile-drawer relative w-72 max-w-[82vw] bg-white h-full py-6 px-3 flex flex-col shadow-2xl">
              <button type="button" onClick={() => setSidebarOpen(false)} className="absolute top-6 right-3 p-1 text-zinc-400 hover:text-zinc-700">
                <X size={20} />
              </button>
              {SidebarContent()}
            </aside>
          </div>
        )}

        {/* Main column - only this scrolls */}
        <div ref={mainScrollRef} className="admin-glass-main flex-1 min-w-0 flex flex-col overflow-y-auto overflow-x-hidden bg-[#f1f1f1]">
          {/* Page title bar. On phones it doubles as the app header (menu
             button + title + page actions), replacing the old floating menu
             button that sat on top of page content. On desktop it's hidden
             for Overview, which renders its own "Home" heading. */}
          <div className={`admin-topbar sticky top-0 z-20 px-3 md:px-6 py-2.5 md:pt-5 md:pb-3.5 mb-1 flex items-center justify-between gap-3 border-b ${tab === "Overview" ? "md:hidden" : ""}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <button type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden shrink-0 w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-white"
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-bold text-[#202223] truncate leading-tight">{tab === "Overview" ? "Home" : tab}</h2>
                {(() => {
                  const parent = NAV_TREE.find((n) => n.children?.some((c) => c.tab === tab));
                  return parent ? <p className="text-[11px] text-[#6d7175] font-medium truncate">{parent.label} › {parent.children?.find((c) => c.tab === tab)?.label || tab}</p> : null;
                })()}
              </div>
            </div>
            {tab === "Products" && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className={btnPrimary} onClick={() => productsTabActions.openNew?.()}>Add product</button>
              </div>
            )}
            {tab === "Discounts" && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className={btnPrimary} onClick={() => discountsTabActions.addOffer?.()}>Create discount</button>
              </div>
            )}
            {tab === "Customers" && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className={btnSecondary} onClick={() => customersTabActions.exportExcel?.()}>Export</button>
              </div>
            )}
            {tab === "Analytics" && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className={btnSecondary} onClick={() => analyticsTabActions.exportCSV?.()}>Export CSV</button>
              </div>
            )}
            {tab === "Payment Verification" && (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className={btnSecondary} onClick={() => selectTab("Settings")}>Payment Settings</button>
              </div>
            )}
          </div>

          {/* Content */}
          <main className={`flex-1 w-full px-3 md:px-6 pb-28 md:pb-8 max-w-[1800px] mx-auto ${tab === "Overview" ? "pt-3 md:pt-5" : "py-4"}`}>
          <TabErrorBoundary key={tab} tab={tab}>
          {tab === "Overview" && <DashboardTab onSelectTab={selectTab} pendingVerifications={pendingVerifications} />}
          {tab === "Growth" && <GrowthTab />}
          {tab === "Visitors" && <VisitorsTab />}
          {tab === "Live" && <LiveTab />}
          {tab === "Reports" && <ReportsTab />}
          {tab === "Analytics" && <AnalyticsTab />}
          {tab === "Gmail Manager" && <GmailManagerTab />}
          {tab === "Orders" && <OrdersTab onSelectTab={selectTab} />}
          {tab === "Payment Verification" && <PaymentVerificationTab onSelectTab={selectTab} onUpdated={refreshPendingVerifications} />}
          {tab === "Customers" && <CustomersTab />}
          {tab === "Abandoned Checkouts" && <AbandonedCheckoutsTab />}
          {tab === "Products" && <ProductsTab />}
          {tab === "Pricing" && <PricingTab />}
          {tab === "Material Details" && <MaterialDetailsTab />}
          {tab === "Collections" && <CollectionsTab />}
          {tab === "Phone Models" && <PhoneModelsTab />}
          {tab === "Variant Options" && <VariantOptionsTab />}
          {tab === "Content" && <ContentTab onNavigate={selectTab} />}
          {tab === "Customize" && <CustomizeTab />}
          {tab === "Home Page" && <HomePageTab />}
          {tab === "Website Content" && <WebsiteContentIntegratedTab />}
          {tab === "Discounts" && <DiscountsTab />}
          {tab === "Reviews" && <ReviewsTab />}
          {tab === "Themes" && <ThemesTab />}
          {tab === "FAQs" && <FAQsTab />}
          {tab === "Queries" && <QueriesTab />}
          {tab === "File Manager" && <FileManagerTab />}
          {tab === "Settings" && <SettingsTab />}
          </TabErrorBoundary>
          </main>
        </div>
      </div>

      {/* Mobile floating pill tab bar — iOS 26 style, primary tabs only, rest via drawer.
         A single dark glass pill glides (spring easing) to sit behind the
         active icon, instead of the icon's background flashing in place. */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center gap-2 px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        <div
          ref={bottomNavTrackRef}
          className="relative flex-1 flex items-center gap-1 bg-white/90 backdrop-blur-2xl rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-zinc-200 px-1.5 py-1.5"
        >
          <div
            className="absolute top-1.5 bottom-1.5 !rounded-full pointer-events-none bottom-nav-indicator"
            style={{
              left: bottomNavIndicator.left,
              width: bottomNavIndicator.width,
              opacity: bottomNavIndicator.ready ? 1 : 0,
              transition: "left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease",
            }}
          />
          {(["Overview", "Products", "Orders", "Collections"] as Tab[]).map((t) => {
            const Icon = TAB_ICONS[t];
            const active = tab === t;
            const showBadge = t === "Orders" && pendingOrders > 0;
            return (
              <button type="button"
                key={t}
                ref={(el) => { bottomNavBtnRefs.current[t] = el; }}
                onClick={() => selectTab(t)}
                aria-label={t}
                className={`relative z-10 flex-1 flex items-center justify-center overflow-hidden py-2.5 rounded-full transition-transform duration-200 ${
                  active ? "" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 active:scale-90"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} className={active ? "text-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] scale-110" : "transition-transform duration-300"} />
                  {showBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="More"
          className="shrink-0 w-[46px] h-[46px] rounded-full bg-white/90 backdrop-blur-2xl text-zinc-700 border border-zinc-200 flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] active:scale-90 transition-transform duration-200"
        >
          <LayoutGrid size={19} />
        </button>
      </div>
    </div>
  );
}

// shared field classes — Shopify admin visual language (black actions, square-ish
// radii, #e1e3e5 hairline borders, #6d7175 secondary text)
const inputCls = "w-full min-w-0 bg-white border border-[#c9cccf] focus:border-[#458fff] focus:ring-2 focus:ring-[#458fff]/20 rounded-lg px-3 py-2 text-[#202223] text-sm outline-none transition-all duration-150";
const btnPrimary = "btn-liquid-dark inline-flex items-center justify-center gap-1.5 min-h-9 shrink-0 whitespace-nowrap active:scale-[0.97] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]";
const btnGhost = "text-[#3f4144] hover:text-[#202223] active:opacity-70 text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const card = "bg-white border border-[#e1e3e5] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

// Admin dark mode was removed as a Settings option. Nothing reads/writes
// ADMIN_DARK_KEY anymore; darkMode is now hardcoded false above.
// Shopify-style secondary ("More actions") button
const btnSecondary = "btn-liquid-light inline-flex items-center justify-center gap-1.5 min-h-9 shrink-0 whitespace-nowrap active:scale-[0.97] text-[#202223] px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]";
// Table shell + header + row helpers used to match Shopify's Orders/Products list look
const tableWrap = "bg-white border border-[#e1e3e5] rounded-xl overflow-hidden";
const thCls = "text-left text-[12px] font-semibold text-[#6d7175] px-4 py-3 border-b border-[#e1e3e5] whitespace-nowrap";
const tdCls = "px-4 py-3 text-sm text-[#202223] border-b border-[#f1f2f3] whitespace-nowrap";
const trHover = "hover:bg-[#f6f6f7] transition-colors duration-150 cursor-pointer";

function AdminLoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className={`${card} p-5 space-y-3`}>
      <p className="text-sm text-red-600">{message}</p>
      <button type="button" onClick={retry} className={btnSecondary}>Try again</button>
    </div>
  );
}

// Quote arbitrary customer/catalog text correctly and prevent spreadsheet
// applications interpreting an exported title or phone number as a formula.
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
// Shopify status pill colours (payment/fulfillment style badges)
function statusPill(tone: "success" | "warning" | "info" | "neutral" | "critical" = "neutral") {
  const map: Record<string, string> = {
    success: "bg-[#aee9d1] text-[#0c5132]",
    warning: "bg-[#ffd79d] text-[#8a5a00]",
    info: "bg-[#b4e1fa] text-[#08476b]",
    neutral: "bg-[#e4e5e7] text-[#3f4144]",
    critical: "bg-[#fed3d1] text-[#8e0000]",
  };
  return `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${map[tone]}`;
}
// Default description used to pre-fill every new product (matches backend fallback in products.js)
const DEFAULT_PRODUCT_DESCRIPTION =
  "Protect your phone with confidence using our Premium Mobile Case, crafted from high-quality materials for long-lasting durability. Designed with reinforced edge protection, it absorbs shocks and helps safeguard your device from accidental drops and impacts. The precise fit ensures easy access to all buttons and ports while maintaining a sleek, stylish look. Its anti-slip grip offers comfortable handling and added security in everyday use. Built for both protection and elegance, this case keeps your phone safe without compromising on style.";

// ---------------- Products ----------------
const MAX_PRODUCT_IMAGES = 5;

// Lightweight bridge so the shared page-header "Add product" button (rendered
// in AdminDashboardInner, outside ProductsTab) can open ProductsTab's own
// "new product" modal without a full prop-drilling refactor.
const productsTabActions: { openNew: (() => void) | null } = { openNew: null };

function ProductsTab() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [materialModels, setMaterialModels] = useState<Record<string, string[]>>({});
  const [variantGroups, setVariantGroups] = useState<VariantGroupRow[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // ---- Material Set flow: "Add product" now first asks which set the new
  // product belongs to (Gold Case + Gold Gel Case  /  Acrylic Case +
  // Acrylic Gel Case + Phone Skin with Transparent Case). Once a set is
  // picked, the shared fields below (title, description, collection, tags,
  // flags) are filled in ONCE, but images are uploaded separately per
  // material (2 photos each) — Save then creates one product per material
  // in that set, reusing the shared fields with that material's own images.
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [activeSet, setActiveSet] = useState<MaterialSetDef | null>(null);
  const [setImages, setSetImages] = useState<Record<string, string[]>>({});
  // Per-material title + destination collection — e.g. the Acrylic Case
  // product can be "Premium TVK Acrylic Cases" filed under the "Acrylic
  // Cases" collection, while its Gel Case sibling gets its own title and its
  // own "Acrylic Gel Cases" collection.
  const [setTitles, setSetTitles] = useState<Record<string, string>>({});
  const [setCollectionIds, setSetCollectionIds] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]); // feature 17: bulk product actions
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sectionModal, setSectionModal] = useState<"trending" | "bestSeller" | null>(null);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [autoFillBusy, setAutoFillBusy] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productView, setProductView] = useState<"list" | "grid">("list");
  const filteredProducts = products.filter((p) =>
    !productSearch.trim() || p.title.toLowerCase().includes(productSearch.trim().toLowerCase())
  );

  useEffect(() => {
    productsTabActions.openNew = () => setSetPickerOpen(true);
    return () => { productsTabActions.openNew = null; };
  }, []);

  // Admin picked a Material Set from the picker — start the shared form with
  // a blank images gallery per material in that set.
  const chooseMaterialSet = (set: MaterialSetDef) => {
    setActiveSet(set);
    setSetImages(Object.fromEntries(set.materials.map((m) => [m, []])));
    const collectionIds = Object.fromEntries(set.materials.map((m) => [m, defaultProductCollection(collections, products, m)]));
    setSetCollectionIds(collectionIds);
    setSetTitles(Object.fromEntries(set.materials.map((m) => [m, collectionProductTitle(collections, collectionIds[m])])));
    setSetPickerOpen(false);
    setEditing({ price: 0, comparePrice: 0, description: DEFAULT_PRODUCT_DESCRIPTION, images: [], models: [], tags: [] });
  };
  const closeProductModal = () => {
    setEditing(null);
    setActiveSet(null);
    setSetImages({});
    setSetTitles({});
    setSetCollectionIds({});
  };

  const changeSetCollection = (material: string, collectionId: string) => {
    const previousDefault = collectionProductTitle(collections, setCollectionIds[material]);
    const nextDefault = collectionProductTitle(collections, collectionId);
    setSetCollectionIds((s) => ({ ...s, [material]: collectionId }));
    setSetTitles((s) => ({ ...s, [material]: titleAfterCollectionChange(s[material] || "", previousDefault, nextDefault) }));
  };

  const changeProductCollection = (collectionId: string) => {
    setEditing((p) => p ? {
      ...p,
      collectionId,
      collectionIds: collectionId ? [collectionId] : [],
      title: p.id ? p.title : titleAfterCollectionChange(p.title || "", collectionProductTitle(collections, p.collectionId || ""), collectionProductTitle(collections, collectionId)),
    } : p);
  };

  // ---- Photo Frames: a separate, simpler product form (no phone models).
  // Name, image(s), collection, sizes with a manual price per size (default
  // 8x12 and 12x18), and a checkbox for "customer can upload an image".
  const FRAME_DESCRIPTION = "Turn your favourite memories into a wall-ready photo frame. Printed in vivid, long-lasting colour on premium material and framed for a clean, finished look. Available in 8x12 and 12x18 sizes.";
  const [frameEditing, setFrameEditing] = useState<Partial<Product> | null>(null);
  const [frameUploading, setFrameUploading] = useState(false);
  const [frameSaving, setFrameSaving] = useState(false);
  const [frameAllowUpload, setFrameAllowUpload] = useState(false);

  const openProductEditor = (p: Product) => {
    setActiveSet(null);
    if (p.isPhotoFrame) {
      setFrameAllowUpload(getCustomizationSets(p).some((st) => st.image));
      setFrameEditing({ ...p, frameSizes: (p.frameSizes && p.frameSizes.length ? p.frameSizes : []).map((z) => ({ ...z })) });
    } else {
      setEditing(p);
    }
  };

  const openNewFrame = () => {
    const frameCollection = collections.find((c) => c.slug === "photo-frames") || collections.find((c) => /photo\s*frame/i.test(c.name));
    setSetPickerOpen(false);
    setFrameAllowUpload(false);
    setFrameEditing({
      title: "",
      description: FRAME_DESCRIPTION,
      images: [],
      isPhotoFrame: true,
      collectionId: frameCollection?.id || "",
      collectionIds: frameCollection ? [frameCollection.id] : [],
      stockStatus: "in_stock",
      frameSizes: DEFAULT_FRAME_SIZE_LABELS.map((label) => ({ label, price: 0, comparePrice: 0 })),
    });
  };

  const setFrameSizeField = (i: number, patch: Partial<FrameSize>) => {
    setFrameEditing((p) => p ? { ...p, frameSizes: (p.frameSizes || []).map((z, idx) => (idx === i ? { ...z, ...patch } : z)) } : p);
  };

  const uploadFrameImages = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setFrameUploading(true);
    try {
      for (const file of list) {
        let full = false;
        setFrameEditing((p) => { full = (p?.images || []).length >= MAX_PRODUCT_IMAGES; return p; });
        if (full) { showToast(`Max ${MAX_PRODUCT_IMAGES} images allowed`, "error"); break; }
        try {
          const res = await api.upload(file);
          setFrameEditing((p) => p ? { ...p, images: [...(p.images || []), res.url].slice(0, MAX_PRODUCT_IMAGES) } : p);
        } catch (err: any) {
          showToast(err.message || `Upload failed for "${file.name}"`, "error");
        }
      }
    } finally {
      setFrameUploading(false);
    }
  };

  const saveFrame = async () => {
    const f = frameEditing;
    if (!f) return;
    if (!(f.title || "").trim()) { showToast("Enter the product name", "error"); return; }
    if (!f.collectionId) { showToast("Pick a collection (Photo Frames)", "error"); return; }
    if (!(f.images || []).length) { showToast("Upload at least 1 image", "error"); return; }
    const sizes = (f.frameSizes || []).filter((z) => (z.label || "").trim());
    if (!sizes.length) { showToast("Add at least one size", "error"); return; }
    const bad = sizes.find((z) => !(Number(z.price) > 0));
    if (bad) { showToast(`Enter a price for size ${bad.label}`, "error"); return; }
    const payload: any = {
      ...f,
      title: (f.title || "").trim(),
      isPhotoFrame: true,
      collectionIds: [f.collectionId],
      frameSizes: sizes.map((z) => ({ label: z.label.trim(), price: Number(z.price), comparePrice: Number(z.comparePrice) || 0 })),
      brand: "",
      material: "",
      models: [],
      // The checkbox below controls whether the customer sees an upload box.
      customization: frameAllowUpload ? { sets: [{ image: true, text: false, imageRequired: true, textRequired: false }] } : undefined,
      isCustomizable: false,
      requiresCustomerName: false,
    };
    setFrameSaving(true);
    try {
      if (f.id) await api.put(`/api/products/${f.id}`, payload);
      else await api.post("/api/products", payload, true);
      showToast(f.id ? "Photo frame updated" : "Photo frame added", "success");
      setFrameEditing(null);
      await load();
    } catch (err: any) {
      showToast(err.message || "Failed to save photo frame", "error");
    } finally {
      setFrameSaving(false);
    }
  };

  const load = async () => {
    const [p, c, s] = await Promise.all([api.get("/api/products"), api.get("/api/collections"), api.getAuth("/api/settings/admin").catch(() => null)]);
    setProducts(p);
    setCollections(c);
    // Phone models used to be scoped per Material — now every material shares
    // the same full model catalog (all phone models available for every
    // material), so we merge every material's list into one union here.
    const legacyFlat = s?.brandModels && Object.keys(s.brandModels).length ? s.brandModels : DEFAULT_BRAND_MODELS;
    const perMaterial = s?.materialBrandModels && Object.keys(s.materialBrandModels).length ? s.materialBrandModels : {};
    const unified: Record<string, string[]> = {};
    const mergeIn = (map: Record<string, string[]>) => {
      Object.entries(map || {}).forEach(([brand, models]) => {
        const existing = unified[brand] || [];
        unified[brand] = Array.from(new Set([...existing, ...(models || [])]));
      });
    };
    mergeIn(legacyFlat);
    MATERIAL_OPTIONS.forEach((m) => mergeIn(perMaterial[m] || {}));
    setMaterialModels(unified);
    setVariantGroups(Array.isArray(s?.variantGroups) ? s.variantGroups : []);
  };
  useEffect(() => { load(); }, []);

  // Brand & Model choices — the same full catalog for every material, no
  // longer scoped to whichever Material is selected on the product.
  const brandModels = materialModels;

  const save = async () => {
    if (!editing || !editing.title) return;
    setSaving(true);
    try {
      if (editing.id) await api.put(`/api/products/${editing.id}`, editing);
      else await api.post("/api/products", editing, true);
      if (!editing.id) rememberProductCollection(editing.collectionId || "", editing.material);
      showToast(editing.id ? "Product updated" : "Product added", "success");
      setEditing(null);
      await load();
    } catch (err: any) {
      showToast(err.message || "Failed to save product", "error");
    } finally {
      setSaving(false);
    }
  };

  // Creates ONE product per material in the active set, all sharing the
  // title/description/collection/tags/flags typed once above, each with its
  // own 2 uploaded images and its material's fixed pricing.
  const saveMaterialSet = async () => {
    if (!editing || !activeSet) return;
    const missingTitle = activeSet.materials.find((m) => !(setTitles[m] || "").trim());
    if (missingTitle) {
      showToast(`Enter a title for "${missingTitle}"`, "error");
      return;
    }
    const missingCollection = activeSet.materials.find((m) => !setCollectionIds[m]);
    if (missingCollection) {
      showToast(`Pick a collection for "${missingCollection}"`, "error");
      return;
    }
    const incomplete = activeSet.materials.find((m) => (setImages[m] || []).length < 1);
    if (incomplete) {
      showToast(`Upload at least 1 image for "${incomplete}"`, "error");
      return;
    }
    setSaving(true);
    try {
      const materialSetId = crypto.randomUUID();
      for (const material of activeSet.materials) {
        const pricing = MATERIAL_PRICING[material];
        const collectionId = setCollectionIds[material];
        const payload: any = {
          ...editing,
          title: setTitles[material].trim(),
          material,
          price: pricing.price,
          comparePrice: pricing.comparePrice,
          images: setImages[material],
          collectionId,
          collectionIds: [collectionId],
          materialSetId,
        };
        delete payload.id;
        await api.post("/api/products", payload, true);
        rememberProductCollection(collectionId, material);
      }
      showToast(`${activeSet.materials.length} products added, each in its own collection`, "success");
      closeProductModal();
      await load();
    } catch (err: any) {
      showToast(err.message || "Failed to save products", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await api.del(`/api/products/${id}`);
      showToast("Product deleted", "success");
      load();
    } catch (err: any) {
      showToast(err.message || "Failed to delete product", "error");
    }
  };

  // Product images upload AS-IS — no crop step. Whatever file the admin picks
  // (any size / aspect ratio) is sent to the server untouched. Multiple files
  // are uploaded one after another so their order is preserved.
  // target === null means the result goes to the normal single-product
  // `editing.images` array. target === a material name means it goes into
  // that material's own 2-image slot in `setImages` (Material Set flow).
  const enqueueForCrop = async (files: FileList | File[], target: string | null = null) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const file of list) {
      await uploadCroppedFile(file, target);
    }
  };

  const uploadImage = (file: File) => enqueueForCrop([file]);
  const uploadImages = (files: FileList | File[]) => enqueueForCrop(files);

  // Selecting files for one material's image slot inside the Material Set
  // flow — capped at 2 images per material.
  const handleSetImageSelect = (material: string, files: FileList | File[]) => {
    const remaining = MAX_PRODUCT_IMAGES - (setImages[material]?.length || 0);
    if (remaining <= 0) {
      showToast(`Only ${MAX_PRODUCT_IMAGES} images allowed per material`, "error");
      return;
    }
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, remaining);
    enqueueForCrop(list, material);
  };
  const removeSetImage = (material: string, idx: number) => {
    setSetImages((s) => ({ ...s, [material]: (s[material] || []).filter((_, i) => i !== idx) }));
  };

  // Videos upload straight through — same slot/order as photos in the images array.
  const uploadProductVideo = async (file: File) => {
    let full = false;
    setEditing((p) => {
      full = (p?.images || []).length >= MAX_PRODUCT_IMAGES;
      return p;
    });
    if (full) {
      showToast(`Max ${MAX_PRODUCT_IMAGES} images/videos allowed`, "error");
      return;
    }
    setUploading(true);
    try {
      const res = await api.upload(file);
      setEditing((p) => ({ ...p, images: [...(p?.images || []), res.url].slice(0, MAX_PRODUCT_IMAGES) }));
    } catch (err: any) {
      showToast(err.message || `Upload failed for "${file.name}"`, "error");
    } finally {
      setUploading(false);
    }
  };

  // Selecting files for the Product Images grid: photos and videos both upload
  // directly, exactly as picked.
  const handleProductMediaSelect = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const images = arr.filter((f) => f.type.startsWith("image/"));
    const videos = arr.filter((f) => f.type.startsWith("video/"));
    if (images.length) enqueueForCrop(images);
    videos.forEach((v) => uploadProductVideo(v));
  };

  const uploadCroppedFile = async (file: File, target: string | null) => {
    if (target) {
      if ((setImages[target] || []).length >= MAX_PRODUCT_IMAGES) return;
    } else {
      let full = false;
      setEditing((p) => {
        full = (p?.images || []).length >= MAX_PRODUCT_IMAGES;
        return p;
      });
      if (full) {
        showToast(`Max ${MAX_PRODUCT_IMAGES} images allowed`, "error");
        return;
      }
    }
    setUploading(true);
    try {
      const res = await api.upload(file);
      if (target) {
        setSetImages((s) => ({ ...s, [target]: [...(s[target] || []), res.url].slice(0, MAX_PRODUCT_IMAGES) }));
      } else {
        setEditing((p) => ({ ...p, images: [...(p?.images || []), res.url].slice(0, MAX_PRODUCT_IMAGES) }));
      }
    } catch (err: any) {
      showToast(err.message || `Upload failed for "${file.name}"`, "error");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setEditing((p) => ({ ...p, images: (p?.images || []).filter((_, i) => i !== idx) }));
  };

  // Drag-to-reorder for the product image grid (pointer events so it works on
  // touch/mobile too). The first image in the array is always shown as "Main"
  // on the storefront, so reordering here changes which photo leads.
  const [dragImgIndex, setDragImgIndex] = useState<number | null>(null);
  const [overImgIndex, setOverImgIndex] = useState<number | null>(null);
  const imgGridRef = useRef<HTMLDivElement>(null);

  const indexFromPoint = (x: number, y: number, count: number) => {
    const grid = imgGridRef.current;
    if (!grid) return null;
    const cells = Array.from(grid.querySelectorAll<HTMLElement>("[data-img-cell]"));
    let closest: number | null = null;
    let closestDist = Infinity;
    cells.forEach((cell, i) => {
      if (i >= count) return;
      const r = cell.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  const handleImgPointerDown = (index: number) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragImgIndex(index);
    setOverImgIndex(index);
  };

  const handleImgPointerMove = (e: React.PointerEvent) => {
    if (dragImgIndex === null) return;
    const count = (editing?.images || []).length;
    const newOver = indexFromPoint(e.clientX, e.clientY, count);
    if (newOver !== null && newOver !== overImgIndex) {
      setOverImgIndex(newOver);
      setEditing((p) => {
        const imgs = [...(p?.images || [])];
        const [moved] = imgs.splice(dragImgIndex, 1);
        imgs.splice(newOver, 0, moved);
        return { ...p, images: imgs };
      });
      setDragImgIndex(newOver);
    }
  };

  const endImgDrag = () => {
    setDragImgIndex(null);
    setOverImgIndex(null);
  };

  // ---- Trending Now / Best Sell home-page section management ----
  // Each section has its own flag (isTrending / isBestSeller) and its own
  // order field (trendingOrder / bestSellerOrder) so rearranging one section
  // never disturbs the other, or the per-collection display_order.
  const SECTION_CONFIG = {
    trending: { flag: "isTrending" as const, order: "trendingOrder" as const, label: "Trending Now", max: HOME_PRODUCTS_MAX },
    bestSeller: { flag: "isBestSeller" as const, order: "bestSellerOrder" as const, label: "Best Selling Products", max: HOME_PRODUCTS_MAX },
  };

  const sectionIncluded = (key: "trending" | "bestSeller") => {
    const cfg = SECTION_CONFIG[key];
    return products
      .filter((p) => (p as any)[cfg.flag])
      .sort((a, b) => ((a as any)[cfg.order] ?? 0) - ((b as any)[cfg.order] ?? 0));
  };

  const toggleInSection = async (key: "trending" | "bestSeller", product: Product) => {
    const cfg = SECTION_CONFIG[key];
    const included = sectionIncluded(key);
    const isIn = !!(product as any)[cfg.flag];
    if (!isIn && included.length >= cfg.max) {
      showToast(`Max ${cfg.max} products allowed in ${cfg.label}`, "error");
      return;
    }
    setSectionBusy(true);
    try {
      if (isIn) {
        await api.put(`/api/products/${product.id}`, { ...product, [cfg.flag]: false });
      } else {
        await api.put(`/api/products/${product.id}`, { ...product, [cfg.flag]: true, [cfg.order]: included.length });
      }
      await load();
      showToast(`${cfg.label} updated`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update", "error");
    } finally {
      setSectionBusy(false);
    }
  };

  const saveSectionOrder = async (key: "trending" | "bestSeller", next: Product[]) => {
    const cfg = SECTION_CONFIG[key];
    setSectionBusy(true);
    try {
      await Promise.all(next.map((p, i) => api.put(`/api/products/${p.id}`, { ...p, [cfg.order]: i })));
      await load();
    } catch (err: any) {
      showToast(err.message || "Failed to update order", "error");
    } finally {
      setSectionBusy(false);
    }
  };

  // Seeds "Best Sell" from real order history (units sold, all-time), leaving
  // room for the admin to still rearrange or swap items out afterward.
  const autoFillBestSellers = async () => {
    setAutoFillBusy(true);
    try {
      // Admin-only endpoint: must send the auth header (plain api.get() got a
      // 401 here, which logged the admin straight out of the panel).
      const ranked: { id: string; qty: number }[] = await api.getAuth("/api/analytics/top-selling");
      const top = ranked.slice(0, 20);
      await Promise.all(
        top.map((r, i) => {
          const prod = products.find((p) => p.id === r.id);
          if (!prod) return Promise.resolve();
          return api.put(`/api/products/${r.id}`, { ...prod, isBestSeller: true, bestSellerOrder: i });
        })
      );
      await load();
      showToast("Best Selling filled from sales data", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to auto-fill", "error");
    } finally {
      setAutoFillBusy(false);
    }
  };

  // feature 17: bulk product actions
  const toggleSelect = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const toggleSelectAll = () => {
    setSelected((s) => (s.length === products.length ? [] : products.map((p) => p.id)));
  };
  const bulkDelete = async () => {
    if (!selected.length || !confirm(`Delete ${selected.length} selected products?`)) return;
    setBulkBusy(true);
    try {
      await api.post("/api/products/bulk-delete", { ids: selected }, true);
      showToast(`${selected.length} products deleted`, "success");
      setSelected([]);
      await load();
    } catch (err: any) {
      showToast(err.message || "Bulk delete failed", "error");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkMarkOutOfStock = async () => {
    if (!selected.length) return;
    setBulkBusy(true);
    try {
      await api.post("/api/products/bulk-update", { ids: selected, changes: { stockStatus: "out_of_stock" } }, true);
      showToast(`${selected.length} products marked out of stock`, "success");
      setSelected([]);
      await load();
    } catch (err: any) {
      showToast(err.message || "Couldn't update selected products", "error");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkMarkInStock = async () => {
    if (!selected.length) return;
    setBulkBusy(true);
    try {
      await api.post("/api/products/bulk-update", { ids: selected, changes: { stockStatus: "in_stock" } }, true);
      showToast(`${selected.length} products marked in stock`, "success");
      setSelected([]);
      await load();
    } catch (err: any) {
      showToast(err.message || "Couldn't update selected products", "error");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <button type="button" onClick={() => setSectionModal("trending")} className="btn-liquid-light px-4 py-2 rounded-full text-sm font-semibold">
          Manage Trending Now
        </button>
        <button type="button" onClick={() => setSectionModal("bestSeller")} className="btn-liquid-light px-4 py-2 rounded-full text-sm font-semibold">
          Manage Best Selling
        </button>
      </div>

      {sectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSectionModal(null)}>
          <div className={`${card} w-full max-w-lg max-h-[85vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Manage {SECTION_CONFIG[sectionModal].label}</h3>
              <button type="button" onClick={() => setSectionModal(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#8c9196] mb-3">
              Pick {sectionModal === "bestSeller" ? `${HOME_PRODUCTS_MIN}–` : "up to "}{SECTION_CONFIG[sectionModal].max} products to show in this home page section, then drag to set the order.
            </p>
            {sectionModal === "bestSeller" && sectionIncluded(sectionModal).length < HOME_PRODUCTS_MIN && (
              <p className="text-xs text-red-600 font-semibold mb-3">Select at least {HOME_PRODUCTS_MIN} — the home page fills the remaining slots automatically until you do.</p>
            )}

            <p className="text-xs font-bold text-[#202223] mb-1.5">Selected ({sectionIncluded(sectionModal).length}/{SECTION_CONFIG[sectionModal].max})</p>
            <div className="mb-4">
              <DragReorderList
                items={sectionIncluded(sectionModal)}
                getKey={(p) => p.id}
                disabled={sectionBusy}
                onReorder={(next) => saveSectionOrder(sectionModal, next)}
                renderItem={(p) => (
                  <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.images?.[0] ? (
                        <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-8 bg-[#e1e3e5] rounded" />
                      )}
                      <span className="text-sm text-[#202223] truncate">{p.title}</span>
                    </div>
                    <button type="button" disabled={sectionBusy} onClick={() => toggleInSection(sectionModal, p)} className="w-7 h-7 flex items-center justify-center rounded border border-[#e1e3e5] text-red-500 hover:bg-white shrink-0"><X size={14} /></button>
                  </div>
                )}
              />
              {sectionIncluded(sectionModal).length === 0 && <p className="text-[#8c9196] text-sm">Nothing selected yet.</p>}
            </div>

            <p className="text-xs font-bold text-[#202223] mb-1.5">Add products</p>
            <div className="space-y-2">
              {products
                .filter((p) => !(p as any)[SECTION_CONFIG[sectionModal].flag])
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 border border-[#e1e3e5] rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.images?.[0] ? (
                        <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-8 bg-[#f6f6f7] rounded" />
                      )}
                      <span className="text-sm text-[#202223] truncate">{p.title}</span>
                    </div>
                    <button type="button" disabled={sectionBusy} onClick={() => toggleInSection(sectionModal, p)} className="text-sm font-medium text-[#202223] hover:underline shrink-0">Add</button>
                  </div>
                ))}
              {products.filter((p) => !(p as any)[SECTION_CONFIG[sectionModal].flag]).length === 0 && (
                <p className="text-[#8c9196] text-sm">All products are already in this section.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {setPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSetPickerOpen(false)}>
          <div className={`${card} admin-modal-solid w-full max-w-lg p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Add Product — choose a set</h3>
              <button type="button" onClick={() => setSetPickerOpen(false)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#6d7175] mb-4">Pick which set this product belongs to. You'll fill in the shared details once, then upload up to {MAX_PRODUCT_IMAGES} images for each material in the set (select several at once) — a separate product is created per material automatically.</p>
            <div className="space-y-3">
              {MATERIAL_SETS.map((set) => (
                <button type="button"
                  key={set.id}
                  onClick={() => chooseMaterialSet(set)}
                  className="w-full text-left border border-[#c9cccf] hover:border-[#202223] rounded-xl p-4 transition-colors"
                >
                  <p className="text-sm font-bold text-[#202223]">{set.label}</p>
                  <p className="text-xs text-[#6d7175] mt-0.5">{set.description}</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {set.materials.map((m) => (
                      <span key={m} className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#202223]">{m}</span>
                    ))}
                  </div>
                </button>
              ))}
              <button type="button"
                onClick={openNewFrame}
                className="w-full text-left border border-[#c9cccf] hover:border-[#202223] rounded-xl p-4 transition-colors"
              >
                <p className="text-sm font-bold text-[#202223]">Photo Frame</p>
                <p className="text-xs text-[#6d7175] mt-0.5">Name, image, sizes (8x12 / 12x18) with a price for each size — no phone model</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {frameEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setFrameEditing(null)}>
          <div className={`${card} admin-modal-solid w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-[#202223]">{frameEditing.id ? "Edit Photo Frame" : "Add Photo Frame"}</h3>
              <button type="button" onClick={() => setFrameEditing(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Product Name</label>
                <input
                  placeholder="e.g. Couple Wooden Photo Frame"
                  value={frameEditing.title || ""}
                  onChange={(e) => setFrameEditing({ ...frameEditing, title: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Collection</label>
                <select
                  value={frameEditing.collectionId || ""}
                  onChange={(e) => setFrameEditing({ ...frameEditing, collectionId: e.target.value, collectionIds: e.target.value ? [e.target.value] : [] })}
                  className={inputCls}
                >
                  <option value="">-- Collection --</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Product Images ({(frameEditing.images || []).length}/{MAX_PRODUCT_IMAGES}) {frameUploading && <span className="font-normal text-[#8c9196]">Uploading...</span>}</label>
                <div className="grid grid-cols-5 gap-2">
                  {(frameEditing.images || []).map((img, i) => (
                    <div key={img + i} className="relative aspect-square">
                      {i === 0 && <span className="absolute top-1 left-1 z-10 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Main</span>}
                      <img src={api.imageUrl(img)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                      <button type="button"
                        onClick={() => setFrameEditing((p) => p ? { ...p, images: (p.images || []).filter((_, idx) => idx !== i) } : p)}
                        className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {(frameEditing.images || []).length < MAX_PRODUCT_IMAGES && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                      <Plus size={18} />
                      <span className="text-[10px] mt-0.5">Add photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { if (e.target.files?.length) uploadFrameImages(e.target.files); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Sizes &amp; Prices</label>
                <p className="text-[10px] text-[#8c9196] mb-2">Enter the selling price for each size. Compare price (optional) is the struck-through price.</p>
                <div className="space-y-2">
                  {(frameEditing.frameSizes || []).map((z, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <input placeholder="Size e.g. 8x12" value={z.label} onChange={(e) => setFrameSizeField(i, { label: e.target.value })} className={inputCls} />
                      <input type="number" min={0} placeholder="Price ₹" value={z.price || ""} onChange={(e) => setFrameSizeField(i, { price: Number(e.target.value) })} className={inputCls} />
                      <input type="number" min={0} placeholder="Compare ₹ (optional)" value={z.comparePrice || ""} onChange={(e) => setFrameSizeField(i, { comparePrice: Number(e.target.value) })} className={inputCls} />
                      <button type="button"
                        onClick={() => setFrameEditing((p) => p ? { ...p, frameSizes: (p.frameSizes || []).filter((_, idx) => idx !== i) } : p)}
                        className="text-[#8c9196] hover:text-red-500"
                        title="Remove size"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => setFrameEditing((p) => p ? { ...p, frameSizes: [...(p.frameSizes || []), { label: "", price: 0, comparePrice: 0 }] } : p)}
                  disabled={(frameEditing.frameSizes || []).length >= 8}
                  className="text-xs font-medium text-[#202223] hover:underline mt-2 disabled:opacity-40"
                >
                  + Add size
                </button>
              </div>

              <label className="flex items-start gap-2 text-sm text-[#202223] cursor-pointer">
                <input type="checkbox" className="mt-1" checked={frameAllowUpload} onChange={(e) => setFrameAllowUpload(e.target.checked)} />
                <span>
                  <span className="font-semibold">Customer can upload their own image</span>
                  <span className="block text-[11px] text-[#8c9196]">Tick this to show an "Upload Your Photo" box on the product page (required before adding to cart). Leave unticked for ready-made frames.</span>
                </span>
              </label>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Description</label>
                <textarea value={frameEditing.description || ""} onChange={(e) => setFrameEditing({ ...frameEditing, description: e.target.value })} className={inputCls} rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#202223] block mb-1">Stock</label>
                  <select value={frameEditing.stockStatus || "in_stock"} onChange={(e) => setFrameEditing({ ...frameEditing, stockStatus: e.target.value as any })} className={inputCls}>
                    <option value="in_stock">In stock</option>
                    <option value="low_stock">Low stock</option>
                    <option value="out_of_stock">Out of stock</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#202223] cursor-pointer mt-5">
                  <input type="checkbox" checked={!!frameEditing.isNewArrival} onChange={(e) => setFrameEditing({ ...frameEditing, isNewArrival: e.target.checked })} />
                  New Arrival badge
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setFrameEditing(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={saveFrame} disabled={frameSaving || frameUploading} className={btnPrimary}>{frameSaving ? "Saving..." : frameEditing.id ? "Save Changes" : "Add Photo Frame"}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeProductModal}>
          <div className={`${card} admin-modal-solid w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-[#202223]">{editing.id ? "Edit Product" : activeSet ? `Add ${activeSet.label} (${activeSet.materials.length} products)` : "Add New Product"}</h3>
              <button type="button" onClick={closeProductModal} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              {!activeSet && (
              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Product Title</label>
                <input placeholder="e.g. Divine Murugan Ultra Glossy" value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} />
              </div>
              )}

              {activeSet ? (
                <div className={`${card} p-3 bg-[#fafbfb]`}>
                  <p className="text-xs font-black text-[#202223] mb-1">Materials in this set</p>
                  <p className="text-[10px] text-[#8c9196] mb-1">Give each material its own title and collection — set those, and upload up to {MAX_PRODUCT_IMAGES} images (bulk-select supported), further down.</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {activeSet.materials.map((m) => (
                      <span key={m} className="bg-white border border-[#e1e3e5] rounded-full px-2 py-0.5 text-[10px] font-semibold text-[#202223]">
                        {m} · ₹{MATERIAL_PRICING[m].price}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#8c9196] mt-1.5">Price and compare-at are set automatically per material. Scroll down to upload each material's 2 images.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-bold text-[#202223] block mb-1">Material</label>
                    <select
                      value={(editing as any).material || ""}
                      onChange={(e) => {
                        const material = e.target.value as Material | "";
                        if (material && MATERIAL_PRICING[material as Material]) {
                          const { price, comparePrice } = MATERIAL_PRICING[material as Material];
                          setEditing({ ...editing, material, price, comparePrice, brand: "", models: [] } as any);
                        } else {
                          setEditing({ ...editing, material, brand: "", models: [] } as any);
                        }
                      }}
                      className={inputCls}
                    >
                      <option value="">-- Select Material --</option>
                      {MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p className="text-[10px] text-[#8c9196] mt-1">Price and compare-at are set automatically from the material (all free shipping).</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-[#202223] block mb-1">Price (₹)</label>
                      <input type="number" placeholder="Price" value={editing.price || ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#202223] block mb-1">Compare at (₹)</label>
                      <input type="number" placeholder="Compare Price" value={editing.comparePrice || ""} onChange={(e) => setEditing({ ...editing, comparePrice: Number(e.target.value) })} className={inputCls} />
                    </div>
                  </div>

                  {/* Brand and Phone Model — each on its own line. Scoped to the
                      Material picked above (each material has its own model list). */}
                  <div>
                    <label className="text-xs font-bold text-[#202223] block mb-1">Brand</label>
                    <select
                      disabled={!editing.material}
                      value={editing.brand || ""}
                      onChange={(e) => setEditing({ ...editing, brand: e.target.value, models: [] })}
                      className={`${inputCls} disabled:opacity-50`}
                    >
                      <option value="">{editing.material ? "-- Select Brand --" : "Select a material first"}</option>
                      {Object.keys(brandModels).map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#202223] block mb-1">Phone Model(s)</label>
                    <select
                      disabled={!editing.brand}
                      value=""
                      onChange={(e) => {
                        const m = e.target.value;
                        if (!m) return;
                        const current = editing.models || [];
                        if (!current.includes(m)) setEditing({ ...editing, models: [...current, m] });
                      }}
                      className={`${inputCls} disabled:opacity-50`}
                    >
                      <option value="">{editing.brand ? "-- Add a model --" : "Select a brand first"}</option>
                      {(brandModels[editing.brand || ""] || []).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {(editing.models || []).length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {(editing.models || []).map((m) => (
                          <span key={m} className="inline-flex items-center gap-1 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full px-2.5 py-1 text-xs text-[#202223]">
                            {m}
                            <button type="button" onClick={() => setEditing({ ...editing, models: (editing.models || []).filter((x) => x !== m) })} className="text-[#8c9196] hover:text-red-500">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {!activeSet && (
              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Collection</label>
                <select value={editing.collectionId || ""} onChange={(e) => changeProductCollection(e.target.value)} className={inputCls}>
                  <option value="">-- Collection --</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">Description</label>
                <textarea placeholder="Description" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputCls} rows={3} />
              </div>

              {activeSet ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[#202223] -mb-1">Set up each material</p>
                  <p className="text-[10px] text-[#8c9196]">Each material starts with its last used collection and the collection name as its title. You can change both. Upload up to {MAX_PRODUCT_IMAGES} photos — the first photo is the Main image.</p>
                  {activeSet.materials.map((material) => {
                    const imgs = setImages[material] || [];
                    return (
                      <div key={material} className={`${card} p-3`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-black text-[#202223]">{material} <span className="font-normal text-[#8c9196]">· ₹{MATERIAL_PRICING[material].price} · ({imgs.length}/{MAX_PRODUCT_IMAGES} photos)</span></p>
                          {uploading && <span className="text-xs text-[#8c9196]">Uploading...</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="text-[10px] font-bold text-[#6d7175] block mb-1">Title</label>
                            <input
                              placeholder={`e.g. Premium TVK ${material}s`}
                              value={setTitles[material] || ""}
                              onChange={(e) => setSetTitles((s) => ({ ...s, [material]: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-[#6d7175] block mb-1">Collection</label>
                            <select
                              value={setCollectionIds[material] || ""}
                              onChange={(e) => changeSetCollection(material, e.target.value)}
                              className={inputCls}
                            >
                              <option value="">-- Collection --</option>
                              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {imgs.map((img, i) => (
                            <div key={img + i} className="relative aspect-square">
                              {i === 0 && <span className="absolute top-1 left-1 z-10 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Main</span>}
                              <img src={api.imageUrl(img)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                              <button type="button" onClick={() => removeSetImage(material, i)} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {imgs.length < MAX_PRODUCT_IMAGES && (
                            <label className="aspect-square rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                              <Plus size={18} />
                              <span className="text-[10px] mt-0.5">Add photo{MAX_PRODUCT_IMAGES - imgs.length > 1 ? "s" : ""}</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files?.length) handleSetImageSelect(material, e.target.files);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#202223]">Product Images ({(editing.images || []).length}/{MAX_PRODUCT_IMAGES} — min 1, max {MAX_PRODUCT_IMAGES})</label>
                  {uploading && <span className="text-xs text-[#8c9196]">Uploading...</span>}
                </div>
                <p className="text-[10px] text-[#8c9196] mb-2 -mt-1">Photos and videos are uploaded exactly as you pick them — no cropping. You can select multiple files at once, and drag the grip to reorder — the first item is the Main image shown on the storefront.</p>
                <div ref={imgGridRef} className="grid grid-cols-5 gap-2" onPointerMove={handleImgPointerMove} onPointerUp={endImgDrag} onPointerCancel={endImgDrag}>
                  {(editing.images || []).map((img, i) => (
                    <div
                      key={img + i}
                      data-img-cell
                      className={`relative aspect-square transition-shadow ${dragImgIndex === i ? "z-10 shadow-lg ring-2 ring-blue-300 rounded-lg" : ""}`}
                      style={{ touchAction: dragImgIndex !== null ? "none" : "pan-y" }}
                    >
                      {i === 0 && <span className="absolute top-1 left-1 z-10 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Main</span>}
                      {isVideoFile(img) ? (
                        <video src={api.imageUrl(img)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5] pointer-events-none" muted />
                      ) : (
                        <img src={api.imageUrl(img)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5] pointer-events-none" />
                      )}
                      <button
                        type="button"
                        aria-label="Drag to reorder"
                        onPointerDown={handleImgPointerDown(i)}
                        className="absolute bottom-1 left-1 bg-black/60 text-white rounded w-5 h-5 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                      >
                        <GripVertical size={12} />
                      </button>
                      <button type="button" onClick={() => removeImage(i)} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {(editing.images || []).length < MAX_PRODUCT_IMAGES && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                      <Plus size={18} />
                      <span className="text-[10px] mt-0.5">Add image{MAX_PRODUCT_IMAGES - (editing.images || []).length > 1 ? "s" : ""}/video</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) handleProductMediaSelect(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              )}

              <div className="flex gap-4 text-sm text-[#6d7175] flex-wrap pt-1">
                {["isFeatured", "isTrending", "isNewArrival", "isBestSeller"].map((f) => (
                  <label key={f} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={!!(editing as any)[f]} onChange={(e) => setEditing({ ...editing, [f]: e.target.checked })} />
                    {f.replace("is", "")}
                  </label>
                ))}
              </div>

              {(() => {
                const sets = (editing as any).customization?.sets || [];
                const applyPreset = (presetId: string) => {
                  const preset = CUSTOMIZATION_PRESETS.find((p) => p.id === presetId);
                  setEditing({
                    ...editing,
                    // Clear the old flags so getCustomizationSets() always prefers
                    // this product's own `customization` from now on.
                    isCustomizable: false,
                    requiresCustomerName: false,
                    customization: preset && preset.sets.length ? { sets: preset.sets.map((s) => ({ ...s })) } : undefined,
                  } as any);
                };
                const updateSet = (idx: number, patch: Partial<CustomizationSet>) => {
                  const next = sets.map((s: CustomizationSet, i: number) => (i === idx ? { ...s, ...patch } : s));
                  setEditing({ ...editing, customization: { sets: next } } as any);
                };
                // Best-effort match of the current sets back to a preset id, so the
                // dropdown shows the right selection when re-opening a product.
                const activePresetId = CUSTOMIZATION_PRESETS.find(
                  (p) => JSON.stringify(p.sets.map((s) => ({ image: s.image, text: s.text }))) === JSON.stringify(sets.map((s: CustomizationSet) => ({ image: s.image, text: s.text })))
                )?.id || (sets.length ? "" : "none");
                return (
                  <div className="pt-1 space-y-2">
                    <label className="text-xs font-semibold text-[#6d7175] block">Customer Customization (photo / text boxes)</label>
                    <select value={activePresetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
                      {CUSTOMIZATION_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    {sets.length > 0 && (
                      <div className="space-y-2 border border-[#e1e3e5] rounded-lg p-3 bg-[#fafbfb]">
                        {sets.map((s: CustomizationSet, i: number) => (
                          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                            <span className="font-semibold text-[#202223] w-12">Set {i + 1}</span>
                            {s.image && (
                              <label className="flex items-center gap-1.5">
                                <span className="text-[#6d7175]">Image:</span>
                                <select
                                  className="border border-[#c9cccf] rounded px-1.5 py-1 text-xs"
                                  value={s.imageRequired ? "required" : "optional"}
                                  onChange={(e) => updateSet(i, { imageRequired: e.target.value === "required" })}
                                >
                                  <option value="required">Required</option>
                                  <option value="optional">Optional</option>
                                </select>
                              </label>
                            )}
                            {s.text && (
                              <label className="flex items-center gap-1.5">
                                <span className="text-[#6d7175]">Text:</span>
                                <select
                                  className="border border-[#c9cccf] rounded px-1.5 py-1 text-xs"
                                  value={s.textRequired ? "required" : "optional"}
                                  onChange={(e) => updateSet(i, { textRequired: e.target.value === "required" })}
                                >
                                  <option value="required">Required</option>
                                  <option value="optional">Optional</option>
                                </select>
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {variantGroups.length > 0 && (
                <div className="pt-1">
                  <label className="text-xs font-semibold text-[#6d7175] block mb-1">Variant Options Dropdown (optional)</label>
                  <select
                    value={(editing as any).variantGroupId || ""}
                    onChange={(e) => setEditing({ ...editing, variantGroupId: e.target.value } as any)}
                    className={inputCls}
                  >
                    <option value="">None</option>
                    {variantGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#8c9196] mt-1">Shows this dropdown right under the phone model picker on this product's page. Manage groups under Variant Options.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2 justify-end border-t border-[#e1e3e5] mt-2">
                <button type="button" onClick={closeProductModal} className={btnGhost}>Cancel</button>
                <button type="button"
                  onClick={activeSet ? saveMaterialSet : save}
                  disabled={
                    saving ||
                    (activeSet
                      ? activeSet.materials.some((m) => !(setTitles[m] || "").trim() || !setCollectionIds[m] || (setImages[m] || []).length < 1)
                      : !editing.title)
                  }
                  className={`${btnPrimary} disabled:opacity-50`}
                >
                  {saving ? "Saving..." : activeSet ? `Create ${activeSet.materials.length} Products` : editing.id ? "Save Changes" : "Add Product"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="shrink-0 px-2.5 py-1.5 text-sm font-semibold text-[#202223]">All</span>
        <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
          <Search size={14} className="text-[#8c9196] shrink-0" />
          <input aria-label="Search products" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products" className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]" />
        </div>

        <div className="flex items-center gap-0.5 bg-[#f1f2f3] rounded-lg p-0.5 shrink-0">
          <button type="button"
            onClick={() => setProductView("list")}
            title="List view"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              productView === "list" ? "bg-white text-[#202223] shadow-sm" : "text-[#6d7175] hover:text-[#202223]"
            }`}
          >
            <List size={15} />
          </button>
          <button type="button"
            onClick={() => setProductView("grid")}
            title="Grid view"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              productView === "grid" ? "bg-white text-[#202223] shadow-sm" : "text-[#6d7175] hover:text-[#202223]"
            }`}
          >
            <Grid3x3 size={15} />
          </button>
        </div>
      </div>

      {products.length > 0 && selected.length > 0 && (
        <div className="bg-[#f6f6f7] border-x border-[#e1e3e5] px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-[#6d7175]">{selected.length} selected</span>
          <div className="flex gap-3 ml-auto">
            <button type="button" onClick={bulkMarkInStock} disabled={bulkBusy} className="text-xs font-semibold text-green-600 hover:underline disabled:opacity-50">Mark In Stock</button>
            <button type="button" onClick={bulkMarkOutOfStock} disabled={bulkBusy} className="text-xs font-semibold text-[#6d7175] hover:underline disabled:opacity-50">Mark Out of Stock</button>
            <button type="button" onClick={bulkDelete} disabled={bulkBusy} className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50">Delete Selected</button>
          </div>
        </div>
      )}

      {productView === "list" ? (
      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className={thCls}>
                <input type="checkbox" checked={products.length > 0 && selected.length === products.length} onChange={toggleSelectAll} className="rounded border-[#c9cccf]" />
              </th>
              <th className={thCls}>Product</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Inventory</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Channels</th>
              <th className={thCls}>Product type</th>
              <th className={thCls}>Vendor</th>
              <th className={thCls}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className={trHover}>
                <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-[#c9cccf]" />
                </td>
                <td className={tdCls}>
                  <button type="button" onClick={() => openProductEditor(p)} className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#f6f6f7] border border-[#e1e3e5] shrink-0">
                      {p.images?.[0] ? (
                        <img src={api.imageUrl(p.images[0])} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#c9cccf] text-[9px]">No image</div>
                      )}
                    </div>
                    <span className="font-medium text-[#2c6ecb] whitespace-normal">{p.title}</span>
                  </button>
                </td>
                <td className={tdCls}>
                  <span className={statusPill(p.stockStatus === "out_of_stock" ? "critical" : "success")}>
                    {p.stockStatus === "out_of_stock" ? "Out of stock" : "Active"}
                  </span>
                </td>
                <td className={tdCls}>Inventory not tracked</td>
                <td className={tdCls}>Mobile Phone Cases</td>
                <td className={tdCls}>{p.models?.length ? Math.min(4, Math.max(1, Math.ceil((p.models?.length || 0) / 3))) : 2}</td>
                <td className={tdCls}>{p.material || "—"}</td>
                <td className={tdCls}>3D Case Makers</td>
                <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => openProductEditor(p)} className="text-[#6d7175] hover:text-[#202223]" title="Edit"><PenSquare size={14} /></button>
                    <button type="button" onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={9} className="text-center text-[#8c9196] text-sm py-10">No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      ) : (
      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl p-4">
        {filteredProducts.length === 0 ? (
          <div className="text-center text-[#8c9196] text-sm py-10">No products yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className={`group relative border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
                  selected.includes(p.id) ? "border-[#2c6ecb] ring-1 ring-[#2c6ecb]" : "border-[#e1e3e5]"
                }`}
              >
                <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded border-[#c9cccf] bg-white shadow"
                  />
                </div>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button"
                    onClick={() => openProductEditor(p)}
                    className="w-6 h-6 rounded-md bg-white/95 shadow flex items-center justify-center text-[#6d7175] hover:text-[#202223]"
                    title="Edit"
                  >
                    <PenSquare size={12} />
                  </button>
                  <button type="button"
                    onClick={() => remove(p.id)}
                    className="w-6 h-6 rounded-md bg-white/95 shadow flex items-center justify-center text-red-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <button type="button"
                  onClick={() => openProductEditor(p)}
                  className="block w-full aspect-square bg-[#f6f6f7]"
                >
                  {p.images?.[0] ? (
                    <img src={api.imageUrl(p.images[0])} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c9cccf] text-[10px]">No image</div>
                  )}
                </button>
                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-[#202223] leading-snug line-clamp-2">{p.title}</p>
                  <div className="flex items-center justify-between">
                    <span className={statusPill(p.stockStatus === "out_of_stock" ? "critical" : "success")}>
                      {p.stockStatus === "out_of_stock" ? "Out of stock" : "Active"}
                    </span>
                    <span className="text-[10px] font-bold text-[#6d7175]">{p.material || "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

    </div>
  );
}

// ---------------- Pricing (bulk price/offer-price edit by product type) ----------------
// Lets the admin retag every product of a given Material ("product type" —
// Acrylic / Gold / Glass / Hard Plastic) or Collection with a new Actual Price
// (compare-at, struck-through) and Offer Price (what customers pay) in one go,
// instead of opening each product individually.
function PricingTab() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"material" | "collection">("material");
  const [drafts, setDrafts] = useState<Record<string, { price: string; comparePrice: string }>>({});
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.get("/api/products"), api.get("/api/collections")]);
      setProducts(p || []);
      setCollections(c || []);
    } catch {
      // ignore — sections just render empty
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const materialGroups: { key: string; label: string; items: Product[] }[] = MATERIAL_OPTIONS.map((m) => ({
    key: m as string,
    label: m as string,
    items: products.filter((p) => p.material === m),
  })).concat([{ key: "__none__", label: "No Type Set", items: products.filter((p) => !p.material) }]);

  const collectionGroups = collections
    .map((c) => ({
      key: c.id,
      label: c.name,
      items: products.filter((p) => p.collectionId === c.id || p.collectionIds?.includes(c.id)),
    }))
    .concat([{ key: "__none__", label: "No Collection Set", items: products.filter((p) => !p.collectionId && !p.collectionIds?.length) }]);

  const groups = (groupBy === "material" ? materialGroups : collectionGroups).filter((g) => g.items.length > 0);

  const draftFor = (key: string) => drafts[key] || { price: "", comparePrice: "" };
  const setDraft = (key: string, patch: Partial<{ price: string; comparePrice: string }>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...draftFor(key), ...patch } }));

  const applyToGroup = async (key: string, items: Product[]) => {
    const d = draftFor(key);
    const price = Number(d.price);
    const comparePrice = Number(d.comparePrice);
    if (!d.price || !price || price <= 0) {
      showToast("Enter a valid offer price", "error");
      return;
    }
    if (d.comparePrice && (isNaN(comparePrice) || comparePrice < price)) {
      showToast("Actual price should be greater than or equal to the offer price", "error");
      return;
    }
    setApplyingKey(key);
    try {
      await Promise.all(
        items.map((p) =>
          api.put(`/api/products/${p.id}`, {
            ...p,
            price,
            comparePrice: d.comparePrice ? comparePrice : p.comparePrice,
          })
        )
      );
      setProducts((prev) =>
        prev.map((p) =>
          items.some((it) => it.id === p.id)
            ? { ...p, price, comparePrice: d.comparePrice ? comparePrice : p.comparePrice }
            : p
        )
      );
      showToast(`Updated pricing for ${items.length} product${items.length === 1 ? "" : "s"}`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update pricing", "error");
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Bulk-edit prices across a product type or collection</p>
      </div>
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h3 className="text-sm font-black text-[#202223]">Bulk Pricing</h3>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setGroupBy("material")}
              className={`rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${groupBy === "material" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"}`}
            >
              By Product Type
            </button>
            <button type="button"
              onClick={() => setGroupBy("collection")}
              className={`rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${groupBy === "collection" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"}`}
            >
              By Collection
            </button>
          </div>
        </div>
        <p className="text-xs text-[#8c9196] mb-4">
          Set a new Actual Price (struck-through) and Offer Price (what customers pay) once, then apply it to every
          product of that {groupBy === "material" ? "type" : "collection"} in one click. Leave Actual Price blank to
          only change the Offer Price.
        </p>

        {loading ? (
          <p className="text-[#8c9196] text-sm">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-[#8c9196] text-sm">No products yet.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const d = draftFor(g.key);
              const prices = g.items.map((p) => p.price);
              const minP = Math.min(...prices);
              const maxP = Math.max(...prices);
              return (
                <div key={g.key} className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div>
                      <span className="text-sm font-bold text-[#202223]">{g.label}</span>
                      <span className="ml-2 text-[11px] text-[#8c9196]">
                        {g.items.length} product{g.items.length === 1 ? "" : "s"} — currently ₹{minP}
                        {maxP !== minP ? ` – ₹${maxP}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Offer Price (₹)</label>
                      <input
                        type="number"
                        placeholder="e.g. 499"
                        value={d.price}
                        onChange={(e) => setDraft(g.key, { price: e.target.value })}
                        className={`${inputCls} w-32`}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Actual Price (₹) <span className="font-normal text-[#8c9196]">(optional)</span></label>
                      <input
                        type="number"
                        placeholder="e.g. 999"
                        value={d.comparePrice}
                        onChange={(e) => setDraft(g.key, { comparePrice: e.target.value })}
                        className={`${inputCls} w-32`}
                      />
                    </div>
                    <button type="button"
                      onClick={() => applyToGroup(g.key, g.items)}
                      disabled={applyingKey === g.key || !d.price}
                      className={`${btnPrimary} disabled:opacity-50`}
                    >
                      {applyingKey === g.key ? "Applying..." : `Apply to ${g.items.length}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Material Details (per-material description shown on product page) ----------------
// For each Material ("product type" — Acrylic / Gold / Glass / Hard Plastic), the admin
// writes 2 paragraphs (para 1 shows with an uploaded image above it, para 2 is text-only)
// that appear as a "Material Details" tab on every product of that material, right below
// the normal Description tab on the storefront's product page.
// ---------------- Material Details tab (Material Details + Product Descriptions) ----------------
// One tab, two sub-sections: the material-wide story (per Material type) and
// each individual product's own Description field — both editable without
// leaving this tab.
function MaterialDetailsTab() {
  const [section, setSection] = useState<"material" | "product">("material");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Per-material and per-product description text shown on the storefront</p>
      </div>
      <div className="flex gap-1 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full p-1 mb-5 w-fit">
        {([
          { key: "material" as const, label: "Material Details" },
          { key: "product" as const, label: "Product Descriptions" },
        ]).map((s) => (
          <button type="button"
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold transition-colors ${
              section === s.key ? "btn-liquid-dark" : "text-[#6d7175] hover:bg-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "material" ? <MaterialDetailsSection /> : <ProductDescriptionsSection />}
    </div>
  );
}

// Per-product Description editor — same product Description field shown in
// the Products tab's edit form, but reachable here too so both the material
// story and each product's own description can be changed from one tab.
function ProductDescriptionsSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeMaterial, setActiveMaterial] = useState<Material>(MATERIAL_OPTIONS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const s = await api.getAuth("/api/settings/admin");
    setSettings(s || {});
    setDrafts(s?.materialProductDescriptions || {});
  };
  useEffect(() => { load(); }, []);

  const current = drafts[activeMaterial] || "";
  const setCurrent = (value: string) => setDrafts((prev) => ({ ...prev, [activeMaterial]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await saveChangedSettings(settings, { ...settings, materialProductDescriptions: drafts });
      setSettings((s: any) => ({ ...s, materialProductDescriptions: drafts }));
      showToast(`${activeMaterial} description saved`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${card} p-5`}>
      <h3 className="text-sm font-black text-[#202223] mb-1">Product Descriptions</h3>
      <p className="text-xs text-[#8c9196] mb-4">
        Write one Description per Material (Acrylic / Gold / Hard Plastic / Glass). Every product with that
        material selected shows this text as its Description on the product page automatically — matching how
        Material Details works. Leave a material blank to keep using each of its products' own individual
        description instead.
      </p>

      <div className="flex gap-2 flex-wrap mb-5">
        {MATERIAL_OPTIONS.map((m) => (
          <button type="button"
            key={m}
            onClick={() => setActiveMaterial(m)}
            className={`rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
              activeMaterial === m ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold text-[#6d7175] block mb-1">
            {activeMaterial} — Description <span className="font-normal text-[#8c9196]">(shown on every {activeMaterial} product)</span>
          </label>
          <textarea
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            rows={8}
            placeholder={`e.g. "Our ${activeMaterial} cases are crafted from premium material for a sleek, durable finish..."`}
            className={inputCls}
          />
        </div>

        <div className="pt-1">
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? "Saving..." : `Save ${activeMaterial} Description`}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialDetailsSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [drafts, setDrafts] = useState<Record<string, { image?: string; para1?: string; para2?: string }>>({});
  const [activeMaterial, setActiveMaterial] = useState<Material>(MATERIAL_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const s = await api.getAuth("/api/settings/admin");
    setSettings(s || {});
    setDrafts(s?.materialDescriptions || {});
  };
  useEffect(() => { load(); }, []);

  const current = drafts[activeMaterial] || { image: "", para1: "", para2: "" };
  const setCurrent = (patch: Partial<{ image: string; para1: string; para2: string }>) =>
    setDrafts((prev) => ({ ...prev, [activeMaterial]: { ...current, ...patch } }));

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.upload(file);
      setCurrent({ image: res.url });
    } catch (err: any) {
      showToast(err.message || "Failed to upload image", "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveChangedSettings(settings, { ...settings, materialDescriptions: drafts });
      setSettings((s: any) => ({ ...s, materialDescriptions: drafts }));
      showToast(`${activeMaterial} material details saved`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Material Details</h3>
        <p className="text-xs text-[#8c9196] mb-4">
          Write the material story for each product type. It shows as a "Material Details" tab (right below
          Description) on every product with that material selected. Paragraph 1 appears with the uploaded image
          above it, Paragraph 2 is text-only underneath.
        </p>

        <div className="flex gap-2 flex-wrap mb-5">
          {MATERIAL_OPTIONS.map((m) => (
            <button type="button"
              key={m}
              onClick={() => setActiveMaterial(m)}
              className={`rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                activeMaterial === m ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-[#6d7175] block mb-1">
              Paragraph 1 <span className="font-normal text-[#8c9196]">(shown together with the image below)</span>
            </label>
            <textarea
              value={current.para1 || ""}
              onChange={(e) => setCurrent({ para1: e.target.value })}
              rows={4}
              placeholder={`e.g. "Our ${activeMaterial} cases are crafted from premium material for a sleek, durable finish..."`}
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Image for Paragraph 1</label>
            {current.image ? (
              <div className="relative w-full max-w-sm">
                <img src={api.imageUrl(current.image)} className="w-full rounded-lg border border-[#e1e3e5] object-cover max-h-56" />
                <button type="button" onClick={() => setCurrent({ image: "" })} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="w-full max-w-sm h-40 rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                <Plus size={18} />
                <span className="text-[10px] mt-0.5">{uploading ? "Uploading..." : `Add image for ${activeMaterial}`}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                  }}
                />
              </label>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#6d7175] block mb-1">
              Paragraph 2 <span className="font-normal text-[#8c9196]">(text only, no image)</span>
            </label>
            <textarea
              value={current.para2 || ""}
              onChange={(e) => setCurrent({ para2: e.target.value })}
              rows={4}
              placeholder="e.g. Care instructions, durability notes, or anything else worth mentioning about this material..."
              className={inputCls}
            />
          </div>

          <div className="pt-1">
            <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
              {saving ? "Saving..." : `Save ${activeMaterial} Details`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Collections ----------------
// ---------------- Home Page (section order + collection order + per-collection product order) ----------------
// ---------------- Content (Shopify-style landing list wrapping the store's custom content editors) ----------------
function ContentTab({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getAuth("/api/faqs/all").then((r: any[]) => setCounts((c) => ({ ...c, faqs: `${r.length} question${r.length === 1 ? "" : "s"}` }))).catch(() => {});
    api.getAuth("/api/banners").then((r: any[]) => setCounts((c) => ({ ...c, home: `${r.length} banner${r.length === 1 ? "" : "s"}` }))).catch(() => {});
    api.getAuth("/api/reviews/admin/all").then((r: any[]) => {
      const pending = r.filter((x: any) => !x.is_approved).length;
      setCounts((c) => ({ ...c, reviews: `${r.length} total · ${pending} pending` }));
    }).catch(() => {});
    api.getAuth("/api/site-reviews/admin/all").then((r: any[]) => {
      setCounts((c) => ({ ...c, website: `${r.length} testimonial${r.length === 1 ? "" : "s"}` }));
    }).catch(() => {});
  }, []);

  const sections: { key: string; tab: Tab; icon: any; title: string; desc: string }[] = [
    { key: "customize", tab: "Customize", icon: SlidersHorizontal, title: "Customize Store", desc: "Banner corners, colours, product cards, menu, home sections & custom CSS" },
    { key: "home", tab: "Home Page", icon: HomeIcon, title: "Home Page", desc: "Homepage banners and section layout" },
    { key: "website", tab: "Website Content", icon: FileText, title: "Website Content", desc: "Testimonials and general site copy" },
    { key: "reviews", tab: "Reviews", icon: Star, title: "Reviews", desc: "Product review queue and review stories" },
    { key: "themes", tab: "Themes", icon: Palette, title: "Themes", desc: "Storefront look and feel" },
    { key: "faqs", tab: "FAQs", icon: HelpCircle, title: "FAQs", desc: "Frequently asked questions shown on the storefront" },
    { key: "file-manager", tab: "File Manager", icon: Images, title: "File Manager", desc: "Uploaded images and media" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Everything shown on the storefront outside of products — pick a section to edit it</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map((s) => (
          <button type="button"
            key={s.key}
            onClick={() => onNavigate(s.tab)}
            className={`${card} p-4 text-left hover:shadow-md transition-shadow flex items-start gap-3`}
          >
            <span className="w-9 h-9 rounded-lg bg-[#f1f1f1] flex items-center justify-center text-[#202223] shrink-0">
              <s.icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#202223]">{s.title}</p>
              <p className="text-[11px] text-[#8c9196] mt-0.5">{s.desc}</p>
              {counts[s.key] && <p className="text-[11px] text-[#2c6ecb] font-semibold mt-1.5">{counts[s.key]}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Customize (storefront look & feel) ----------------
// One place for all the extra storefront customization options. Every value
// is stored as a ui* key in store settings (see UI_DEFAULTS in
// utils/siteSettings.ts for the defaults) and saved with a MERGE, so this
// screen can never overwrite keys owned by other admin screens.
type CustomizeSection = "corners" | "banners" | "cards" | "colors" | "home" | "navigation" | "advanced";

const CUSTOMIZE_SECTIONS: { key: CustomizeSection; label: string }[] = [
  { key: "corners", label: "Corners" },
  { key: "banners", label: "Banners & Layout" },
  { key: "cards", label: "Product Cards" },
  { key: "colors", label: "Colours" },
  { key: "home", label: "Home Sections" },
  { key: "navigation", label: "Menu & Widgets" },
  { key: "advanced", label: "Advanced" },
];

const CUSTOMIZE_COLORS: { key: string; label: string; hint: string; def: string }[] = [
  { key: "uiAccentColor", label: "Accent colour", hint: "Discount badges, highlights", def: "#000000" },
  { key: "uiPageBg", label: "Page background", hint: "Whole storefront background", def: "#ffffff" },
  { key: "uiHeadingColor", label: "Headings", hint: "Page & section titles", def: "#18181b" },
  { key: "uiPriceColor", label: "Price text", hint: "Price on product cards", def: "#18181b" },
  { key: "uiNavbarBg", label: "Top bar background", hint: "Header / navbar", def: "#ffffff" },
  { key: "uiNavbarText", label: "Top bar text & icons", hint: "Header links, cart, menu icon", def: "#27272a" },
  { key: "uiAnnouncementBg", label: "Announcement bar", hint: "Scrolling offer strip", def: "#000000" },
  { key: "uiAnnouncementText", label: "Announcement text", hint: "Text inside the strip", def: "#ffffff" },
  { key: "uiFooterBg", label: "Footer background", hint: "Bottom footer area", def: "#09090b" },
  { key: "uiFooterText", label: "Footer text", hint: "Footer links & copy", def: "#f4f4f5" },
];

const UI_KEYS = [
  "uiBannerCorners", "uiBannerAutoplaySec", "uiBannerShowDots", "uiBannerShowArrows", "uiBannerFullWidth",
  "uiCollectionBannerCorners", "uiCardCorners", "uiCardShowRating", "uiCardShowDiscountBadge", "uiCardShowTags",
  "uiCardImageFit", "uiProductsPerPage", "uiCollectionGridDesktopCols", "uiCollectionGridMobileCols",
  "uiHomeHiddenSections", "uiPopularTitle", "uiMenuTagline", "uiMenuShowPolicies", "uiShowSearchBar", "uiShowBackToTop",
  "uiCustomCss", "whatsappFloatingEnabled", "collectionsGridMobileCols",
  "uiSoftButtons", "uiSoftInputs", "uiSoftSelects", "uiSoftCards", "uiSoftBadges", "uiSoftImages", "uiSoftRadius",
  "uiHeadingAccent", "uiCardHoverZoom",
  ...CUSTOMIZE_COLORS.map((c) => c.key),
];

function CustomizeTab() {
  const { showToast } = useToast();
  const [section, setSection] = useState<CustomizeSection>("corners");
  const [form, setForm] = useState<any>({});
  const [initial, setInitial] = useState<string>("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const pick = (s: any) => {
    const out: any = {};
    UI_KEYS.forEach((k) => {
      if (s && s[k] !== undefined) out[k] = s[k];
    });
    return out;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api
      .getAuth("/api/settings/admin")
      .then((s) => {
        if (!active) return;
        const f = pick(s || {});
        setForm(f);
        setInitial(JSON.stringify(f));
      })
      .catch((err: any) => { if (active) setLoadError(err.message || "Failed to load settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const val = (k: string, def: any) => (form[k] === undefined || form[k] === null || form[k] === "" ? def : form[k]);
  const dirty = JSON.stringify(form) !== initial;

  const save = async () => {
    if (loading || loadError || saving) return;
    setSaving(true);
    try {
      // Unset keys are saved as null so "Reset" really clears them.
      const payload: any = {};
      UI_KEYS.forEach((k) => {
        payload[k] = form[k] === undefined || (form[k] === "" && k !== "uiMenuTagline") ? null : form[k];
      });
      await saveSettingsPatch(payload);
      setInitial(JSON.stringify(form));
      showToast("Store customization saved — live on the website now", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const Toggle = (k: string, label: string, hint: string, def = true) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#f1f2f3] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#202223]">{label}</p>
        <p className="text-[11px] text-[#6d7175] mt-0.5">{hint}</p>
      </div>
      <ToggleSwitch label={label} checked={val(k, def) !== false} onChange={(v) => set(k, v)} />
    </div>
  );

  const Choice = (k: string, label: string, hint: string, options: { value: any; label: string }[], def: any) => (
    <div className="py-3 border-b border-[#f1f2f3] last:border-0">
      <p className="text-sm font-semibold text-[#202223]">{label}</p>
      <p className="text-[11px] text-[#6d7175] mt-0.5 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = String(val(k, def)) === String(o.value);
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => set(k, o.value)}
              className={`px-3.5 py-2 text-xs font-semibold border-2 transition-colors ${
                active ? "border-[#202223] bg-[#202223] text-white" : "border-[#e1e3e5] text-[#202223] hover:border-[#c9cccf] bg-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const CornerPreview = ({ rounded, label }: { rounded: boolean; label: string }) => (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-28 h-14 bg-gradient-to-br from-[#2c6ecb] to-[#9333ea]"
        style={{ borderRadius: rounded ? 12 : 0 }}
      />
      <span className="text-[10px] font-semibold text-[#6d7175]">{label}</span>
    </div>
  );

  if (loading) return <p className="text-[#8c9196] text-sm">Loading customization...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={() => setReloadKey((key) => key + 1)} />;

  const hidden: string[] = Array.isArray(form.uiHomeHiddenSections) ? form.uiHomeHiddenSections : [];

  return (
    <div className="space-y-4">
      <div className={`${card} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#202223]">Customize your storefront</p>
          <p className="text-[11px] text-[#6d7175] mt-0.5">
            Changes go live on the website as soon as you save. Brand colour, fonts and button shape live under Content › Themes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {dirty && <span className="text-[11px] font-semibold text-[#b98900] whitespace-nowrap">Unsaved changes</span>}
          <a href="/" target="_blank" rel="noreferrer" className={`${btnSecondary} whitespace-nowrap`}>View store</a>
          <button type="button" onClick={save} disabled={saving || !dirty} className={`${btnPrimary} whitespace-nowrap`}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <LiquidPillGroup<CustomizeSection> options={CUSTOMIZE_SECTIONS} value={section} onChange={setSection} />

      {section === "corners" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Website corners</h3>
            <p className="text-[11px] text-[#6d7175] mb-2">
              The whole website uses <b>soft (rounded) corners</b> by default. Adjust individual areas here.
            </p>
            <p className="text-[11px] text-[#6d7175] py-3 border-b border-[#f1f2f3]">Buttons & links use the same 12px soft corners throughout the website and admin panel.</p>
            {Toggle("uiSoftInputs", "Search boxes & text fields", "Header search bar, checkout fields, contact form.", true)}
            {Toggle("uiSoftSelects", "Dropdowns", "Sort by, state, phone model selectors.", true)}
            {Toggle("uiSoftCards", "Cards, panels & popups", "Boxes, cart items, review cards, popups, menus.", true)}
            {Toggle("uiSoftImages", "Images", "Product gallery, review photos and other rounded images.", true)}
            {Toggle("uiSoftBadges", "Badges, tags & dots", "Offer tags, cart count, slider dots.", true)}
            <p className="text-[11px] text-[#8c9196] mt-2">Banners and footer panels use square corners. Product card corners can be adjusted under Product Cards.</p>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Soft corner roundness</h3>
            <p className="text-[11px] text-[#6d7175] mb-3">Used by every area switched to soft corners.</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={24}
                value={Number(val("uiSoftRadius", 16))}
                onChange={(e) => set("uiSoftRadius", Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-bold text-[#202223] w-12 text-right">{Number(val("uiSoftRadius", 16))}px</span>
            </div>
            <p className="text-xs font-bold text-[#202223] mt-5 mb-2">Preview</p>
            <div className="flex flex-wrap items-center gap-3">
              {[
                { k: "uiSoftButtons", el: <span className="inline-block bg-[#18181b] text-white text-xs font-bold px-4 py-2">Buy Now</span> },
                { k: "uiSoftInputs", el: <span className="inline-block border border-[#c9cccf] text-xs text-[#8c9196] px-3 py-2 w-40">Search products…</span> },
                { k: "uiSoftSelects", el: <span className="inline-block border border-[#c9cccf] text-xs text-[#202223] px-3 py-2">Sort: Best ▾</span> },
                { k: "uiSoftBadges", el: <span className="inline-block bg-[#000] text-white text-[10px] font-bold px-2 py-1">25% OFF</span> },
              ].map((p) => (
                <span key={p.k} style={{ borderRadius: p.k === "uiSoftButtons" ? 12 : val(p.k, true) ? (p.k === "uiSoftBadges" ? 9999 : Number(val("uiSoftRadius", 16))) : 0, overflow: "hidden", display: "inline-block" }}>
                  {p.el}
                </span>
              ))}
            </div>
            <div
              className="mt-3 border border-[#e1e3e5] bg-[#fafafa] p-3 text-xs text-[#6d7175] max-w-xs"
              style={{ borderRadius: val("uiSoftCards", true) ? Number(val("uiSoftRadius", 16)) : 0 }}
            >
              Card / popup preview
            </div>
          </div>
        </div>
      )}

      {section === "banners" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Home page banner</h3>
            <div className="flex gap-4 my-3">
              <CornerPreview rounded={false} label="Hard corners" />
            </div>
            <p className="text-[11px] text-[#6d7175] mb-3">Home banners use hard square corners on desktop and mobile.</p>
            {Choice("uiBannerAutoplaySec", "Auto-slide speed", "How long each banner shows before sliding to the next.", [
              { value: 0, label: "Off" },
              { value: 3, label: "3s" },
              { value: 5, label: "5s" },
              { value: 7, label: "7s" },
              { value: 10, label: "10s" },
            ], 5)}
            {Toggle("uiBannerShowDots", "Show slide dots", "Small indicator dots in the corner of the banner.")}
            {Toggle("uiBannerShowArrows", "Show arrows", "Previous / next arrow buttons on the banner.", false)}
            {Toggle("uiBannerFullWidth", "Edge-to-edge on desktop", "Stretch the banner to the full screen width on large screens.", false)}
          </div>
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Collection pages</h3>
            <p className="text-[11px] text-[#6d7175] mb-3">Collection banners use hard square corners on desktop and mobile.</p>
            {Choice("uiCollectionGridDesktopCols", "Products per row (desktop)", "Grid columns on laptops / desktops.", [
              { value: 2, label: "2" },
              { value: 3, label: "3" },
              { value: 4, label: "4" },
              { value: 5, label: "5" },
            ], 3)}
            {Choice("uiCollectionGridMobileCols", "Products per row (mobile)", "Grid columns on phones.", [
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
            ], 2)}
            {Choice("uiProductsPerPage", "Products per page", "How many products load before the Next page button.", [
              { value: 12, label: "12" },
              { value: 24, label: "24" },
              { value: 36, label: "36" },
              { value: 48, label: "48" },
            ], 24)}
            {Choice("collectionsGridMobileCols", "Shop-by-category tiles (mobile)", "Collection tiles per row on the home page, phones.", [
              { value: 2, label: "2 per row" },
              { value: 3, label: "3 per row" },
            ], 3)}
          </div>
        </div>
      )}

      {section === "cards" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Product card style</h3>
            {Choice("uiCardCorners", "Card corners", "Applies to product cards everywhere on the store.", [
              { value: "hard", label: "Hard corners" },
              { value: "rounded", label: "Rounded" },
            ], "rounded")}
            {Choice("uiCardImageFit", "Image fit", "Contain shows the full product photo; Cover fills the square.", [
              { value: "contain", label: "Contain (full image)" },
              { value: "cover", label: "Cover (fill)" },
            ], "contain")}
            {Toggle("uiCardShowRating", "Show star rating", "Rating and review count above the title.")}
            {Toggle("uiCardShowDiscountBadge", "Show discount badge", '"25% OFF" tag on the photo when a compare-at price is set.')}
            {Toggle("uiCardShowTags", "Show product tags", "Best Seller / Trending / New Arrival labels.")}
            {Toggle("uiCardHoverZoom", "Zoom photo on hover", "Product photo zooms in slightly when the mouse is over the card.")}
          </div>
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-3">Preview</h3>
            <div className="max-w-[200px]">
              <div
                className="bg-white border border-[#e4e4e7] overflow-hidden"
                style={{ borderRadius: val("uiCardCorners", "rounded") === "rounded" ? 14 : 0 }}
              >
                <div className="relative aspect-square bg-gradient-to-br from-[#f4f4f5] to-[#e4e4e7] flex items-center justify-center">
                  {val("uiCardShowDiscountBadge", true) !== false && (
                    <span
                      className="absolute top-0 left-0 text-white text-[9px] font-bold uppercase px-2 py-1"
                      style={{ background: val("uiAccentColor", "#000000") }}
                    >
                      25% Off
                    </span>
                  )}
                  <Smartphone size={40} className="text-[#a1a1aa]" />
                </div>
                <div className="p-2.5 border-t border-[#f4f4f5]">
                  {val("uiCardShowRating", true) !== false && (
                    <p className="text-[10px] font-bold text-[#202223] mb-0.5">★ 4.9 <span className="text-[#a1a1aa] font-normal">| 128</span></p>
                  )}
                  <p className="text-[11px] font-semibold text-[#27272a] leading-snug">Premium Acrylic Case</p>
                  <p className="text-sm font-bold mt-1" style={{ color: val("uiPriceColor", "#18181b") }}>
                    ₹449 <span className="text-[10px] text-[#a1a1aa] line-through font-normal">₹599</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {section === "colors" && (
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Store colours</h3>
          <p className="text-[11px] text-[#6d7175] mb-4">Leave a colour on "Default" to keep the original look.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {CUSTOMIZE_COLORS.map((c) => {
              const value = form[c.key] || "";
              return (
                <div key={c.key} className="flex items-center gap-3 p-3 border border-[#e1e3e5] rounded-xl bg-white">
                  <input
                    type="color"
                    value={value || c.def}
                    onChange={(e) => set(c.key, e.target.value)}
                    className="w-10 h-10 shrink-0 border border-[#e1e3e5] rounded-lg p-0.5 bg-white cursor-pointer"
                    aria-label={c.label}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#202223] truncate">{c.label}</p>
                    <p className="text-[10px] text-[#8c9196] truncate">{c.hint}</p>
                    <p className="text-[10px] font-mono text-[#6d7175] mt-0.5">{value ? value.toUpperCase() : "Default"}</p>
                  </div>
                  {value && (
                    <button type="button" onClick={() => set(c.key, "")} className="text-[11px] font-semibold text-[#6d7175] hover:text-[#202223] shrink-0">
                      Reset
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Mini storefront preview */}
          <div className="mt-5 border border-[#e1e3e5] overflow-hidden rounded-xl max-w-md" style={{ background: val("uiPageBg", "#ffffff") }}>
            <div className="h-10 px-3 flex items-center justify-between text-xs font-bold" style={{ background: val("uiNavbarBg", "#ffffff"), color: val("uiNavbarText", "#27272a") }}>
              <span>☰</span>
              <span>3DCaseMakers</span>
              <span>🛒</span>
            </div>
            <div className="py-1.5 text-center text-[10px] font-bold" style={{ background: val("uiAnnouncementBg", "#000000"), color: val("uiAnnouncementText", "#ffffff") }}>
              Buy 2 & Get ₹100 OFF
            </div>
            <div className="p-4">
              <p className="text-sm font-black uppercase" style={{ color: val("uiHeadingColor", "#18181b") }}>Best Sellers</p>
              <p className="text-xs font-bold mt-1" style={{ color: val("uiPriceColor", "#18181b") }}>₹449</p>
            </div>
            <div className="px-4 py-3 text-[10px] font-semibold" style={{ background: val("uiFooterBg", "#09090b"), color: val("uiFooterText", "#f4f4f5") }}>
              © 3DCaseMakers · Footer
            </div>
          </div>
        </div>
      )}

      {section === "home" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Show / hide home page sections</h3>
            <p className="text-[11px] text-[#6d7175] mb-2">Section order is set under Content › Home Page.</p>
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#f1f2f3]">
              <p className="text-sm font-semibold text-[#202223]">Feature bar (under the banner)</p>
              <ToggleSwitch
                label="Home feature bar"
                checked={!hidden.includes("featureBar")}
                onChange={(v) => set("uiHomeHiddenSections", v ? hidden.filter((x) => x !== "featureBar") : [...hidden, "featureBar"])}
              />
            </div>
            {DEFAULT_HOME_SECTIONS.map((k) => {
              const on = !hidden.includes(k);
              return (
                <div key={k} className="flex items-center justify-between gap-4 py-2.5 border-b border-[#f1f2f3] last:border-0">
                  <p className="text-sm font-semibold text-[#202223]">{HOME_SECTION_LABELS[k] || k}</p>
                  <ToggleSwitch
                    label={`Show ${HOME_SECTION_LABELS[k] || k}`}
                    checked={on}
                    onChange={(v) => set("uiHomeHiddenSections", v ? hidden.filter((x) => x !== k) : [...hidden, k])}
                  />
                </div>
              );
            })}
          </div>
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-3">Section headings</h3>
            <label className="text-xs text-[#6d7175] block mb-1 font-medium">"Popular Products" heading</label>
            <input
              value={form.uiPopularTitle || ""}
              onChange={(e) => set("uiPopularTitle", e.target.value)}
              placeholder="Popular Products"
              className={inputCls}
            />
            <p className="text-[11px] text-[#8c9196] mt-2">Other headings (Shop By Collections, Best Selling Products) are under Content › Website Content.</p>
            <div className="mt-3">{Toggle("uiHeadingAccent", "Accent line under headings", "A short bar under centred section titles, in your accent colour.")}</div>
          </div>
        </div>
      )}

      {section === "navigation" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Mobile side menu</h3>
            <p className="text-[11px] text-[#6d7175] mb-2">Opens from the left when a shopper taps ☰ on a phone.</p>
            {Toggle("uiMenuShowPolicies", "Show policy pages", "Shipping, Terms, Privacy and Refund links inside the menu.")}
            <div className="py-3">
              <label className="text-sm font-semibold text-[#202223] block">Menu footer tagline</label>
              <p className="text-[11px] text-[#6d7175] mt-0.5 mb-2">Small text at the bottom of the menu. Leave empty to hide it.</p>
              <input
                value={form.uiMenuTagline ?? "Products That Tell Your Story"}
                onChange={(e) => set("uiMenuTagline", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Widgets</h3>
            {Toggle("uiShowSearchBar", "Wide search bar in header", "Off shows just a search icon, leaving more room in the header.")}
            {Toggle("whatsappFloatingEnabled", "WhatsApp chat button", "Floating green WhatsApp button on every page.")}
            {Toggle("uiShowBackToTop", "Back-to-top button", "Appears after scrolling down long pages.")}
          </div>
        </div>
      )}

      {section === "advanced" && (
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Custom CSS</h3>
          <p className="text-[11px] text-[#6d7175] mb-3">
            For fine-tuning anything not covered above. Applied on the storefront only (never inside this admin panel).
            Example: <code className="bg-[#f1f1f1] px-1">.product-card h3 {"{"} font-size: 15px; {"}"}</code>
          </p>
          <textarea
            value={form.uiCustomCss || ""}
            onChange={(e) => set("uiCustomCss", e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder="/* your CSS here */"
            className={`${inputCls} font-mono text-xs leading-relaxed`}
          />
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => {
                if (!confirm("Reset ALL customize options back to the defaults? (Save afterwards to apply.)")) return;
                setForm({});
              }}
              className="text-xs font-semibold text-[#d72c0d] hover:underline"
            >
              Reset everything to defaults
            </button>
          </div>
        </div>
      )}

      {dirty && (
        <div className="md:hidden sticky bottom-24 z-10 flex justify-center">
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} shadow-xl`}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function HomePageTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [sections, setSections] = useState<string[]>([...DEFAULT_HOME_SECTIONS]);
  const [savingSections, setSavingSections] = useState(false);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsBusy, setCollectionsBusy] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [popularSearch, setPopularSearch] = useState("");
  const [savingPopular, setSavingPopular] = useState(false);
  const [newArrivalSearch, setNewArrivalSearch] = useState("");
  const [savingNewArrival, setSavingNewArrival] = useState(false);

  const [productsFor, setProductsFor] = useState<Collection | null>(null);
  const [collectionProducts, setCollectionProducts] = useState<Product[]>([]);
  const [productsBusy, setProductsBusy] = useState(false);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [editingBanner, setEditingBanner] = useState<Partial<Banner> | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

  const [featureBar, setFeatureBar] = useState(DEFAULT_FEATURE_BAR.map((f) => ({ ...f })));
  const [savingFeatureBar, setSavingFeatureBar] = useState(false);

  const load = async () => {
    const [s, c, b, prods] = await Promise.all([api.getAuth("/api/settings/admin"), api.get("/api/collections"), api.get("/api/banners"), api.get("/api/products").catch(() => [])]);
    setSettings(s || {});
    setAllProducts(Array.isArray(prods) ? prods : []);
    const saved: string[] = Array.isArray(s?.homeSectionsOrder) ? s.homeSectionsOrder : [];
    setSections(mergeHomeSectionOrder(saved));
    setCollections([...(c || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
    setBanners([...(b || [])].sort((x, y) => (x.order ?? 0) - (y.order ?? 0)));
    const savedFeatureBar = Array.isArray(s?.featureBar) && s.featureBar.length === 3 ? s.featureBar : DEFAULT_FEATURE_BAR;
    setFeatureBar(savedFeatureBar.map((f: any) => ({ ...f })));
  };
  useEffect(() => { load(); }, []);

  const setFeatureBarItem = (i: number, patch: Partial<{ icon: string; title: string; subtitle: string }>) => {
    setFeatureBar((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  };

  const saveFeatureBar = async () => {
    setSavingFeatureBar(true);
    try {
      await saveChangedSettings(settings, { ...settings, featureBar });
      setSettings((s: any) => ({ ...s, featureBar }));
      showToast("Feature bar updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update feature bar", "error");
    } finally {
      setSavingFeatureBar(false);
    }
  };

  const bannerHasMedia = (b: Partial<Banner> | null) =>
    !!b && (b.mediaType === "video" ? !!b.videoUrl : !!b.imageUrl);

  const saveBanner = async () => {
    if (!bannerHasMedia(editingBanner)) return;
    setSavingBanner(true);
    try {
      if (editingBanner.id) await api.put(`/api/banners/${editingBanner.id}`, editingBanner);
      else await api.post("/api/banners", editingBanner, true);
      setEditingBanner(null);
      await load();
      showToast("Banner saved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save banner", "error");
    } finally {
      setSavingBanner(false);
    }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    try {
      await api.del(`/api/banners/${id}`);
      await load();
      showToast("Banner deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete banner", "error");
    }
  };

  // Banners are shown edge-to-edge on every screen size at a 3548x1774 ratio.
  // If the source image is smaller than that, the browser has to stretch/upscale
  // it to fill the box — which is exactly what shows up as "quality loss" on
  // phones (mobile screens are often wider in CSS px than people expect once
  // scaled to full width). Warn instead of blocking, since older banners might
  // already be smaller and shouldn't suddenly fail to upload.
  const checkBannerDimensions = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ w: img.width, h: img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    });

  const uploadBannerDesktopImg = async (file: File) => {
    try {
      const { w } = await checkBannerDimensions(file);
      if (w && w < 3548) {
        showToast(`Image is ${w}px wide (recommended 3548px+) — it will be stretched and may look blurry on phones`, "error");
      }
      const res = await api.upload(file);
      setEditingBanner((b) => ({ ...b, imageUrl: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload image", "error");
    }
  };

  const uploadBannerMobileImg = async (file: File) => {
    try {
      const res = await api.upload(file);
      setEditingBanner((b) => ({ ...b, mobileImageUrl: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload image", "error");
    }
  };

  const [uploadingBannerVideo, setUploadingBannerVideo] = useState(false);
  const uploadBannerVideo = async (file: File) => {
    setUploadingBannerVideo(true);
    try {
      const res = await api.upload(file);
      setEditingBanner((b) => ({ ...b, videoUrl: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload video", "error");
    } finally {
      setUploadingBannerVideo(false);
    }
  };

  const [savingGridCols, setSavingGridCols] = useState(false);
  const saveCollectionsGridMobileCols = async (cols: 2 | 3) => {
    setSavingGridCols(true);
    try {
      await saveChangedSettings(settings, { ...settings, collectionsGridMobileCols: cols });
      setSettings((s: any) => ({ ...s, collectionsGridMobileCols: cols }));
      showToast("Shop By Collections layout updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update layout", "error");
    } finally {
      setSavingGridCols(false);
    }
  };

  const saveSectionOrder = async (next: string[]) => {
    setSections(next);
    setSavingSections(true);
    try {
      await saveChangedSettings(settings, { ...settings, homeSectionsOrder: next });
      setSettings((s: any) => ({ ...s, homeSectionsOrder: next }));
      showToast("Home page section order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update section order", "error");
    } finally {
      setSavingSections(false);
    }
  };

  // ---- Shop By Category: choose which collections show on the Home page ----
  // Stored in settings.homeCategoryIds (ordered array of collection ids).
  // Not set => storefront falls back to "all visible collections".
  const [savingCategories, setSavingCategories] = useState(false);
  const homeCategoryIds: string[] | null = Array.isArray(settings?.homeCategoryIds) ? settings.homeCategoryIds : null;
  const selectedCategoryCollections: Collection[] = (homeCategoryIds || [])
    .map((id) => collections.find((c) => c.id === id))
    .filter((c): c is Collection => !!c);
  const availableCategoryCollections: Collection[] = collections.filter((c) => !(homeCategoryIds || []).includes(c.id));
  const saveHomeCategoryIds = async (ids: string[] | null) => {
    setSavingCategories(true);
    try {
      const next: any = { ...settings };
      if (ids === null) delete next.homeCategoryIds;
      else next.homeCategoryIds = ids;
      await saveChangedSettings(settings, next);
      setSettings(next);
      showToast("Shop By Collections updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update Shop By Category", "error");
    } finally {
      setSavingCategories(false);
    }
  };

  // ---- Popular Products: choose 8-20 products for the home page ----
  // Stored in settings.homePopularProductIds (ordered array of product ids).
  const popularIds: string[] = Array.isArray(settings?.homePopularProductIds) ? settings.homePopularProductIds : [];
  const selectedPopular: Product[] = popularIds
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const availablePopular: Product[] = allProducts
    .filter((p) => !popularIds.includes(p.id))
    .filter((p) => !popularSearch.trim() || p.title.toLowerCase().includes(popularSearch.trim().toLowerCase()));
  const savePopularIds = async (ids: string[]) => {
    if (ids.length > HOME_PRODUCTS_MAX) {
      showToast(`Max ${HOME_PRODUCTS_MAX} products allowed in Popular Products`, "error");
      return;
    }
    setSavingPopular(true);
    try {
      const next: any = { ...settings, homePopularProductIds: ids };
      await saveChangedSettings(settings, next);
      setSettings(next);
      showToast(ids.length < HOME_PRODUCTS_MIN ? `Saved — add at least ${HOME_PRODUCTS_MIN} products (home pads the rest automatically)` : "Popular Products updated", ids.length < HOME_PRODUCTS_MIN ? "error" : "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update Popular Products", "error");
    } finally {
      setSavingPopular(false);
    }
  };

  // ---- New Arrival: choose 2-10 products shown under Shop By Collections ----
  // Stored in settings.homeNewArrivalProductIds (ordered array of product ids).
  const newArrivalIds: string[] = Array.isArray(settings?.homeNewArrivalProductIds) ? settings.homeNewArrivalProductIds : [];
  const selectedNewArrival: Product[] = newArrivalIds
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const availableNewArrival: Product[] = allProducts
    .filter((p) => !newArrivalIds.includes(p.id))
    .filter((p) => !newArrivalSearch.trim() || p.title.toLowerCase().includes(newArrivalSearch.trim().toLowerCase()));
  const saveNewArrivalIds = async (ids: string[]) => {
    if (ids.length > HOME_NEW_ARRIVAL_MAX) {
      showToast(`Max ${HOME_NEW_ARRIVAL_MAX} products allowed in New Arrival`, "error");
      return;
    }
    setSavingNewArrival(true);
    try {
      const next: any = { ...settings, homeNewArrivalProductIds: ids };
      await saveChangedSettings(settings, next);
      setSettings(next);
      showToast(
        ids.length < HOME_NEW_ARRIVAL_MIN ? `Saved — add at least ${HOME_NEW_ARRIVAL_MIN} products (home fills the rest with the newest products)` : "New Arrival updated",
        ids.length < HOME_NEW_ARRIVAL_MIN ? "error" : "success"
      );
    } catch (err: any) {
      showToast(err.message || "Failed to update New Arrival", "error");
    } finally {
      setSavingNewArrival(false);
    }
  };

  const saveCollectionOrder = async (next: Collection[]) => {
    setCollections(next);
    setCollectionsBusy(true);
    try {
      await Promise.all(next.map((c, i) => api.put(`/api/collections/${c.id}`, { ...c, displayOrder: i })));
      setCollections(next.map((c, i) => ({ ...c, displayOrder: i })));
      showToast("Collection order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update collection order", "error");
    } finally {
      setCollectionsBusy(false);
    }
  };

  const [togglingCollectionId, setTogglingCollectionId] = useState<string | null>(null);
  const toggleCollectionVisible = async (c: Collection) => {
    setTogglingCollectionId(c.id);
    try {
      const next = { ...c, isVisible: !c.isVisible };
      await api.put(`/api/collections/${c.id}`, next);
      setCollections((cs) => cs.map((x) => (x.id === c.id ? next : x)));
      showToast(next.isVisible ? "Now showing on the home page" : "Hidden from the home page", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update visibility", "error");
    } finally {
      setTogglingCollectionId(null);
    }
  };

  const openProducts = async (c: Collection) => {
    setProductsFor(c);
    const all: Product[] = await api.get("/api/products");
    setCollectionProducts(
      sortForCollection(all.filter((p) => p.collectionId === c.id || p.collectionIds?.includes(c.id)), c)
    );
  };

  const saveProductOrder = async (next: Product[]) => {
    if (!productsFor) return;
    setCollectionProducts(next);
    setProductsBusy(true);
    try {
      const ids = next.map((p) => p.id);
      await api.put(`/api/collections/${productsFor.id}/product-order`, { ids });
      // Keep the in-memory collection in sync so re-opening shows the new order.
      setCollections((cs) => cs.map((x) => (x.id === productsFor.id ? { ...x, productOrder: ids } : x)));
      setProductsFor((cur) => (cur ? { ...cur, productOrder: ids } : cur));
      showToast("Product order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update product order", "error");
    } finally {
      setProductsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Banners, collection order and layout of the storefront home page</p>
      </div>
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-black text-[#202223]">Home Page Banner (Hero)</h3>
          <button type="button" onClick={() => setEditingBanner({ title: "", subtitle: "", badge: "", imageUrl: "", mobileImageUrl: "", mediaType: "image", videoUrl: "", link: "", active: true, order: banners.length })} className={btnPrimary}>
            + New Banner
          </button>
        </div>
        <p className="text-xs text-[#8c9196] mb-4">The big rotating banner at the very top of the storefront home page. One image is used for both mobile and PC. Upload size: <span className="font-bold">3548 × 1774 px</span>.</p>

        {editingBanner && (
          <div className={`${card} p-4 mb-4 space-y-3 bg-[#fafbfb]`}>
            <input placeholder="Title (internal, optional)" value={editingBanner.title || ""} onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })} className={inputCls} />
            <input placeholder="Badge text (e.g. Limited Time Offer)" value={editingBanner.badge || ""} onChange={(e) => setEditingBanner({ ...editingBanner, badge: e.target.value })} className={inputCls} />
            <input placeholder="Subtitle / overlay text" value={editingBanner.subtitle || ""} onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })} className={inputCls} />
            <input placeholder="Link (e.g. /collections/acrylic-cases)" value={editingBanner.link || ""} onChange={(e) => setEditingBanner({ ...editingBanner, link: e.target.value })} className={inputCls} />

            <div>
              <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Banner Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBanner((b) => ({ ...b, mediaType: "image" }))}
                  className={`flex-1 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                    (editingBanner.mediaType || "image") === "image" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
                  }`}
                >
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBanner((b) => ({ ...b, mediaType: "video" }))}
                  className={`flex-1 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                    editingBanner.mediaType === "video" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
                  }`}
                >
                  Video
                </button>
              </div>
            </div>

            {editingBanner.mediaType === "video" ? (
              <div>
                <label className="text-[11px] font-bold text-[#6d7175] block mb-1">
                  Banner Video * <span className="font-normal text-[#8c9196]">(same 3548 × 1774 ratio, plays on loop, muted)</span>
                </label>
                {editingBanner.videoUrl ? (
                  <div className="relative w-full" style={{ aspectRatio: "3548 / 1774" }}>
                    <video src={api.imageUrl(editingBanner.videoUrl)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" autoPlay loop muted playsInline />
                    <button type="button" onClick={() => setEditingBanner((b) => ({ ...b, videoUrl: "" }))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]" style={{ aspectRatio: "3548 / 1774" }}>
                    <Plus size={18} />
                    <span className="text-[10px] mt-0.5">{uploadingBannerVideo ? "Uploading..." : "Add banner video (loops automatically)"}</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={uploadingBannerVideo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadBannerVideo(f);
                      }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Banner Image * <span className="font-normal text-[#8c9196]">(3548 × 1774 px — used for mobile & PC)</span></label>
                {editingBanner.imageUrl ? (
                  <div className="relative w-full" style={{ aspectRatio: "3548 / 1774" }}>
                    <img src={api.imageUrl(editingBanner.imageUrl)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                    <button type="button" onClick={() => setEditingBanner((b) => ({ ...b, imageUrl: "", mobileImageUrl: "" }))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]" style={{ aspectRatio: "3548 / 1774" }}>
                    <Plus size={18} />
                    <span className="text-[10px] mt-0.5">Add banner image (3548 × 1774)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          uploadBannerDesktopImg(f);
                          setEditingBanner((b) => ({ ...b, mobileImageUrl: "" }));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-[#6d7175]">
              <input type="checkbox" checked={editingBanner.active !== false} onChange={(e) => setEditingBanner({ ...editingBanner, active: e.target.checked })} /> Active on site
            </label>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={saveBanner} disabled={savingBanner || !bannerHasMedia(editingBanner)} className={`${btnPrimary} disabled:opacity-50`}>{savingBanner ? "Saving..." : "Save"}</button>
              <button type="button" onClick={() => setEditingBanner(null)} className={btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {banners.map((b) => (
            <div key={b.id} className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {b.mediaType === "video" && b.videoUrl ? (
                  <video src={api.imageUrl(b.videoUrl)} className="w-10 h-10 object-cover rounded" muted />
                ) : b.imageUrl ? (
                  <img src={api.imageUrl(b.imageUrl)} className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 bg-[#e1e3e5] rounded" />
                )}
                <span className="text-sm text-[#202223] truncate">{b.title || b.badge || "Untitled banner"}</span>
                {b.mediaType === "video" && <span className="text-[10px] text-[#8c9196] shrink-0">(video)</span>}
                {!b.active && <span className="text-[10px] text-[#8c9196] shrink-0">(inactive)</span>}
              </div>
              <div className="flex gap-3 shrink-0">
                <button type="button" onClick={() => setEditingBanner(b)} className="text-xs font-medium text-[#202223] hover:underline">Edit</button>
                <button type="button" onClick={() => deleteBanner(b.id)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
              </div>
            </div>
          ))}
          {banners.length === 0 && <p className="text-[#8c9196] text-sm">No banners yet — add one to show it on the home page.</p>}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Feature Bar (below the banner)</h3>
        <p className="text-xs text-[#8c9196] mb-4">The row of 3 icon + text badges shown right under the home page banner (e.g. Free Shipping, Premium Quality, Customer Support). Pick an icon and edit the title/subtitle for each.</p>
        <div className="space-y-3">
          {featureBar.map((item, i) => {
            const Icon = FEATURE_BAR_ICON_MAP[item.icon] || Truck;
            return (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg p-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-[#e1e3e5] shrink-0">
                  <Icon size={18} className="text-blue-500" />
                </div>
                <select
                  value={item.icon}
                  onChange={(e) => setFeatureBarItem(i, { icon: e.target.value })}
                  className={`${inputCls} sm:w-52 shrink-0`}
                >
                  {FEATURE_ICON_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
                <input
                  placeholder="Title (e.g. Free Shipping)"
                  value={item.title}
                  onChange={(e) => setFeatureBarItem(i, { title: e.target.value })}
                  className={`${inputCls} sm:flex-1`}
                />
                <input
                  placeholder="Subtitle (e.g. On order above ₹499)"
                  value={item.subtitle}
                  onChange={(e) => setFeatureBarItem(i, { subtitle: e.target.value })}
                  className={`${inputCls} sm:flex-1`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-3">
          <button type="button" onClick={saveFeatureBar} disabled={savingFeatureBar} className={btnPrimary}>
            {savingFeatureBar ? "Saving…" : "Save Feature Bar"}
          </button>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Home Page Section Order</h3>
        <p className="text-xs text-[#8c9196] mb-4">Controls the order these blocks appear on the storefront home page, top to bottom.</p>
        <DragReorderList
          items={sections}
          getKey={(key) => key}
          disabled={savingSections}
          onReorder={(next) => saveSectionOrder(next)}
          renderItem={(key, i) => (
            <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
              <span className="text-sm text-[#202223]">{i + 1}. {HOME_SECTION_LABELS[key] || key}</span>
            </div>
          )}
        />
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Shop By Collections — Mobile Layout</h3>
        <p className="text-xs text-[#8c9196] mb-4">Controls how many columns per row the Shop By Collections grid uses on phone screens. Desktop always shows 5 per row.</p>
        <div className="flex gap-2 max-w-xs">
          <button type="button"
            onClick={() => saveCollectionsGridMobileCols(3)}
            disabled={savingGridCols}
            className={`flex-1 rounded-full px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              (settings?.collectionsGridMobileCols || 3) === 3 ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
            }`}
          >
            3 per row
          </button>
          <button type="button"
            onClick={() => saveCollectionsGridMobileCols(2)}
            disabled={savingGridCols}
            className={`flex-1 rounded-full px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              settings?.collectionsGridMobileCols === 2 ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
            }`}
          >
            2 per row
          </button>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Shop By Collections — Choose Collections</h3>
        <p className="text-xs text-[#8c9196] mb-4">
          Pick exactly which collections appear in the Shop By Collections section on the home page, and drag to set their order.
          This only affects that section — the collections themselves stay live everywhere else.
        </p>

        {homeCategoryIds === null ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-3">
            <p className="text-xs text-[#6d7175] flex-1">
              Currently <b>Automatic</b> — every visible collection is shown, in the Collection Order below.
            </p>
            <button type="button"
              onClick={() => saveHomeCategoryIds(collections.filter((c) => c.isVisible !== false).map((c) => c.id))}
              disabled={savingCategories || collections.length === 0}
              className={btnPrimary}
            >
              Customize selection
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#202223]">Showing on home ({selectedCategoryCollections.length})</span>
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => saveHomeCategoryIds([])}
                  disabled={savingCategories || selectedCategoryCollections.length === 0}
                  className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-40"
                >
                  Clear all
                </button>
                <button type="button"
                  onClick={() => saveHomeCategoryIds(null)}
                  disabled={savingCategories}
                  className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-40"
                >
                  Reset to automatic
                </button>
              </div>
            </div>

            {selectedCategoryCollections.length === 0 ? (
              <p className="text-xs text-[#8c9196] mb-4">Nothing selected — the Shop By Collections section is hidden on the home page.</p>
            ) : (
              <div className="mb-4">
                <DragReorderList
                  items={selectedCategoryCollections}
                  getKey={(c) => c.id}
                  disabled={savingCategories}
                  onReorder={(next) => saveHomeCategoryIds(next.map((c) => c.id))}
                  renderItem={(c) => (
                    <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.image ? <img src={api.imageUrl(c.image)} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                        <span className="text-sm text-[#202223] truncate">{c.name}</span>
                        {c.isVisible === false && <span className="text-[10px] text-amber-600 font-semibold shrink-0">(hidden — won't show)</span>}
                      </div>
                      <button type="button"
                        onClick={() => saveHomeCategoryIds((homeCategoryIds || []).filter((id) => id !== c.id))}
                        disabled={savingCategories}
                        className="text-xs font-medium text-red-600 hover:underline shrink-0 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                />
              </div>
            )}

            {availableCategoryCollections.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#202223]">Available to add ({availableCategoryCollections.length})</span>
                  <button type="button"
                    onClick={() => saveHomeCategoryIds([...(homeCategoryIds || []), ...availableCategoryCollections.map((c) => c.id)])}
                    disabled={savingCategories}
                    className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-40"
                  >
                    Add all
                  </button>
                </div>
                <div className="space-y-2">
                  {availableCategoryCollections.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.image ? <img src={api.imageUrl(c.image)} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                        <span className="text-sm text-[#202223] truncate">{c.name}</span>
                        {c.isVisible === false && <span className="text-[10px] text-amber-600 font-semibold shrink-0">(hidden)</span>}
                      </div>
                      <button type="button"
                        onClick={() => saveHomeCategoryIds([...(homeCategoryIds || []), c.id])}
                        disabled={savingCategories}
                        className="text-xs font-medium text-[#202223] hover:underline shrink-0 disabled:opacity-40"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">New Arrival — Choose Products</h3>
        <p className="text-xs text-[#8c9196] mb-4">
          Pick {HOME_NEW_ARRIVAL_MIN}–{HOME_NEW_ARRIVAL_MAX} products for the New Arrival section (right below Shop By Collections) and drag to set their order.
        </p>

        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-bold ${selectedNewArrival.length < HOME_NEW_ARRIVAL_MIN ? "text-red-600" : "text-[#202223]"}`}>
            Showing on home ({selectedNewArrival.length}/{HOME_NEW_ARRIVAL_MAX}){selectedNewArrival.length < HOME_NEW_ARRIVAL_MIN ? ` — need at least ${HOME_NEW_ARRIVAL_MIN}` : ""}
          </span>
          <button type="button"
            onClick={() => saveNewArrivalIds([])}
            disabled={savingNewArrival || selectedNewArrival.length === 0}
            className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-40"
          >
            Clear all
          </button>
        </div>

        {selectedNewArrival.length === 0 ? (
          <p className="text-xs text-[#8c9196] mb-4">Nothing selected yet — the home page shows products marked "New Arrival", or the newest products, until you pick.</p>
        ) : (
          <div className="mb-4">
            <DragReorderList
              items={selectedNewArrival}
              getKey={(p) => p.id}
              disabled={savingNewArrival}
              onReorder={(next) => saveNewArrivalIds(next.map((p) => p.id))}
              renderItem={(p) => (
                <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.images?.[0] ? <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                    <span className="text-sm text-[#202223] truncate">{p.title}</span>
                  </div>
                  <button type="button"
                    onClick={() => saveNewArrivalIds(newArrivalIds.filter((id) => id !== p.id))}
                    disabled={savingNewArrival}
                    className="text-xs font-medium text-red-600 hover:underline shrink-0 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )}
            />
          </div>
        )}

        <div className="flex items-center justify-between mb-2 gap-3">
          <span className="text-xs font-bold text-[#202223] shrink-0">Available to add ({availableNewArrival.length})</span>
          <input
            value={newArrivalSearch}
            onChange={(e) => setNewArrivalSearch(e.target.value)}
            placeholder="Search products…"
            className="border border-[#c9cccf] rounded-lg px-3 py-1.5 text-xs w-full max-w-[220px]"
          />
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {availableNewArrival.map((p) => (
            <div key={p.id} className="flex items-center justify-between border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {p.images?.[0] ? <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                <span className="text-sm text-[#202223] truncate">{p.title}</span>
              </div>
              <button type="button"
                onClick={() => saveNewArrivalIds([...newArrivalIds, p.id])}
                disabled={savingNewArrival || newArrivalIds.length >= HOME_NEW_ARRIVAL_MAX}
                className="text-xs font-medium text-[#202223] hover:underline shrink-0 disabled:opacity-40"
              >
                + Add
              </button>
            </div>
          ))}
          {availableNewArrival.length === 0 && <p className="text-xs text-[#8c9196]">No products to add.</p>}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Popular Products — Choose Products</h3>
        <p className="text-xs text-[#8c9196] mb-4">
          Pick {HOME_PRODUCTS_MIN}–{HOME_PRODUCTS_MAX} products for the Popular Products section (below Shop By Collections) and drag to set their order.
          Best Selling Products is managed from Products → Manage Best Selling (also {HOME_PRODUCTS_MIN}–{HOME_PRODUCTS_MAX}).
        </p>

        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-bold ${selectedPopular.length < HOME_PRODUCTS_MIN ? "text-red-600" : "text-[#202223]"}`}>
            Showing on home ({selectedPopular.length}/{HOME_PRODUCTS_MAX}){selectedPopular.length < HOME_PRODUCTS_MIN ? ` — need at least ${HOME_PRODUCTS_MIN}` : ""}
          </span>
          <button type="button"
            onClick={() => savePopularIds([])}
            disabled={savingPopular || selectedPopular.length === 0}
            className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-40"
          >
            Clear all
          </button>
        </div>

        {selectedPopular.length === 0 ? (
          <p className="text-xs text-[#8c9196] mb-4">Nothing selected yet — the home page shows the first 12 products until you pick.</p>
        ) : (
          <div className="mb-4">
            <DragReorderList
              items={selectedPopular}
              getKey={(p) => p.id}
              disabled={savingPopular}
              onReorder={(next) => savePopularIds(next.map((p) => p.id))}
              renderItem={(p) => (
                <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.images?.[0] ? <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                    <span className="text-sm text-[#202223] truncate">{p.title}</span>
                  </div>
                  <button type="button"
                    onClick={() => savePopularIds(popularIds.filter((id) => id !== p.id))}
                    disabled={savingPopular}
                    className="text-xs font-medium text-red-600 hover:underline shrink-0 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )}
            />
          </div>
        )}

        <div className="flex items-center justify-between mb-2 gap-3">
          <span className="text-xs font-bold text-[#202223] shrink-0">Available to add ({availablePopular.length})</span>
          <input
            value={popularSearch}
            onChange={(e) => setPopularSearch(e.target.value)}
            placeholder="Search products…"
            className="border border-[#c9cccf] rounded-lg px-3 py-1.5 text-xs w-full max-w-[220px]"
          />
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {availablePopular.map((p) => (
            <div key={p.id} className="flex items-center justify-between border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {p.images?.[0] ? <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                <span className="text-sm text-[#202223] truncate">{p.title}</span>
              </div>
              <button type="button"
                onClick={() => savePopularIds([...popularIds, p.id])}
                disabled={savingPopular || popularIds.length >= HOME_PRODUCTS_MAX}
                className="text-xs font-medium text-[#202223] hover:underline shrink-0 disabled:opacity-40"
              >
                + Add
              </button>
            </div>
          ))}
          {availablePopular.length === 0 && <p className="text-xs text-[#8c9196]">No products to add.</p>}
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-black text-[#202223] mb-1">Collection Order</h3>
        <p className="text-xs text-[#8c9196] mb-4">Controls the order collections appear in the Shop By Collections grid on the home page. Use "Hide"/"Unhide" to control which collections show in Shop By Collections — they still show fully in the Collections tab either way.</p>
        <DragReorderList
          items={collections}
          getKey={(c) => c.id}
          disabled={collectionsBusy}
          onReorder={saveCollectionOrder}
          renderItem={(c) => (
            <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {c.image ? <img src={api.imageUrl(c.image)} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                <span className="text-sm text-[#202223] truncate">{c.name}</span>
                {c.isVisible === false && <span className="text-[10px] text-amber-600 font-semibold shrink-0">(hidden)</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button type="button"
                  onClick={() => toggleCollectionVisible(c)}
                  disabled={togglingCollectionId === c.id}
                  className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-50"
                >
                  {c.isVisible === false ? "Unhide" : "Hide"}
                </button>
                <button type="button" onClick={() => openProducts(c)} className="text-xs font-medium text-[#202223] hover:underline">Reorder Products</button>
              </div>
            </div>
          )}
        />
        {collections.length === 0 && <p className="text-[#8c9196] text-sm">No collections yet.</p>}
      </div>

      {productsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setProductsFor(null)}>
          <div className={`${card} w-full max-w-lg max-h-[85vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Reorder Products — {productsFor.name}</h3>
              <button type="button" onClick={() => setProductsFor(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#8c9196] mb-4">Drag the handle to set the order these products appear in on this collection's page. This order is saved for this collection only.</p>
            <DragReorderList
              items={collectionProducts}
              getKey={(p) => p.id}
              disabled={productsBusy}
              onReorder={saveProductOrder}
              renderItem={(p) => (
                <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.images?.[0] ? <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" /> : <div className="w-8 h-8 bg-[#e1e3e5] rounded" />}
                    <span className="text-sm text-[#202223] truncate">{p.title}</span>
                  </div>
                </div>
              )}
            />
            {collectionProducts.length === 0 && <p className="text-[#8c9196] text-sm">No products in this collection yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionsTab() {
  const { showToast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [variantGroups, setVariantGroups] = useState<VariantGroupRow[]>([]);
  const [editing, setEditing] = useState<Partial<Collection> | null>(null);
  const [saving, setSaving] = useState(false);
  const [reorderingFor, setReorderingFor] = useState<Collection | null>(null);
  const [reorderProducts, setReorderProducts] = useState<Product[]>([]);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderCollectionsOpen, setReorderCollectionsOpen] = useState(false);

  const load = async () => {
    const c: Collection[] = await api.get("/api/collections");
    setCollections([...c].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
    const s = await api.getAuth("/api/settings/admin").catch(() => null);
    setVariantGroups(Array.isArray(s?.variantGroups) ? s.variantGroups : []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing || !editing.name || !editing.slug) return;
    setSaving(true);
    try {
      if (editing.id) await api.put(`/api/collections/${editing.id}`, editing);
      // BUG FIX: this was `api.post("/api/collections", editing)` with no third
      // argument, so no auth header was sent on create — the backend always
      // replied 401 "No token provided" and the save silently failed.
      else await api.post("/api/collections", editing, true);
      setEditing(null);
      await load();
      showToast("Collection saved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save collection", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this collection?")) return;
    try {
      await api.del(`/api/collections/${id}`);
      await load();
      showToast("Collection deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete collection", "error");
    }
  };

  // Quick hide/unhide from the tile — this only controls whether the
  // collection shows in "Shop By Collections" on the home page. It always
  // keeps showing here in the Collections tab and on /collections either way.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleVisible = async (c: Collection) => {
    setTogglingId(c.id);
    try {
      const next = { ...c, isVisible: !c.isVisible };
      await api.put(`/api/collections/${c.id}`, next);
      setCollections((cs) => cs.map((x) => (x.id === c.id ? next : x)));
      showToast(next.isVisible ? "Now showing on the home page" : "Hidden from the home page", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update visibility", "error");
    } finally {
      setTogglingId(null);
    }
  };

  // Collection tile image uploads exactly as picked — no crop step.
  const [uploadingCollectionImage, setUploadingCollectionImage] = useState(false);

  const uploadImage = async (file: File) => {
    setUploadingCollectionImage(true);
    try {
      const res = await api.upload(file);
      setEditing((c) => ({ ...c, image: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload image", "error");
    } finally {
      setUploadingCollectionImage(false);
    }
  };

  const uploadBannerMobile = async (file: File) => {
    try {
      const res = await api.upload(file);
      setEditing((c) => ({ ...c, bannerMobile: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload mobile banner", "error");
    }
  };

  const checkBannerDimensions = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ w: img.width, h: img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    });

  const uploadBannerDesktop = async (file: File) => {
    try {
      const { w } = await checkBannerDimensions(file);
      if (w && w < 3548) {
        showToast(`Image is ${w}px wide (recommended 3548px+) — it will be stretched and may look blurry on phones`, "error");
      }
      const res = await api.upload(file);
      setEditing((c) => ({ ...c, bannerDesktop: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload desktop banner", "error");
    }
  };

  const [uploadingBannerVideo, setUploadingBannerVideo] = useState(false);
  const uploadBannerVideo = async (file: File) => {
    setUploadingBannerVideo(true);
    try {
      const res = await api.upload(file);
      setEditing((c) => ({ ...c, bannerVideoUrl: res.url }));
    } catch (err: any) {
      showToast(err.message || "Failed to upload banner video", "error");
    } finally {
      setUploadingBannerVideo(false);
    }
  };

  // Auto-generate a URL-safe slug from the collection name (e.g. "Gold Murugan
  // Cases" -> "gold-murugan-cases"). Keeps the field editable so an admin can
  // still override it by hand.
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const openReorder = async (c: Collection) => {
    setReorderingFor(c);
    const all: Product[] = await api.get("/api/products");
    const inCollection = sortForCollection(
      all.filter((p) => p.collectionId === c.id || p.collectionIds?.includes(c.id)),
      c
    );
    setReorderProducts(inCollection);
  };

  const saveProductOrder = async (next: Product[]) => {
    if (!reorderingFor) return;
    setReorderProducts(next);
    setReorderBusy(true);
    try {
      // Persist this collection's own product order (does not touch other collections)
      const ids = next.map((p) => p.id);
      await api.put(`/api/collections/${reorderingFor.id}/product-order`, { ids });
      setCollections((cs) => cs.map((x) => (x.id === reorderingFor.id ? { ...x, productOrder: ids } : x)));
      setReorderingFor((cur) => (cur ? { ...cur, productOrder: ids } : cur));
      showToast("Product order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update order", "error");
    } finally {
      setReorderBusy(false);
    }
  };

  const saveCollectionsOrder = async (next: Collection[]) => {
    setCollections(next);
    setReorderBusy(true);
    try {
      await Promise.all(next.map((c, i) => api.put(`/api/collections/${c.id}`, { ...c, displayOrder: i })));
      setCollections(next.map((c, i) => ({ ...c, displayOrder: i })));
      showToast("Collection order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update collection order", "error");
    } finally {
      setReorderBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Group products together for the storefront and homepage</p>
        </div>
        <button type="button" onClick={() => setEditing({ name: "", slug: "", image: "", bannerMobile: "", bannerDesktop: "", description: "", isVisible: true })} className={btnPrimary}>
          + New Collection
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setEditing(null)}>
        <div className={`${card} admin-modal-solid w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-3`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-black text-[#202223]">{editing.id ? "Edit Collection" : "Add New Collection"}</h3>
            <button type="button" onClick={() => setEditing(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
          </div>
          <input
            placeholder="Name"
            value={editing.name || ""}
            onChange={(e) => {
              const name = e.target.value;
              setEditing((c) => {
                // Only auto-update the slug while it hasn't been hand-edited away
                // from what the name would generate — so typing a name always
                // drives the slug, but a manual override is never clobbered.
                const autoSlug = c?.name ? slugify(c.name) : "";
                const slugFollowsName = !c?.slug || c.slug === autoSlug;
                return { ...c, name, slug: slugFollowsName ? slugify(name) : c?.slug };
              });
            }}
            className={inputCls}
          />
          {/* Typing-friendly: only lowercases + swaps invalid chars while typing
              (full slugify used to strip a trailing "-" instantly, so you could
              never type "gold-cases"). Cleaned fully on blur/save. */}
          <input
            placeholder="Slug (auto-generated from name)"
            value={editing.slug || ""}
            onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })}
            onBlur={() => setEditing((c) => (c ? { ...c, slug: slugify(c.slug || "") } : c))}
            className={inputCls}
          />
          <textarea placeholder="Description" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputCls} rows={2} />
          <div className={`${card} p-3 space-y-2 bg-[#fafbfb]`}>
            <p className="text-xs font-black text-[#202223]">SEO (Google search listing)</p>
            <input
              placeholder={editing.name ? `${editing.name} | 3DCaseMakers` : "e.g. Acrylic Phone Cases | 3DCaseMakers"}
              value={editing.metaTitle || ""}
              maxLength={70}
              onChange={(e) => setEditing({ ...editing, metaTitle: e.target.value })}
              className={inputCls}
            />
            <textarea
              placeholder="Shop the best acrylic / gold phone cases online at 3DCaseMakers — pan-India delivery, secure payments."
              value={editing.metaDescription || ""}
              maxLength={200}
              onChange={(e) => setEditing({ ...editing, metaDescription: e.target.value })}
              className={inputCls}
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Collection Image</label>
            <div className="grid grid-cols-5 gap-2">
              {editing.image ? (
                <div className="relative aspect-square">
                  <span className="absolute top-1 left-1 z-10 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Main</span>
                  <img src={api.imageUrl(editing.image)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                  <button type="button" onClick={() => setEditing((c) => ({ ...c, image: "" }))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="aspect-square rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                  <Plus size={18} />
                  <span className="text-[10px] mt-0.5">{uploadingCollectionImage ? "Uploading…" : "Add image"}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingCollectionImage} onChange={(e) => { if (e.target.files?.[0]) uploadImage(e.target.files[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          <div className={`${card} p-3 space-y-3 bg-[#fafbfb]`}>
            <p className="text-xs font-black text-[#202223]">Collection Page Banner</p>
            <p className="text-[11px] text-[#8c9196] -mt-2">Shown at the top of this collection's page. One image/video is used for both mobile and PC. Upload size: <span className="font-bold">3548 × 1774 px</span>.</p>

            <div>
              <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Banner Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing((c) => ({ ...c, bannerMediaType: "image" }))}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors ${
                    (editing.bannerMediaType || "image") === "image" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
                  }`}
                >
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setEditing((c) => ({ ...c, bannerMediaType: "video" }))}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors ${
                    editing.bannerMediaType === "video" ? "btn-liquid-dark" : "border border-[#c9cccf] text-[#6d7175] hover:bg-[#f6f6f7]"
                  }`}
                >
                  Video
                </button>
              </div>
            </div>

            {editing.bannerMediaType === "video" ? (
              <div>
                <label className="text-[11px] font-bold text-[#6d7175] block mb-1">
                  Banner Video <span className="font-normal text-[#8c9196]">(same 3548 × 1774 ratio, plays on loop, muted)</span>
                </label>
                {editing.bannerVideoUrl ? (
                  <div className="relative w-full" style={{ aspectRatio: "3548 / 1774" }}>
                    <video src={api.imageUrl(editing.bannerVideoUrl)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" autoPlay loop muted playsInline />
                    <button type="button" onClick={() => setEditing((c) => ({ ...c, bannerVideoUrl: "" }))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]" style={{ aspectRatio: "3548 / 1774" }}>
                    <Plus size={18} />
                    <span className="text-[10px] mt-0.5">{uploadingBannerVideo ? "Uploading..." : "Add banner video (loops automatically)"}</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={uploadingBannerVideo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadBannerVideo(f);
                      }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-bold text-[#6d7175] block mb-1">Banner Image <span className="font-normal text-[#8c9196]">(3548 × 1774 px — used for mobile & PC)</span></label>
                {editing.bannerDesktop ? (
                  <div className="relative w-full" style={{ aspectRatio: "3548 / 1774" }}>
                    <img src={api.imageUrl(editing.bannerDesktop)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                    <button type="button" onClick={() => setEditing((c) => ({ ...c, bannerDesktop: "", bannerMobile: "" }))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="w-full rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]" style={{ aspectRatio: "3548 / 1774" }}>
                    <Plus size={18} />
                    <span className="text-[10px] mt-0.5">Add banner image (3548 × 1774)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          uploadBannerDesktop(f);
                          setEditing((c) => ({ ...c, bannerMobile: "" }));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-[#6d7175]">
            <input type="checkbox" checked={editing.isVisible !== false} onChange={(e) => setEditing({ ...editing, isVisible: e.target.checked })} /> Visible on site
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <input type="checkbox" checked={!!(editing as any).isHighlighted} onChange={(e) => setEditing({ ...editing, isHighlighted: e.target.checked } as any)} />
            Highlight border on Home Page (for Special Collections / Designed Cases)
          </label>
          {variantGroups.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-[#6d7175] block mb-1">Variant Options Dropdown for this collection (optional)</label>
              <select
                value={(editing as any).variantGroupId || ""}
                onChange={(e) => setEditing({ ...editing, variantGroupId: e.target.value } as any)}
                className="w-full bg-white border border-[#c9cccf] focus:border-[#458fff] rounded-lg px-3 py-2 text-[#202223] text-sm outline-none"
              >
                <option value="">None</option>
                {variantGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-[#8c9196] mt-1">Applies this dropdown to every product in this collection automatically. A product's own Variant Options setting (in Admin &gt; Products) always overrides this.</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={save} disabled={saving || !editing.name || !editing.slug} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => setEditing(null)} className={btnGhost}>Cancel</button>
          </div>
        </div>
        </div>
      )}

      {reorderingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setReorderingFor(null)}>
          <div className={`${card} w-full max-w-lg max-h-[85vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Reorder Products — {reorderingFor.name}</h3>
              <button type="button" onClick={() => setReorderingFor(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#8c9196] mb-4">Drag the handle to set the order products appear in on this collection's page.</p>
            <DragReorderList
              items={reorderProducts}
              getKey={(p) => p.id}
              disabled={reorderBusy}
              onReorder={saveProductOrder}
              renderItem={(p) => (
                <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.images?.[0] ? (
                      <img src={api.imageUrl(p.images[0])} className="w-8 h-8 object-cover rounded" />
                    ) : (
                      <div className="w-8 h-8 bg-[#e1e3e5] rounded" />
                    )}
                    <span className="text-sm text-[#202223] truncate">{p.title}</span>
                  </div>
                </div>
              )}
            />
            {reorderProducts.length === 0 && <p className="text-[#8c9196] text-sm">No products in this collection yet.</p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-xs text-[#8c9196]">Tap a tile's image to edit it, same as Products. Every collection always shows here — use the eye icon to hide/show it in "Shop By Collections" on the home page.</p>
        {collections.length > 1 && (
          <button type="button" onClick={() => setReorderCollectionsOpen(true)} className="text-[#202223] text-sm font-medium hover:underline shrink-0">
            Reorder Collections
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
        {collections.map((c) => (
          <div key={c.id} className={`group relative ${card} p-2 flex flex-col`}>
            <button type="button"
              onClick={() => toggleVisible(c)}
              disabled={togglingId === c.id}
              title={c.isVisible === false ? "Hidden on home page — click to show" : "Visible on home page — click to hide"}
              className={`absolute top-3 right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center shadow-sm disabled:opacity-50 ${
                c.isVisible === false ? "bg-white text-[#8c9196] border border-[#e1e3e5]" : "bg-[#202223] text-white"
              }`}
            >
              {c.isVisible === false ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button type="button"
              onClick={() => setEditing(c)}
              className="aspect-square w-full rounded-lg overflow-hidden bg-[#f6f6f7] border border-[#e1e3e5]"
              title="Edit collection"
            >
              {c.image ? (
                <img src={api.imageUrl(c.image)} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#c9cccf] text-[10px]">No image</div>
              )}
            </button>
            <p className="text-[#202223] text-[11px] sm:text-xs font-semibold mt-1.5 leading-snug line-clamp-2">{c.name}</p>
            <p className="text-[#8c9196] text-[11px] sm:text-xs truncate">/{c.slug}</p>
            {c.isVisible === false && (
              <p className="text-[10px] sm:text-[11px] font-semibold text-amber-600">Hidden from home page</p>
            )}
            <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-[#f0f0f0] flex-wrap">
              <button type="button" onClick={() => setEditing(c)} className="text-[10px] sm:text-[11px] font-semibold text-[#202223] hover:underline">Edit</button>
              <button type="button" onClick={() => openReorder(c)} className="text-[10px] sm:text-[11px] font-semibold text-[#202223] hover:underline">Products</button>
              <button type="button" onClick={() => toggleVisible(c)} disabled={togglingId === c.id} className="text-[10px] sm:text-[11px] font-semibold text-[#202223] hover:underline">
                {c.isVisible === false ? "Unhide" : "Hide"}
              </button>
              <button type="button" onClick={() => remove(c.id)} className="text-[10px] sm:text-[11px] font-semibold text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        ))}
        {collections.length === 0 && <p className="text-[#8c9196] text-sm col-span-full">No collections yet.</p>}
      </div>

      {reorderCollectionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setReorderCollectionsOpen(false)}>
          <div className={`${card} w-full max-w-lg max-h-[85vh] overflow-y-auto p-6`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Reorder Collections</h3>
              <button type="button" onClick={() => setReorderCollectionsOpen(false)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#8c9196] mb-4">Drag the handle to change the order collections appear on the storefront.</p>
            <DragReorderList
              items={collections}
              getKey={(c) => c.id}
              disabled={reorderBusy}
              onReorder={saveCollectionsOrder}
              renderItem={(c) => (
                <div className="flex items-center justify-between bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.image ? (
                      <img src={api.imageUrl(c.image)} className="w-8 h-8 object-cover rounded" />
                    ) : (
                      <div className="w-8 h-8 bg-[#e1e3e5] rounded" />
                    )}
                    <span className="text-sm text-[#202223] truncate">{c.name}</span>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      )}

    </div>
  );
}

// ---------------- Orders ----------------
const STATUSES = ["pending", "processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"];
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-50 text-blue-700",
  processing: "bg-blue-50 text-blue-700",
  ready_to_ship: "bg-purple-50 text-purple-700",
  shipped: "bg-cyan-50 text-cyan-700",
  out_for_delivery: "bg-indigo-50 text-indigo-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  returned: "bg-[#f0f0f0] text-[#6d7175]",
};

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// A customer's uploaded "print" file can be either an image or a video —
// tell them apart by extension so the Orders tab knows whether to render
// an <img> or <video> preview.
function isVideoFile(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url || "");
}

// Forces a real download of a customer-uploaded file (instead of just
// opening it in a new tab, which is what a plain <a href> does for
// cross-origin URLs) by fetching it as a blob first.
async function downloadCustomerFile(pathOrUrl: string, filenameBase: string) {
  // Our own uploads: navigate to the backend's download route, which sends
  // Content-Disposition: attachment and never needs CORS (the live server's
  // static /uploads responses carry no CORS headers, so fetch() below always
  // failed there and only ever fell back to opening a new tab).
  const own = /^\/uploads\/([a-zA-Z0-9_-]+\.[a-z0-9]+)$/i.exec(pathOrUrl || "");
  if (own) {
    const a = document.createElement("a");
    a.href = `${API_URL}/api/upload/file/${own[1]}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  try {
    const fullUrl = api.imageUrl(pathOrUrl);
    const res = await fetch(fullUrl);
    const blob = await res.blob();
    const ext = (pathOrUrl.match(/\.[a-z0-9]+$/i) || [""])[0] || "";
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${filenameBase}${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    // Fallback: just open it so the admin can still save it manually.
    window.open(api.imageUrl(pathOrUrl), "_blank");
  }
}

// Short, friendly two-tone "ding" - built with the Web Audio API so no sound
// file needs to be bundled/hosted. Plays when a brand-new order is detected.
function playNewOrderSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    playTone(880, 0, 0.15);
    playTone(1175, 0.15, 0.25);
  } catch {
    /* Web Audio unsupported/blocked - fail silently, toast still shows */
  }
}

// ---------------- Orders date-range filter ----------------
type OrderDateFilter = "all" | "today" | "yesterday" | "last7" | "last30" | "last90" | "last180" | "last365";

const ORDER_DATE_FILTERS: { key: OrderDateFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last Week" },
  { key: "last30", label: "Last Month" },
  { key: "last90", label: "Last 3 Months" },
  { key: "last180", label: "Last 6 Months" },
  { key: "last365", label: "Last Year" },
];

// Orders store createdAt as a plain IST datetime string (see db.js - the
// connection session is forced to +05:30), so comparing against a local
// "now" here lines up with how the backend already buckets today/yesterday
// for the Reports tab.
function filterOrdersByDateRange(orders: Order[], filter: OrderDateFilter): Order[] {
  if (filter === "all") return orders;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let rangeStart: Date;
  let rangeEnd: Date | null = null; // exclusive upper bound, null = up to now

  switch (filter) {
    case "today":
      rangeStart = startOfToday;
      break;
    case "yesterday":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 1);
      rangeEnd = startOfToday;
      break;
    case "last7":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 7);
      break;
    case "last30":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 30);
      break;
    case "last90":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 90);
      break;
    case "last180":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 180);
      break;
    case "last365":
      rangeStart = new Date(startOfToday);
      rangeStart.setDate(rangeStart.getDate() - 365);
      break;
    default:
      return orders;
  }

  return orders.filter((o: any) => {
    if (!o.createdAt) return false;
    const created = new Date(o.createdAt);
    if (created < rangeStart) return false;
    if (rangeEnd && created >= rangeEnd) return false;
    return true;
  });
}

function OrderDateFilterBar({
  value,
  onChange,
  search,
  onSearchChange,
  total,
  filteredCount,
}: {
  value: OrderDateFilter;
  onChange: (v: OrderDateFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  total: number;
  filteredCount: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const current = ORDER_DATE_FILTERS.find((f) => f.key === value) || ORDER_DATE_FILTERS[0];
  return (
    <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2 relative">
      <div className="relative">
        <button type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#202223] px-2.5 py-1.5 rounded-lg hover:bg-[#f1f2f3]"
        >
          {current.label} <ChevronDown size={14} className="text-[#8c9196]" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute z-20 top-full left-0 mt-1 w-44 bg-white border border-[#e1e3e5] rounded-lg shadow-lg py-1">
              {ORDER_DATE_FILTERS.map((f) => (
                <button type="button"
                  key={f.key}
                  onClick={() => { onChange(f.key); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f6f7] ${value === f.key ? "font-semibold text-[#202223]" : "text-[#494c50]"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
        <Search size={14} className="text-[#8c9196] shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search and filter"
          className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]"
        />
      </div>
      <span className="text-xs text-[#8c9196] hidden md:inline shrink-0">
        {filteredCount} of {total}
      </span>

    </div>
  );
}

// Shopify-style small dot + label badge used for payment status ("● Paid").
function DotBadge({ tone, label }: { tone: "success" | "warning" | "critical" | "neutral"; label: string }) {
  const dot: Record<string, string> = { success: "bg-[#0c8a3e]", warning: "bg-[#8a5a00]", critical: "bg-[#8e0000]", neutral: "bg-[#6d7175]" };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[#202223]">
      <span className={`w-2 h-2 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  );
}

function fulfillmentPill(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "delivered" || s === "out_for_delivery" || s === "shipped") return statusPill("neutral");
  if (s === "cancelled" || s === "returned") return statusPill("critical");
  if (s === "pending") return statusPill("warning");
  return statusPill("neutral");
}

const FragmentRow = Fragment;

// Same courier-by-destination rule used everywhere else (storefront Track Order,
// WhatsApp message, status-update email): Tamil Nadu + Pondicherry ship via
// ST Courier (shown as a RED badge), every other state via India Post (BLUE badge).
// Tamil Nadu orders carry the courier the customer picked at checkout
// (ST Courier or Post Office); that stored choice always wins over the state rule.
function getCourierForState(state?: string, courier?: string | null) {
  if (courier === "post_office") return { name: "Post Office", url: "https://www.indiapost.gov.in/", note: "99% home delivery" };
  if (courier === "st_courier") return { name: "ST Courier", url: "https://stcourier.com/track/shipment", note: "70% home delivery · 30% collect from nearby ST Courier office" };
  const stateLower = (state || "").trim().toLowerCase();
  const isTNorPondy = stateLower.includes("tamil") || stateLower.includes("pondicherry") || stateLower.includes("puducherry");
  return isTNorPondy
    ? { name: "ST Courier", url: "https://stcourier.com/track/shipment", note: "" }
    : { name: "India Post", url: "https://www.indiapost.gov.in/", note: "" };
}

// Small colored pill for the courier name: red for ST Courier, blue for India Post.
function CourierBadge({ state, courier: chosen }: { state?: string; courier?: string | null }) {
  const courier = getCourierForState(state, chosen);
  const isST = courier.name === "ST Courier";
  const cls = isST
    ? "bg-red-50 text-red-700 border border-red-200"
    : "bg-blue-50 text-blue-700 border border-blue-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls}`}>
      {courier.name}
    </span>
  );
}

// Blank form for the "Create Order" modal — admin manually logging a sale
// that didn't come through the storefront checkout (phone/WhatsApp/in-person).
const BLANK_MANUAL_ORDER = {
  customerName: "", customerPhone: "", customerEmail: "",
  phoneModel: "", shippingAddress: "", city: "", state: "", pincode: "",
  amount: "", note: "", photoUrl: "",
};

function OrdersTab({ onSelectTab }: { onSelectTab?: (tab: Tab) => void } = {}) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<OrderDateFilter>("all");
  const [search, setSearch] = useState("");
  const [manualOrder, setManualOrder] = useState<typeof BLANK_MANUAL_ORDER | null>(null);
  const [manualPhotoUploading, setManualPhotoUploading] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [busyOrders, setBusyOrders] = useState<string[]>([]);
  const busyOrdersRef = useRef(new Set<string>());
  const ordersRequestRef = useRef(0);
  // Tracks which order IDs we've already seen, so we only ding for orders
  // that are genuinely new (not on the very first load of the tab).
  const knownIdsRef = useRef<Set<string> | null>(null);
  // Order WhatsApp message templates + which status changes auto-open a
  // WhatsApp chat (Admin -> Settings -> Order WhatsApp Messages).
  const [waCfg, setWaCfg] = useState<{ tpl: Record<string, string>; auto: Record<string, boolean>; store: string }>({
    tpl: { ...WA_DEFAULT_TEMPLATES },
    auto: { ready_to_ship: true, delivered: true },
    store: "3DCaseMakers",
  });
  useEffect(() => {
    api.getAuth("/api/settings/admin").then((s: any) => {
      const tpl: Record<string, string> = { ...WA_DEFAULT_TEMPLATES };
      WA_ORDER_TEMPLATE_KEYS.forEach((t) => { if (typeof s?.[t.key] === "string" && s[t.key].trim()) tpl[t.key] = s[t.key]; });
      const auto = s?.waAutoOpen && typeof s.waAutoOpen === "object" ? s.waAutoOpen : { ready_to_ship: true, delivered: true };
      setWaCfg({ tpl, auto, store: s?.logoText || "3DCaseMakers" });
    }).catch(() => {});
  }, []);

  const load = async () => {
    const requestId = ++ordersRequestRef.current;
    const fresh: Order[] = await api.getAuth("/api/orders");
    if (requestId !== ordersRequestRef.current || busyOrdersRef.current.size > 0) return;
    setOrders(fresh);

    const freshIds = new Set(fresh.map((o: any) => o.id));
    if (knownIdsRef.current) {
      const newOnes = fresh.filter((o: any) => !knownIdsRef.current!.has(o.id));
      if (newOnes.length > 0) {
        playNewOrderSound();
        showToast(
          newOnes.length === 1 ? `New order received: ${newOnes[0].id}` : `${newOnes.length} new orders received`,
          "success"
        );
      }
    }
    knownIdsRef.current = freshIds;
  };

  useEffect(() => {
    load().catch((err: any) => showToast(err?.message || "Failed to load orders", "error"));
    // Live auto-refresh so new orders (and status changes made elsewhere)
    // show up without a manual reload. Every 8s (was every 1s — the whole
    // order list 3,600 times an hour) and only while the tab is visible;
    // background failures are silent instead of spamming error toasts.
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: string, status: string, trackingId?: string) => {
    if (busyOrdersRef.current.has(id)) return false;
    busyOrdersRef.current.add(id);
    setBusyOrders([...busyOrdersRef.current]);
    try {
      const order = orders.find((o: any) => o.id === id);
      await api.put(`/api/orders/${id}/status`, trackingId !== undefined ? { status, trackingId } : { status });
      ordersRequestRef.current++;
      setOrders((previous) => previous.map((o) => o.id === id ? { ...o, status: status as Order["status"], ...(trackingId !== undefined ? { trackingId } : {}) } : o));
      showToast("Order status updated", "success");
      // The backend fires the status-update email in the background (fire-and-forget),
      // so we can't know for certain it landed — but if the order has an email on
      // file, let the admin know one was triggered, right next to the status toast.
      if (order?.customerEmail) {
        setTimeout(() => showToast(`Status email is being sent to ${order.customerEmail}`, "success"), 450);
      }
      return true;
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
      return false;
    } finally {
      busyOrdersRef.current.delete(id);
      setBusyOrders([...busyOrdersRef.current]);
    }
  };

  const updatePayment = async (order: Order, paymentStatus: NonNullable<Order["paymentStatus"]>) => {
    if (busyOrdersRef.current.has(order.id) || paymentStatus === order.paymentStatus) return;
    if (paymentStatus === "paid" && !confirm(`Confirm that payment was collected for order ${order.id}?`)) return;
    if (paymentStatus === "refunded" && !confirm(`Confirm that the collected payment was refunded for order ${order.id}?`)) return;
    busyOrdersRef.current.add(order.id);
    setBusyOrders([...busyOrdersRef.current]);
    try {
      await api.put(`/api/orders/${order.id}/payment`, { paymentStatus });
      ordersRequestRef.current++;
      setOrders((previous) => previous.map((o) => o.id === order.id ? { ...o, paymentStatus } : o));
      showToast("Payment status updated", "success");
    } catch (err: any) {
      showToast(err.message || "Couldn't update payment status", "error");
    } finally {
      busyOrdersRef.current.delete(order.id);
      setBusyOrders([...busyOrdersRef.current]);
    }
  };

  // Builds the default WhatsApp message sent to a customer for a given order:
  // order id, customer name, phone model(s), total bill, and (if available) the tracking id + link.
  // `overrideTrackingId` lets the Ready to Ship flow build the message with the
  // tracking ID just entered, before the orders list has reloaded from the server.
  // WhatsApp message for an order in a given status, from the admin's
  // editable templates. `status` defaults to the order's current status;
  // `overrideTrackingId` lets Ready to Ship use the ID just typed in.
  const templateKeyFor = (status: string) =>
    (WA_ORDER_TEMPLATE_KEYS.find((t) => t.status === status)?.key as string) ||
    (status === "pending" ? "waTplConfirmed" : status === "returned" ? "waTplCancelled" : "waTplConfirmed");
  const buildWaMessage = (o: any, overrideTrackingId?: string, status?: string) => {
    const st = status || (overrideTrackingId ? "ready_to_ship" : o.status);
    return fillOrderTemplate(waCfg.tpl[templateKeyFor(st)] || WA_DEFAULT_TEMPLATES.waTplConfirmed, { ...o, status: st }, {
      trackingId: overrideTrackingId,
      storeName: waCfg.store,
    });
  };
  const saveStatusAndOpenWhatsApp = async (order: Order, status: string, trackingId?: string) => {
    const phone = (order.customerPhone || "").replace(/\D/g, "");
    const shouldOpen = phone.length >= 10 && (status === "ready_to_ship" ? waCfg.auto.ready_to_ship !== false : !!waCfg.auto[status]);
    // Reserve a tab during the click gesture, but only display the customer's
    // new status message after the server confirms that the status was saved.
    const popup = shouldOpen ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    const success = await updateStatus(order.id, status, trackingId);
    if (!success) { popup?.close(); return; }
    if (popup && !popup.closed) popup.location.replace(`https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(buildWaMessage(order, trackingId, status))}`);
    else if (shouldOpen) showToast("Status saved. Use the WhatsApp button to open the customer message.", "success");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this order?")) return;
    try {
      await api.del(`/api/orders/${id}`);
      showToast("Order deleted", "success");
      load();
    } catch (err: any) {
      showToast(err.message || "Failed to delete order", "error");
    }
  };

  const uploadManualPhoto = async (file: File) => {
    setManualPhotoUploading(true);
    try {
      const res = await api.upload(file);
      setManualOrder((f) => (f ? { ...f, photoUrl: res.url } : f));
    } catch (err: any) {
      showToast(err.message || "Failed to upload photo", "error");
    } finally {
      setManualPhotoUploading(false);
    }
  };

  const submitManualOrder = async () => {
    if (!manualOrder) return;
    if (!manualOrder.customerName.trim()) return showToast("Customer name is required", "error");
    if (!manualOrder.customerPhone.trim()) return showToast("Customer phone is required", "error");
    const amountNum = Number(manualOrder.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return showToast("Enter a valid amount", "error");

    setManualSaving(true);
    try {
      const created = await api.post(
        "/api/orders/manual",
        {
          customerName: manualOrder.customerName.trim(),
          customerPhone: manualOrder.customerPhone.trim(),
          customerEmail: manualOrder.customerEmail.trim(),
          phoneModel: manualOrder.phoneModel.trim(),
          shippingAddress: manualOrder.shippingAddress.trim(),
          city: manualOrder.city.trim(),
          state: manualOrder.state.trim(),
          pincode: manualOrder.pincode.trim(),
          amount: amountNum,
          photoUrl: manualOrder.photoUrl,
          note: manualOrder.note.trim(),
        },
        true
      );
      showToast(`Order ${created.id} created`, "success");
      setManualOrder(null);
      load();
    } catch (err: any) {
      showToast(err.message || "Failed to create order", "error");
    } finally {
      setManualSaving(false);
    }
  };

  const filteredOrders = filterOrdersByDateRange(orders, dateFilter).filter((o: any) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(o.id).toLowerCase().includes(q) ||
      (o.customerName || "").toLowerCase().includes(q) ||
      (o.customerPhone || "").toLowerCase().includes(q)
    );
  });

  const todayOrders = filterOrdersByDateRange(orders, "today");
  const todayItems = todayOrders.reduce((sum: number, o: any) => sum + (o.items?.length || 0), 0);
  const todayDelivered = todayOrders.filter((o: any) => o.status === "delivered").length;
  const metrics = [
    { label: "Orders", value: String(todayOrders.length) },
    { label: "Items ordered", value: String(todayItems) },
    { label: "Sales reversals", value: "₹0" },
    { label: "Orders fulfilled", value: `${todayOrders.filter((o: any) => o.status !== "pending").length}` },
    { label: "Orders delivered", value: String(todayDelivered) },
    { label: "Order to fulfillment", value: "—" },
  ];

  return (
    <div>
      {/* Today metric strip — mirrors the small sparkline cards in Shopify's Orders header */}
      <div className="bg-white border border-[#e1e3e5] rounded-xl mb-3 overflow-x-auto">
        <div className="flex divide-x divide-[#e1e3e5] min-w-max">
          <div className="px-4 py-3 flex items-center gap-2 shrink-0">
            <Clock3 size={14} className="text-[#6d7175]" />
            <span className="text-sm font-semibold text-[#202223]">Today</span>
          </div>
          {metrics.map((m) => (
            <div key={m.label} className="px-5 py-3 min-w-[140px]">
              <p className="text-xs font-semibold text-[#202223]">{m.label}</p>
              <p className="text-lg font-bold text-[#202223] mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end mb-2">
        <button type="button" onClick={() => setManualOrder({ ...BLANK_MANUAL_ORDER })} className={btnPrimary}>
          + Create Order
        </button>
      </div>

      <OrderDateFilterBar value={dateFilter} onChange={setDateFilter} search={search} onSearchChange={setSearch} total={orders.length} filteredCount={filteredOrders.length} />

      {/* Table */}
      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>

              <th className={thCls}>Order</th>
              <th className={thCls}>Date</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Channel</th>
              <th className={thCls}>Total</th>
              <th className={thCls}>Payment status</th>
              <th className={thCls}>Fulfillment status</th>
              <th className={thCls}>Courier</th>
              <th className={thCls}>Items</th>
              <th className={thCls}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((o: any) => {
              const isOpen = expanded === o.id;
              const waNumber = (o.customerPhone || "").replace(/\D/g, "");
              return (
                <FragmentRow key={o.id}>
                  <tr className={trHover} onClick={() => setExpanded(isOpen ? null : o.id)}>

                    <td className={tdCls}>
                      <span className="font-semibold text-[#2c6ecb]">{o.id}</span>
                    </td>
                    <td className={tdCls}>
                      {o.createdAt
                        ? `${new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} at ${new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
                        : "—"}
                    </td>
                    <td className={tdCls}>{o.customerName || o.customerPhone}</td>
                    <td className={tdCls}>
                      {o.source === "manual" ? (
                        <span className="inline-flex items-center gap-1 bg-[#fef3e0] text-[#8a5a00] text-[11px] font-bold px-2 py-0.5 rounded-full">
                          Manually Created
                        </span>
                      ) : (
                        "Online Store"
                      )}
                    </td>
                    <td className={tdCls}>₹{o.total}</td>
                    <td className={tdCls}>
                      <DotBadge
                        tone={
                          o.paymentStatus === "paid" ? "success"
                          : o.paymentStatus === "pending_verification" ? "warning"
                          : o.paymentStatus === "awaiting_payment" ? "warning"
                          : o.paymentStatus === "failed" ? "critical"
                          : o.paymentStatus === "refunded" ? "neutral"
                          : "warning"
                        }
                        label={
                          o.paymentStatus === "paid" ? "Paid"
                          : o.paymentStatus === "pending_verification" ? "Pending Verification"
                          : o.paymentStatus === "awaiting_payment" ? "Awaiting Payment"
                          : o.paymentStatus === "failed" ? "Failed"
                          : o.paymentStatus === "refunded" ? "Refunded"
                          : "Payment pending"
                        }
                      />
                    </td>
                    <td className={tdCls}>
                      <span className={fulfillmentPill(o.status)}>{o.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className={tdCls}><CourierBadge state={o.state} courier={o.courier} /></td>
                    <td className={tdCls}>{o.items?.length || 0} item{(o.items?.length || 0) === 1 ? "" : "s"}</td>
                    <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Fulfillment status for ${o.id}`}
                          disabled={busyOrders.includes(o.id)}
                          value={o.status}
                          onChange={(e) => {
                            const newStatus = e.target.value;
                            if (newStatus === "ready_to_ship") {
                              const tid = window.prompt("Enter the tracking ID for this shipment:", o.trackingId || "");
                              if (tid === null) return;
                              if (!tid.trim()) { showToast("Tracking ID is required to mark as Ready to Ship", "error"); return; }
                              saveStatusAndOpenWhatsApp(o, newStatus, tid.trim());
                            } else {
                              saveStatusAndOpenWhatsApp(o, newStatus);
                            }
                          }}
                          className="bg-white border border-[#c9cccf] rounded-lg px-2 py-1 text-[#202223] text-xs"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                        </select>
                        {waNumber && (
                          <a
                            href={`https://wa.me/91${waNumber.slice(-10)}?text=${encodeURIComponent(buildWaMessage(o))}`}
                            target="_blank" rel="noreferrer"
                            className="text-green-600 hover:text-green-700 p-1"
                            title="WhatsApp customer"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}
                        <button type="button" onClick={() => remove(o.id)} className="text-red-400 hover:text-red-600 p-1" title="Delete order">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="p-0 border-b border-[#f1f2f3]">
                        <div className="p-4 grid md:grid-cols-2 gap-4 bg-[#fafbfb]">
                          <div>
                            <h4 className="text-xs font-bold uppercase text-[#8c9196] mb-2 flex items-center gap-2">
                              Customer
                              {o.source === "manual" && (
                                <span className="inline-flex items-center gap-1 bg-[#fef3e0] text-[#8a5a00] text-[10px] font-bold px-1.5 py-0.5 rounded-full normal-case">
                                  Manually Created
                                </span>
                              )}
                            </h4>
                            <div className="bg-white border border-[#e1e3e5] rounded-lg p-3 space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[#202223]">{o.customerName}</span>
                                <button type="button" onClick={() => copyText(o.customerName)} className="text-[#8c9196] hover:text-[#202223]"><Copy size={13} /></button>
                              </div>
                              <div className="flex items-center justify-between text-[#6d7175]">
                                <span>{o.customerPhone}</span>
                                <button type="button" onClick={() => copyText(o.customerPhone)} className="text-[#8c9196] hover:text-[#202223]"><Copy size={13} /></button>
                              </div>
                              {o.customerAltPhone && (
                                <div className="flex items-center justify-between text-[#6d7175] text-xs">
                                  <span>ALT: {o.customerAltPhone}</span>
                                  <button type="button" onClick={() => copyText(o.customerAltPhone)} className="text-[#8c9196] hover:text-[#202223]"><Copy size={13} /></button>
                                </div>
                              )}
                              {o.customerEmail && <div className="text-[#6d7175] text-xs">{o.customerEmail}</div>}
                            </div>
                            <h4 className="text-xs font-bold uppercase text-[#8c9196] mb-2 mt-3">Ship To</h4>
                            <div className="bg-white border border-[#e1e3e5] rounded-lg p-3 text-sm text-[#202223] space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <span>{o.shippingAddress}</span>
                                <button type="button" onClick={() => copyText(o.shippingAddress)} className="text-[#8c9196] hover:text-[#202223] shrink-0"><Copy size={13} /></button>
                              </div>
                              <p className="text-[#6d7175]">{o.city}, {o.state}</p>
                              <p className="font-bold text-[#202223]">PIN: {o.pincode}</p>
                            </div>
                            <h4 className="text-xs font-bold uppercase text-[#8c9196] mb-2 mt-3">Tracking</h4>
                            <div className="bg-white border border-[#e1e3e5] rounded-lg p-3 text-sm text-[#202223] space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <CourierBadge state={o.state} courier={o.courier} />
                                <a
                                  href={getCourierForState(o.state, o.courier).url}
                                  target="_blank" rel="noreferrer"
                                  className="text-[11px] text-[#2c6ecb] hover:underline shrink-0"
                                >
                                  Track link →
                                </a>
                              </div>
                              {getCourierForState(o.state, o.courier).note && (
                                <p className="text-[11px] text-[#6d7175]">
                                  {o.courier ? "Customer selected: " : ""}{getCourierForState(o.state, o.courier).note}
                                </p>
                              )}
                              <div className="flex items-center justify-between gap-2">
                                <span className={o.trackingId ? "font-bold text-emerald-700" : "text-[#8c9196]"}>
                                  {o.trackingId || "No tracking ID yet"}
                                </span>
                                <button type="button"
                                  onClick={() => {
                                    const tid = window.prompt("Enter / update the tracking ID:", o.trackingId || "");
                                    if (tid === null) return;
                                    updateStatus(o.id, o.status, tid.trim());
                                  }}
                                  className="text-[#8c9196] hover:text-[#202223] shrink-0 text-xs font-semibold"
                                >
                                  {o.trackingId ? "Edit" : "Add"}
                                </button>
                              </div>
                            </div>
                            <h4 className="text-xs font-bold uppercase text-[#8c9196] mb-2 mt-3">Payment</h4>
                            <div className="bg-white border border-[#e1e3e5] rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#202223]">Method: {o.paymentMethod === "manual_upi" ? "Direct UPI" : o.paymentMethod || "Online"}</span>
                                <DotBadge
                                  tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "pending_verification" ? "warning" : o.paymentStatus === "failed" ? "critical" : "warning"}
                                  label={o.paymentStatus === "paid" ? "Paid" : o.paymentStatus === "pending_verification" ? "Pending Verification" : o.paymentStatus === "awaiting_payment" ? "Awaiting Payment" : o.paymentStatus === "failed" ? "Failed" : "Pending"}
                                />
                              </div>
                              {o.paymentMethod === "manual_upi" && (
                                <div className="bg-amber-50/70 border border-amber-200/60 rounded-md p-2 text-xs flex items-center justify-between">
                                  <span className="text-amber-900 font-medium">Direct UPI Payment</span>
                                  <button
                                    type="button"
                                    onClick={() => onSelectTab?.("Payment Verification")}
                                    className="font-bold text-blue-600 hover:underline shrink-0"
                                  >
                                    Open Verification Tool &rarr;
                                  </button>
                                </div>
                              )}
                              <label htmlFor={`payment-${o.id}`} className="text-xs text-[#6d7175] block">Payment Status:</label>
                              <select id={`payment-${o.id}`} value={o.paymentStatus || "pending"} disabled={busyOrders.includes(o.id)} onChange={(event) => updatePayment(o, event.target.value as NonNullable<Order["paymentStatus"]>)} className={inputCls}>
                                <option value="awaiting_payment">Awaiting Payment (UPI)</option>
                                <option value="pending_verification">Pending Verification</option>
                                <option value="pending">Payment pending</option>
                                <option value="paid">Paid</option>
                                <option value="failed">Payment failed</option>
                                <option value="refunded" disabled={o.paymentStatus !== "paid" && o.paymentStatus !== "refunded"}>Refunded</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold uppercase text-[#8c9196] mb-2">Order Items ({o.items?.length || 0})</h4>
                            <div className="space-y-2">
                              {(o.items || []).map((item: any, i: number) => (
                                <div key={i} className="bg-white border border-[#e1e3e5] rounded-lg p-3 flex items-center gap-3">
                                  {item.product?.images?.[0] && (
                                    <img src={api.imageUrl(item.product.images[0])} className="w-12 h-12 rounded-lg object-cover border border-[#c9cccf]" />
                                  )}
                                  <div className="flex-1 text-sm">
                                    <p className="font-semibold text-[#202223]">{item.product?.title}</p>
                                    {item.selectedModel && <p className="text-xs text-blue-600 font-medium">{item.selectedModel}</p>}
                                    <p className="text-xs text-[#8c9196]">Qty: {item.quantity}</p>
                                    {item.customName && <p className="text-xs font-bold text-emerald-700 mt-0.5">Text 1: "{item.customName}"</p>}
                                    {item.customName2 && <p className="text-xs font-bold text-emerald-700 mt-0.5">Text 2: "{item.customName2}"</p>}
                                    {item.customName3 && <p className="text-xs font-bold text-emerald-700 mt-0.5">Text 3: "{item.customName3}"</p>}
                                    {item.customVariant && <p className="text-xs font-bold text-emerald-700 mt-0.5">{item.customVariant}</p>}
                                  </div>
                                  {item.customImage && (
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                      <a href={api.imageUrl(item.customImage)} target="_blank" rel="noreferrer" title={`Customer's uploaded ${isVideoFile(item.customImage) ? "video" : "photo"} — click to view full size`}>
                                        {isVideoFile(item.customImage) ? (
                                          <video src={api.imageUrl(item.customImage)} className="w-12 h-12 rounded-lg object-cover ring-2 ring-emerald-500" muted />
                                        ) : (
                                          <img src={api.imageUrl(item.customImage)} className="w-12 h-12 rounded-lg object-cover ring-2 ring-emerald-500" />
                                        )}
                                      </a>
                                      <span className="text-[9px] font-bold text-emerald-600 uppercase">{(item.customImage2 || item.customImage3) ? "Photo 1" : (isVideoFile(item.customImage) ? "Print video" : "Print photo")}</span>
                                      <button type="button" onClick={() => downloadCustomerFile(item.customImage, `${o.id}-${i + 1}-1`)} className="text-[9px] font-bold text-[#6d7175] hover:text-[#202223] flex items-center gap-0.5" title="Download this file">
                                        <Download size={10} /> Download
                                      </button>
                                    </div>
                                  )}
                                  {item.customImage2 && (
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                      <a href={api.imageUrl(item.customImage2)} target="_blank" rel="noreferrer" title="Customer's uploaded photo 2 — click to view full size">
                                        <img src={api.imageUrl(item.customImage2)} className="w-12 h-12 rounded-lg object-cover ring-2 ring-emerald-500" />
                                      </a>
                                      <span className="text-[9px] font-bold text-emerald-600 uppercase">Photo 2</span>
                                      <button type="button" onClick={() => downloadCustomerFile(item.customImage2, `${o.id}-${i + 1}-2`)} className="text-[9px] font-bold text-[#6d7175] hover:text-[#202223] flex items-center gap-0.5" title="Download this file">
                                        <Download size={10} /> Download
                                      </button>
                                    </div>
                                  )}
                                  {item.customImage3 && (
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                      <a href={api.imageUrl(item.customImage3)} target="_blank" rel="noreferrer" title="Customer's uploaded photo 3 — click to view full size">
                                        <img src={api.imageUrl(item.customImage3)} className="w-12 h-12 rounded-lg object-cover ring-2 ring-emerald-500" />
                                      </a>
                                      <span className="text-[9px] font-bold text-emerald-600 uppercase">Photo 3</span>
                                      <button type="button" onClick={() => downloadCustomerFile(item.customImage3, `${o.id}-${i + 1}-3`)} className="text-[9px] font-bold text-[#6d7175] hover:text-[#202223] flex items-center gap-0.5" title="Download this file">
                                        <Download size={10} /> Download
                                      </button>
                                    </div>
                                  )}
                                  <p className="text-sm font-bold text-[#202223]">₹{(item.product?.price || 0) * item.quantity}</p>
                                </div>
                              ))}
                            </div>
                            <div className="text-sm mt-3 space-y-1 text-[#6d7175]">
                              <div className="flex justify-between"><span>Subtotal</span><span>₹{o.subtotal}</span></div>
                              <div className="flex justify-between"><span>Shipping</span><span>{o.shipping ? `₹${o.shipping}` : "Free"}</span></div>
                              <div className="flex justify-between font-bold text-[#202223]"><span>Total</span><span>₹{o.total}</span></div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && <p className="text-[#8c9196] text-sm p-4">No orders yet.</p>}
      </div>

      {manualOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !manualSaving && setManualOrder(null)}>
          <div className={`${card} admin-modal-solid w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-3`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-black text-[#202223]">Create Order</h3>
              <button type="button" onClick={() => !manualSaving && setManualOrder(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#6d7175] -mt-1">For sales made by phone, WhatsApp, or in person — this order will be tagged "Manually Created".</p>

            <input placeholder="Customer name *" value={manualOrder.customerName} onChange={(e) => setManualOrder({ ...manualOrder, customerName: e.target.value })} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Phone number *" value={manualOrder.customerPhone} onChange={(e) => setManualOrder({ ...manualOrder, customerPhone: e.target.value })} className={inputCls} />
              <input placeholder="Email (optional)" value={manualOrder.customerEmail} onChange={(e) => setManualOrder({ ...manualOrder, customerEmail: e.target.value })} className={inputCls} />
            </div>
            <input placeholder="Phone model (e.g. iPhone 15 Pro)" value={manualOrder.phoneModel} onChange={(e) => setManualOrder({ ...manualOrder, phoneModel: e.target.value })} className={inputCls} />
            <textarea placeholder="Shipping address" value={manualOrder.shippingAddress} onChange={(e) => setManualOrder({ ...manualOrder, shippingAddress: e.target.value })} className={inputCls} rows={2} />
            <div className="grid grid-cols-3 gap-2">
              <input placeholder="City" value={manualOrder.city} onChange={(e) => setManualOrder({ ...manualOrder, city: e.target.value })} className={inputCls} />
              <input placeholder="State" value={manualOrder.state} onChange={(e) => setManualOrder({ ...manualOrder, state: e.target.value })} className={inputCls} />
              <input placeholder="Pincode" value={manualOrder.pincode} onChange={(e) => setManualOrder({ ...manualOrder, pincode: e.target.value })} className={inputCls} />
            </div>
            <input placeholder="Product / note (e.g. Gel Case - Gold Plate)" value={manualOrder.note} onChange={(e) => setManualOrder({ ...manualOrder, note: e.target.value })} className={inputCls} />
            <input type="number" min="0" placeholder="Amount (₹) *" value={manualOrder.amount} onChange={(e) => setManualOrder({ ...manualOrder, amount: e.target.value })} className={inputCls} />

            <div>
              <label className="text-xs font-bold text-[#202223] block mb-1">Reference Photo (optional)</label>
              {manualOrder.photoUrl ? (
                <div className="relative w-20 h-20">
                  <img src={api.imageUrl(manualOrder.photoUrl)} className="w-full h-full object-cover rounded-lg border border-[#e1e3e5]" />
                  <button type="button" onClick={() => setManualOrder({ ...manualOrder, photoUrl: "" })} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-[#c9cccf] flex flex-col items-center justify-center cursor-pointer text-[#8c9196] hover:border-[#8c9196] hover:text-[#202223]">
                  {manualPhotoUploading ? (
                    <span className="text-[10px]">Uploading…</span>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span className="text-[9px] mt-0.5">Add photo</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" disabled={manualPhotoUploading} onChange={(e) => e.target.files?.[0] && uploadManualPhoto(e.target.files[0])} />
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setManualOrder(null)} disabled={manualSaving} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={submitManualOrder} disabled={manualSaving || manualPhotoUploading} className={btnPrimary}>
                {manualSaving ? "Creating…" : "Create Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Payment Verification (Direct UPI Manual Payments) ----------------
const REJECTION_PRESET_REASONS = [
  "Payment not received in bank/UPI account",
  "Transaction / UTR not found",
  "Incorrect payment amount received",
  "Invalid Transaction ID / UTR format",
  "Duplicate Transaction ID / UTR",
  "Screenshot does not match transaction",
  "Other",
];

// Payment Verification: one consistent button scale (matches btnPrimary / btnSecondary)
const pvBtnSm = "inline-flex items-center justify-center gap-1.5 h-8 w-[92px] shrink-0 whitespace-nowrap rounded-lg text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]";
const pvBtnDanger = "inline-flex items-center justify-center gap-1.5 min-h-9 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-[#8e0000] bg-[#fed3d1] hover:bg-[#fcc1be] border border-[#f5a9a5] transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]";
const pvBtnDangerSolid = "inline-flex items-center justify-center gap-1.5 min-h-9 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-white bg-[#d82c0d] hover:bg-[#bc2200] transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff]";

function PaymentVerificationTab({
  onSelectTab,
  onUpdated,
}: {
  onSelectTab?: (tab: Tab) => void;
  onUpdated?: () => void;
} = {}) {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<ManualUpiPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending_verification" | "verified" | "failed" | "all">("pending_verification");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ManualUpiPayment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmModalOrder, setConfirmModalOrder] = useState<ManualUpiPayment | null>(null);
  const [rejectModalOrder, setRejectModalOrder] = useState<ManualUpiPayment | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_PRESET_REASONS[0]);
  const [rejectionNotes, setRejectionNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [screenshotZoom, setScreenshotZoom] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data: ManualUpiPayment[] = await api.getAuth(`/api/payments/manual-upi/admin/list?status=${statusFilter}`);
      setPayments(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast(err.message || "Failed to load payment verifications", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [statusFilter, refreshKey]);

  // Auto-refresh periodically while active
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") {
        api.getAuth(`/api/payments/manual-upi/admin/list?status=${statusFilter}`)
          .then((data) => {
            if (Array.isArray(data)) setPayments(data);
          })
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(iv);
  }, [statusFilter]);

  const copyUtr = (utr: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(utr);
      setCopiedUtr(utr);
      setTimeout(() => setCopiedUtr(null), 1800);
    }
  };

  const openDetails = async (p: ManualUpiPayment) => {
    setSelectedOrder(p);
    setDetailLoading(true);
    try {
      const detail: ManualUpiPayment = await api.getAuth(`/api/payments/manual-upi/admin/${p.orderId}`);
      if (detail && detail.orderId === p.orderId) {
        setSelectedOrder(detail);
      }
    } catch {
      // fallback to list item representation
    } finally {
      setDetailLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmModalOrder) return;
    setIsSubmitting(true);
    try {
      await api.post(`/api/payments/manual-upi/admin/${confirmModalOrder.orderId}/confirm`, {}, true);
      showToast(`Payment verified for order ${confirmModalOrder.orderId}. Order is now Processing.`, "success");
      setConfirmModalOrder(null);
      if (selectedOrder?.orderId === confirmModalOrder.orderId) {
        setSelectedOrder(null);
      }
      setRefreshKey((k) => k + 1);
      onUpdated?.();
    } catch (err: any) {
      showToast(err.message || "Failed to confirm payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModalOrder) return;
    setIsSubmitting(true);
    try {
      const fullReason = rejectionReason === "Other"
        ? (rejectionNotes.trim() || "Payment verification failed")
        : (rejectionNotes.trim() ? `${rejectionReason}: ${rejectionNotes.trim()}` : rejectionReason);

      await api.post(
        `/api/payments/manual-upi/admin/${rejectModalOrder.orderId}/reject`,
        { reason: fullReason },
        true
      );
      showToast(`Payment rejected for order ${rejectModalOrder.orderId}`, "success");
      setRejectModalOrder(null);
      setRejectionReason(REJECTION_PRESET_REASONS[0]);
      setRejectionNotes("");
      if (selectedOrder?.orderId === rejectModalOrder.orderId) {
        setSelectedOrder(null);
      }
      setRefreshKey((k) => k + 1);
      onUpdated?.();
    } catch (err: any) {
      showToast(err.message || "Failed to reject payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered by search query
  const filteredPayments = payments.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.orderId.toLowerCase().includes(q) ||
      (p.customerName || "").toLowerCase().includes(q) ||
      (p.customerPhone || "").toLowerCase().includes(q) ||
      (p.transactionId || "").toLowerCase().includes(q) ||
      (p.upiApp || "").toLowerCase().includes(q)
    );
  });

  const pendingCount = payments.filter((p) => p.paymentStatus === "pending_verification").length;
  const verifiedCount = payments.filter((p) => p.paymentStatus === "verified").length;
  const failedCount = payments.filter((p) => p.paymentStatus === "failed").length;

  return (
    <div>
      <p className="text-sm text-[#6d7175] mb-3">
        Review customer UPI UTR submissions, match with your bank statement, and confirm or reject payments.
      </p>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <button
          type="button"
          onClick={() => setStatusFilter("pending_verification")}
          className={`${card} p-4 text-left transition-all duration-150 hover:border-[#c9cccf] ${
            statusFilter === "pending_verification" ? "!border-[#458fff] ring-2 ring-[#458fff]/20" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6d7175]">Pending verification</span>
            <span className="w-2 h-2 rounded-full bg-[#8a5a00]" />
          </div>
          <p className="text-2xl font-semibold text-[#202223] mt-1 leading-tight">{pendingCount}</p>
          <p className="text-xs text-[#8c9196] mt-0.5">Awaiting your approval</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("verified")}
          className={`${card} p-4 text-left transition-all duration-150 hover:border-[#c9cccf] ${
            statusFilter === "verified" ? "!border-[#458fff] ring-2 ring-[#458fff]/20" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6d7175]">Verified</span>
            <CheckCircle2 size={14} className="text-[#0c8a3e]" />
          </div>
          <p className="text-2xl font-semibold text-[#202223] mt-1 leading-tight">{verifiedCount}</p>
          <p className="text-xs text-[#8c9196] mt-0.5">Approved &amp; processing</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("failed")}
          className={`${card} p-4 text-left transition-all duration-150 hover:border-[#c9cccf] ${
            statusFilter === "failed" ? "!border-[#458fff] ring-2 ring-[#458fff]/20" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6d7175]">Failed / rejected</span>
            <X size={14} className="text-[#8e0000]" />
          </div>
          <p className="text-2xl font-semibold text-[#202223] mt-1 leading-tight">{failedCount}</p>
          <p className="text-xs text-[#8c9196] mt-0.5">Rejected submissions</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`${card} p-4 text-left transition-all duration-150 hover:border-[#c9cccf] ${
            statusFilter === "all" ? "!border-[#458fff] ring-2 ring-[#458fff]/20" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[#6d7175]">Total records</span>
            <Package size={14} className="text-[#6d7175]" />
          </div>
          <p className="text-2xl font-semibold text-[#202223] mt-1 leading-tight">{payments.length}</p>
          <p className="text-xs text-[#8c9196] mt-0.5">All UPI manual payments</p>
        </button>
      </div>

      {/* Filter Tabs, Search & Refresh (attached to the table, same as Customers/Orders) */}
      <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {[
            { key: "pending_verification", label: "Pending" },
            { key: "verified", label: "Verified" },
            { key: "failed", label: "Rejected" },
            { key: "all", label: "All" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key as any)}
              className={`h-8 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#494c50] hover:bg-[#f1f2f3]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
          <Search size={14} className="text-[#8c9196] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Order ID, customer, UTR, app"
            className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-[#8c9196] hover:text-[#202223]">
              <X size={13} />
            </button>
          )}
        </div>

        <span className="text-xs text-[#8c9196] hidden md:inline shrink-0">
          {filteredPayments.length} of {payments.length}
        </span>

        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className={btnSecondary}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        <table className="w-full border-collapse min-w-[1100px] text-left">
          <thead>
            <tr>
              <th className={thCls}>Order ID</th>
              <th className={thCls}>Customer</th>
              <th className={thCls}>Amount</th>
              <th className={thCls}>UPI App</th>
              <th className={thCls}>Transaction ID / UTR</th>
              <th className={thCls}>Screenshot</th>
              <th className={thCls}>Submitted At</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Verification Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-10 text-center text-sm text-[#8c9196]">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-[#6d7175]" />
                  Loading payment submissions...
                </td>
              </tr>
            ) : filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-10 text-center">
                  <div className="max-w-sm mx-auto">
                    <CreditCard size={32} className="mx-auto text-zinc-300 mb-2" />
                    <p className="text-sm font-bold text-[#202223]">
                      {statusFilter === "pending_verification"
                        ? "No payments pending verification!"
                        : "No payment records found"}
                    </p>
                    <p className="text-xs text-[#8c9196] mt-1">
                      {statusFilter === "pending_verification"
                        ? "All customer UPI payments have been verified. Great job!"
                        : "No manual UPI submissions match the active filters."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredPayments.map((p) => {
                const isPending = p.paymentStatus === "pending_verification";
                const isVerified = p.paymentStatus === "verified";
                const isFailed = p.paymentStatus === "failed";
                const isCopied = copiedUtr === p.transactionId;

                return (
                  <tr key={p.id} className={trHover}>
                    <td className={tdCls}>
                      <button
                        type="button"
                        onClick={() => openDetails(p)}
                        className="font-medium text-[#2c6ecb] hover:underline"
                      >
                        {p.orderId}
                      </button>
                    </td>

                    <td className={tdCls}>
                      <div>
                        <p className="font-medium text-[#202223]">{p.customerName || "Customer"}</p>
                        {p.customerPhone && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-[#6d7175]">{p.customerPhone}</span>
                            <a
                              href={`https://wa.me/91${p.customerPhone.replace(/\D/g, "").slice(-10)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700"
                              title="Chat on WhatsApp"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MessageCircle size={13} />
                            </a>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className={tdCls}>
                      <span className="font-semibold text-[#202223]">
                        ₹{(p.expectedAmount || p.orderTotal || 0).toLocaleString("en-IN")}
                      </span>
                    </td>

                    <td className={tdCls}>
                      <span className={statusPill("neutral")}>
                        {p.upiApp || "UPI"}
                      </span>
                    </td>

                    <td className={tdCls}>
                      {p.transactionId ? (
                        <div className="flex items-center gap-1.5">
                          <code className="bg-[#f6f6f7] text-[#202223] px-2 py-1 rounded-md font-mono text-xs font-semibold border border-[#e1e3e5]">
                            {p.transactionId}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyUtr(p.transactionId!)}
                            className="text-[#8c9196] hover:text-[#202223] p-1 rounded hover:bg-[#f1f2f3]"
                            title="Copy UTR"
                          >
                            {isCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#8c9196] italic">Not submitted yet</span>
                      )}
                    </td>

                    <td className={tdCls}>
                      {p.screenshotPath ? (
                        <button
                          type="button"
                          onClick={() => setScreenshotZoom(api.imageUrl(p.screenshotPath!))}
                          className="group relative w-9 h-9 rounded-lg border border-[#e1e3e5] overflow-hidden bg-zinc-50 shrink-0 hover:ring-2 hover:ring-[#458fff]"
                          title="Click to view full screenshot"
                        >
                          <img
                            src={api.imageUrl(p.screenshotPath)}
                            alt="Screenshot"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye size={12} className="text-white" />
                          </div>
                        </button>
                      ) : (
                        <span className="text-xs text-[#8c9196]">—</span>
                      )}
                    </td>

                    <td className={tdCls}>
                      <span className="text-xs text-[#6d7175]">
                        {p.submittedAt
                          ? new Date(p.submittedAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : new Date(p.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                      </span>
                    </td>

                    <td className={tdCls}>
                      {isPending && (
                        <span className={statusPill("warning")}>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8a5a00]" />
                          Pending
                        </span>
                      )}
                      {isVerified && (
                        <span className={statusPill("success")}>
                          <CheckCircle2 size={12} />
                          Verified
                        </span>
                      )}
                      {isFailed && (
                        <span className={statusPill("critical")} title={p.rejectionReason || "Payment rejected"}>
                          <X size={12} />
                          Rejected
                        </span>
                      )}
                    </td>

                    <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmModalOrder(p)}
                              className={`${pvBtnSm} btn-liquid-dark text-white`}
                            >
                              <Check size={13} strokeWidth={2.5} />
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalOrder(p);
                                setRejectionReason(REJECTION_PRESET_REASONS[0]);
                                setRejectionNotes("");
                              }}
                              className={`${pvBtnSm} text-[#8e0000] bg-[#fed3d1] hover:bg-[#fcc1be] border border-[#f5a9a5]`}
                            >
                              <X size={13} strokeWidth={2.5} />
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openDetails(p)}
                            className={`${pvBtnSm} btn-liquid-light text-[#202223]`}
                          >
                            <Eye size={13} />
                            Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* DETAIL DRAWER / MODAL */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className={`${card} admin-modal-solid w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#e1e3e5] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-[#202223]">
                    Order #{selectedOrder.orderId}
                  </h3>
                  {selectedOrder.paymentStatus === "pending_verification" && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                      Pending Verification
                    </span>
                  )}
                  {selectedOrder.paymentStatus === "verified" && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                      Verified
                    </span>
                  )}
                  {selectedOrder.paymentStatus === "failed" && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
                      Verification Failed
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6d7175] mt-0.5">
                  Placed on{" "}
                  {selectedOrder.orderCreatedAt
                    ? new Date(selectedOrder.orderCreatedAt).toLocaleString("en-IN")
                    : selectedOrder.createdAt
                    ? new Date(selectedOrder.createdAt).toLocaleString("en-IN")
                    : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-[#8c9196] hover:text-[#202223] p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Verification Focus Box */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
                  Customer Payment Submission
                </span>
                <span className="text-base font-semibold text-[#202223]">
                  ₹{(selectedOrder.expectedAmount || selectedOrder.orderTotal || 0).toLocaleString("en-IN")}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#6d7175] block text-[11px]">UPI App Used:</span>
                  <span className="font-bold text-[#202223]">{selectedOrder.upiApp || "UPI"}</span>
                </div>
                <div>
                  <span className="text-[#6d7175] block text-[11px]">Payee UPI ID:</span>
                  <code className="font-mono text-zinc-900">{selectedOrder.upiId}</code>
                </div>
              </div>

              <div>
                <span className="text-[#6d7175] block text-[11px] mb-1">UPI Transaction ID / UTR:</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono text-sm font-bold text-zinc-900 tracking-wider">
                    {selectedOrder.transactionId || "No UTR submitted"}
                  </div>
                  {selectedOrder.transactionId && (
                    <button
                      type="button"
                      onClick={() => copyUtr(selectedOrder.transactionId!)}
                      className={btnPrimary}
                    >
                      {copiedUtr === selectedOrder.transactionId ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUtr === selectedOrder.transactionId ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>

              {selectedOrder.screenshotPath && (
                <div>
                  <span className="text-[#6d7175] block text-[11px] mb-1">Attached Payment Screenshot:</span>
                  <div className="flex items-center gap-3">
                    <img
                      src={api.imageUrl(selectedOrder.screenshotPath)}
                      alt="Payment screenshot"
                      onClick={() => setScreenshotZoom(api.imageUrl(selectedOrder.screenshotPath!))}
                      className="w-24 h-24 object-cover rounded-lg border border-amber-300 cursor-pointer shadow-sm hover:opacity-90"
                    />
                    <div className="text-xs space-y-1">
                      <button
                        type="button"
                        onClick={() => setScreenshotZoom(api.imageUrl(selectedOrder.screenshotPath!))}
                        className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Eye size={13} /> View Full Screenshot
                      </button>
                      <p className="text-[11px] text-[#6d7175]">
                        Uploaded by customer as proof of payment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.paymentStatus === "verified" && (
                <div className="bg-emerald-100/70 border border-emerald-300 rounded-lg p-2.5 text-xs text-emerald-950">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-700" />
                    Verified by {selectedOrder.verifiedBy || "Admin"}
                  </p>
                  {selectedOrder.verifiedAt && (
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      on {new Date(selectedOrder.verifiedAt).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              )}

              {selectedOrder.paymentStatus === "failed" && (
                <div className="bg-rose-100/70 border border-rose-300 rounded-lg p-2.5 text-xs text-rose-950">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-rose-700" />
                    Rejected by {selectedOrder.rejectedBy || "Admin"}
                  </p>
                  <p className="text-xs text-rose-900 mt-1">
                    <span className="font-semibold">Reason:</span> {selectedOrder.rejectionReason || "Payment verification failed"}
                  </p>
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="bg-white border border-[#e1e3e5] rounded-xl p-3.5 space-y-2 text-xs">
              <h4 className="font-bold text-[#202223] uppercase tracking-wide text-[11px]">Customer &amp; Shipping</h4>
              <div className="grid sm:grid-cols-2 gap-2 text-zinc-700">
                <div>
                  <span className="text-[#8c9196] block text-[10px]">Name:</span>
                  <span className="font-semibold text-zinc-900">{selectedOrder.customerName || "—"}</span>
                </div>
                <div>
                  <span className="text-[#8c9196] block text-[10px]">Phone:</span>
                  <span className="font-semibold text-zinc-900">{selectedOrder.customerPhone || "—"}</span>
                </div>
                <div>
                  <span className="text-[#8c9196] block text-[10px]">Email:</span>
                  <span className="font-semibold text-zinc-900">{selectedOrder.customerEmail || "—"}</span>
                </div>
                <div>
                  <span className="text-[#8c9196] block text-[10px]">Destination:</span>
                  <span className="font-semibold text-zinc-900">
                    {[selectedOrder.city, selectedOrder.state, selectedOrder.pincode].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Items */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div className="bg-white border border-[#e1e3e5] rounded-xl p-3.5 space-y-2">
                <h4 className="font-bold text-[#202223] uppercase tracking-wide text-[11px]">
                  Order Items ({selectedOrder.items.length})
                </h4>
                <div className="divide-y divide-[#f1f2f3]">
                  {selectedOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="py-2 flex items-center gap-3 text-xs">
                      {item.product?.images?.[0] && (
                        <img
                          src={api.imageUrl(item.product.images[0])}
                          alt="Product"
                          className="w-10 h-10 object-cover rounded-lg border border-[#e1e3e5]"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#202223] truncate">{item.product?.title || "Product"}</p>
                        {item.selectedModel && (
                          <p className="text-blue-600 font-medium text-[11px]">{item.selectedModel}</p>
                        )}
                        <p className="text-[#8c9196] text-[11px]">Qty: {item.quantity}</p>
                      </div>
                      <span className="font-bold text-[#202223]">
                        ₹{((item.product?.price || 0) * item.quantity).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e1e3e5]">
              {selectedOrder.paymentStatus === "pending_verification" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectModalOrder(selectedOrder);
                      setRejectionReason(REJECTION_PRESET_REASONS[0]);
                      setRejectionNotes("");
                    }}
                    className={pvBtnDanger}
                  >
                    Reject Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmModalOrder(selectedOrder)}
                    className={btnPrimary}
                  >
                    <Check size={14} />
                    Confirm Payment (₹{(selectedOrder.expectedAmount || selectedOrder.orderTotal || 0).toLocaleString("en-IN")})
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className={btnSecondary}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirmModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !isSubmitting && setConfirmModalOrder(null)}
        >
          <div
            className={`${card} admin-modal-solid w-full max-w-md p-6 space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#202223]">Confirm Payment Receipt</h3>
                <p className="text-xs text-[#6d7175] mt-0.5">Order #{confirmModalOrder.orderId}</p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2">
              <p className="font-semibold text-amber-900 leading-relaxed">
                Have you verified that ₹{(confirmModalOrder.expectedAmount || confirmModalOrder.orderTotal || 0).toLocaleString("en-IN")} was actually received in your bank/UPI account?
              </p>
              <div className="pt-2 border-t border-amber-200/60 space-y-1 text-xs">
                <p><span className="font-semibold">Customer:</span> {confirmModalOrder.customerName} ({confirmModalOrder.customerPhone})</p>
                <p><span className="font-semibold">UTR:</span> <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200">{confirmModalOrder.transactionId || "—"}</code></p>
                <p><span className="font-semibold">Amount:</span> ₹{(confirmModalOrder.expectedAmount || confirmModalOrder.orderTotal || 0).toLocaleString("en-IN")}</p>
              </div>
            </div>

            <p className="text-[11px] text-[#8c9196]">
              Confirming this payment will immediately set the order payment status to <b className="text-zinc-800">Paid</b>, advance the order to <b className="text-zinc-800">Processing</b>, and dispatch confirmation emails to the customer.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOrder(null)}
                disabled={isSubmitting}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={btnPrimary}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Yes, Confirm Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION DIALOG */}
      {rejectModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !isSubmitting && setRejectModalOrder(null)}
        >
          <div
            className={`${card} admin-modal-solid w-full max-w-md p-6 space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#202223]">Reject Payment Submission</h3>
                <p className="text-xs text-[#6d7175] mt-0.5">
                  Order #{rejectModalOrder.orderId} · ₹{(rejectModalOrder.expectedAmount || rejectModalOrder.orderTotal || 0).toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className={inputCls}
                >
                  {REJECTION_PRESET_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">
                  Additional Notes (shown to customer)
                </label>
                <textarea
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  placeholder="e.g. Transaction could not be found in our Canara Bank statement for this timestamp. Please check and re-enter your UTR."
                  rows={3}
                  className={inputCls}
                />
              </div>

              <p className="text-[11px] text-[#8c9196]">
                The order will NOT be deleted. The customer will see this rejection reason on their Order Confirmation / Tracking page and will be provided a button to resubmit correct payment details.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                disabled={isSubmitting}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isSubmitting}
                className={pvBtnDangerSolid}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <X size={14} />
                    Reject Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREENSHOT FULLSCREEN ZOOM LIGHTBOX */}
      {screenshotZoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setScreenshotZoom(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-2 text-white text-xs">
              <span className="font-bold">Payment Screenshot</span>
              <div className="flex items-center gap-2">
                <a
                  href={screenshotZoom}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded text-white flex items-center gap-1"
                >
                  <Download size={12} /> Open Full
                </a>
                <button
                  type="button"
                  onClick={() => setScreenshotZoom(null)}
                  className="p-1 text-white/80 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <img
              src={screenshotZoom}
              alt="Zoomed payment screenshot"
              className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain border border-white/20 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Customers (derived from orders, grouped by phone number) ----------------
// Bridge so the shared page-header "Export" button (rendered in
// AdminDashboardInner, outside CustomersTab) can trigger a full, all-time
// customer export without prop-drilling (mirrors productsTabActions).
const customersTabActions: { exportExcel: (() => void) | null } = { exportExcel: null };

function CustomersTab() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const exportBusyRef = useRef(false);

  useEffect(() => {
    api.getAuth("/api/customers")
      .then(setCustomers)
      .catch((err: any) => showToast(err.message || "Failed to load customers", "error"))
      .finally(() => setLoading(false));
  }, []);

  // Full, all-time customer list export — separate from the period-scoped
  // Sales & Customer Reports under Growth > Reports, since here the admin
  // just wants every customer they've ever had in one clean sheet.
  useEffect(() => {
    customersTabActions.exportExcel = async () => {
      if (exportBusyRef.current) return;
      if (!customers.length) {
        showToast("No customers to export yet", "error");
        return;
      }
      exportBusyRef.current = true;
      try {
        const { default: ExcelJS } = await import("exceljs");
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet("Customers", { views: [{ state: "frozen", ySplit: 1 }] });
        const rows = customers.map((c) => ({
          Name: c.name || "",
          Phone: c.phone,
          Email: c.email || "",
          "Full Address": [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", "),
          City: c.city || "",
          State: c.state || "",
          Pincode: c.pincode || "",
          Orders: c.orderCount,
          "Total Spent (₹)": c.totalSpent,
          Frequent: c.isFrequent ? "Yes" : "No",
          "Last Order Date": new Date(c.lastOrderAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          "Last Order Time": new Date(c.lastOrderAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
        }));
        sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: key === "Full Address" ? 55 : key === "Name" || key.includes("Date") ? 24 : 18 }));
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202223" } };
        sheet.getColumn("Total Spent (₹)").numFmt = '"₹"#,##0.00';
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `3dcasemakers-customers-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err: any) {
        showToast(err.message || "Couldn't export customers. Please try again.", "error");
      } finally {
        exportBusyRef.current = false;
      }
    };
    return () => { customersTabActions.exportExcel = null; };
  }, [customers, showToast]);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.phone.includes(q) || (c.name || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q);
  });

  const frequentCount = customers.filter((c) => c.isFrequent).length;

  return (
    <div>
      <div className="bg-white border border-[#e1e3e5] rounded-xl mb-3 px-4 py-3 flex items-center gap-4 flex-wrap text-xs text-[#6d7175]">
        <span><strong className="text-[#202223]">{customers.length}</strong> total customers</span>
        <span className="flex items-center gap-1 text-blue-600 font-semibold">
          <Star size={13} fill="currentColor" /> {frequentCount} frequent (2+ orders)
        </span>
      </div>

      <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="shrink-0 px-2.5 py-1.5 text-sm font-semibold text-[#202223]">All</span>
        <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
          <Search size={14} className="text-[#8c9196] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search and filter"
            className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]"
          />
        </div>

      </div>

      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        {loading ? (
          <p className="text-[#8c9196] text-sm p-4">Loading customers…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#8c9196] text-sm p-4">No customers found.</p>
        ) : (
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>

                <th className={thCls}>Customer</th>
                <th className={thCls}>Phone</th>
                <th className={thCls}>Full Address</th>
                <th className={thCls}>City</th>
                <th className={thCls}>Orders</th>
                <th className={thCls}>Amount spent</th>
                <th className={thCls}>Last order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone} className={trHover}>

                  <td className={tdCls}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[#2c6ecb]">{c.name || "—"}</span>
                      {c.isFrequent && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                          <Star size={9} fill="currentColor" /> Frequent
                        </span>
                      )}
                    </div>
                    {c.email && <div className="text-[#8c9196] text-xs mt-0.5">{c.email}</div>}
                  </td>
                  <td className={tdCls}>{c.phone}</td>
                  <td className={tdCls}>
                    <div className="flex items-start justify-between gap-2 max-w-[260px]">
                      <span className="text-[#202223] whitespace-normal">
                        {[c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ") || "—"}
                      </span>
                      {(c.address || c.city) && (
                        <button type="button"
                          onClick={() => navigator.clipboard?.writeText([c.address, c.city, c.state, c.pincode].filter(Boolean).join(", "))}
                          className="text-[#8c9196] hover:text-[#202223] shrink-0"
                          title="Copy full address"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className={tdCls}>{c.city || "—"}</td>
                  <td className={tdCls}>{c.orderCount}</td>
                  <td className={tdCls}>₹{c.totalSpent}</td>
                  <td className={tdCls}>
                    {new Date(c.lastOrderAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {" at "}
                    {new Date(c.lastOrderAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// True "liquid glass" segmented control — a single frosted-black glass pill
// glides (spring easing) to sit behind whichever option is active, instead
// of every button flashing its own background on click. Both the outer
// track and the sliding indicator are fully rounded (pill-shaped) ends.
// Measures each button's real on-screen position so it works with any
// number/width of options and stays correct on resize.
function LiquidPillGroup<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "sm";
}) {
  // Plain, static button group — no sliding/measured indicator. Each
  // button carries its own active/inactive background directly, so there
  // is nothing to measure, nothing that can go stale, and nothing that
  // can ever land on the wrong button. (The previous version animated a
  // separately-positioned black pill behind the active label using
  // measured offsetLeft/offsetWidth, which could desync — font swaps,
  // missed resizes — leaving a button's white text with no pill behind it
  // and rendering invisible. Removing the indicator removes that whole
  // class of bug.)
  const pad = size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-3.5 py-2 text-[11px]";

  return (
    <div className="flex items-center gap-1 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full p-1 overflow-x-auto max-w-full no-scrollbar">
      {options.map((o) => (
        <button type="button"
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`admin-pill-btn font-bold rounded-full whitespace-nowrap shrink-0 transition-colors duration-150 ${pad} ${
            value === o.key
              ? "btn-liquid-dark text-white"
              : "bg-white border border-[#e1e3e5] text-[#3f4247] shadow-sm hover:text-[#202223] hover:border-[#c9cccf]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const w = 80, h = 32;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - (v / max) * h}`).join(" ");
  const gradId = `grad-${color.replace("#", "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        return <circle cx={w} cy={h - (last / max) * h} r="3" fill={color} />;
      })()}
    </svg>
  );
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

// Fixed, high-contrast color palette for traffic-source slices — cycles if
// there are more sources than colors (rare: Direct/Google/Instagram/Facebook/
// WhatsApp/Other already covers almost every real case).
const TRAFFIC_SOURCE_COLORS = ["#2c6ecb", "#10b981", "#f59e0b", "#e11d48", "#9333ea", "#0891b2", "#71717a"];

// Donut chart for "Source of Visitors" — built from plain SVG stroked arcs
// (no charting library needed) so each source gets a proportional ring
// segment, plus a detailed legend/report table underneath with exact counts
// and percentages for every source.
function TrafficSourcesPieChart({ sources }: { sources: { source: string; count: number }[] }) {
  const total = sources.reduce((s, x) => s + Number(x.count), 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!sources.length || total === 0) {
    return <p className="text-[#8c9196] text-sm">No visitor data yet.</p>;
  }

  const size = 160;
  const strokeWidth = 28;
  const hoverStrokeWidth = 34;
  const radius = (size - hoverStrokeWidth) / 2; // fixed radius so a thicker hover ring doesn't get clipped
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;
  const segments = sources.map((s, i) => {
    const pct = Number(s.count) / total;
    const dash = pct * circumference;
    const segment = {
      ...s,
      pct: Math.round(pct * 1000) / 10,
      color: TRAFFIC_SOURCE_COLORS[i % TRAFFIC_SOURCE_COLORS.length],
      dashArray: `${dash} ${circumference - dash}`,
      dashOffset: -offsetSoFar,
    };
    offsetSoFar += dash;
    return segment;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
      {/* Pie / donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {segments.map((s, i) => (
            <circle
              key={s.source}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === i ? hoverStrokeWidth : strokeWidth}
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.dashOffset}
              opacity={hover === null || hover === i ? 1 : 0.35}
              className="cursor-pointer transition-all duration-200 ease-out"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hover !== null ? (
            <>
              <span className="text-lg font-black text-[#202223] leading-none">{segments[hover].pct}%</span>
              <span className="text-[9px] font-bold text-[#8c9196] uppercase tracking-wider mt-0.5 max-w-[90px] text-center truncate">{segments[hover].source}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-black text-[#202223] leading-none">{total}</span>
              <span className="text-[9px] font-bold text-[#8c9196] uppercase tracking-wider mt-0.5">Visitors</span>
            </>
          )}
        </div>
      </div>

      {/* Detailed report table */}
      <div className="flex-1 w-full min-w-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-[#8c9196] border-b border-[#f1f1f1]">
              <th className="py-1.5 font-bold">Source</th>
              <th className="py-1.5 font-bold text-right">Visitors</th>
              <th className="py-1.5 font-bold text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s, i) => (
              <tr
                key={s.source}
                className={`border-b border-[#f6f6f7] last:border-0 cursor-pointer transition-colors ${hover === i ? "bg-[#f6f6f7]" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              >
                <td className="py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="font-semibold text-[#202223] truncate">{s.source}</span>
                </td>
                <td className="py-2 text-right font-bold text-[#202223]">{s.count}</td>
                <td className="py-2 text-right text-[#6d7175]">{s.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Smooth SVG line chart for the revenue card — soft, rounded curve (no sharp
// bends) with a shaded area fill underneath. X axis = time (dates), Y axis =
// amount (revenue). Dates are rendered in the browser's local timezone
// (Asia/Kolkata for IST admins) so labels always match what the admin sees
// on their own clock, not server/UTC time.
function RevenueLineChart({ data, formatLabel, color = "#2c6ecb", isCurrency = true, unitLabel = "" }: { data: any[]; formatLabel?: (day: string) => string; color?: string; isCurrency?: boolean; unitLabel?: string }) {
  const gradId = `lineFill-${color.replace("#", "")}`;
  // Measure the real pixel width of the container so the SVG's viewBox can
  // match its actual on-screen aspect ratio exactly. Previously this used a
  // fixed 900x240 viewBox stretched to fill the container via
  // preserveAspectRatio="none", which scaled X and Y non-uniformly and
  // squashed/stretched the text labels, dots, and stroke widths whenever the
  // container's real aspect ratio didn't match 900:240 (which it almost
  // never did on real screens) — that's what caused the distorted, "spilling
  // out of the layout" look on both mobile and desktop.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setMeasuredWidth(Math.max(280, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isMobile = measuredWidth < 480;
  const H = isMobile ? 220 : 280;
  const [hover, setHover] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} className="h-56 md:h-64 w-full flex items-center justify-center text-sm text-[#8c9196]">
        No data for this period.
      </div>
    );
  }

  const values = data.map((d) => Number(d.revenue));
  const max = Math.max(1, ...values);
  const min = 0;

  const formatDay =
    formatLabel ||
    ((day: string) => {
      const d = new Date(day);
      if (isNaN(d.getTime())) return day;
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    });

  const formatAmount = (v: number) => {
    if (!isCurrency) return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
    return `₹${Math.round(v)}`;
  };

  // Chart geometry — the SVG's own coordinate space now equals the real
  // measured pixel size of its container, so a 1:1 (uniform) scale is used
  // and nothing gets stretched. Left gutter is reserved for the Y (amount)
  // axis labels, bottom gutter for the X (time) axis labels.
  const W = measuredWidth;
  const padL = isMobile ? 44 : 56;
  const padR = 12;
  const padT = 16;
  const padB = isMobile ? 24 : 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = data.length;
  const xAt = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => padT + plotH - ((v - min) / (max - min || 1)) * plotH;

  const points = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

  // Catmull-Rom -> cubic Bezier conversion for a smooth, soft-cornered curve
  // through every data point (no sharp angles at each day's value).
  const smoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x},${padT + plotH} L ${points[0].x},${padT + plotH} Z`;

  // 4 evenly spaced horizontal gridlines for the Y (amount) axis.
  const gridSteps = 4;
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => (max / gridSteps) * i);

  // Thin out X (time) axis labels so they don't overlap — fewer labels on
  // narrow (mobile) widths, more on wide desktop cards.
  const maxLabels = isMobile ? 4 : 8;
  const labelEvery = Math.max(1, Math.ceil(n / maxLabels));

  const single = n === 1;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="w-full h-full block">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y (amount) axis gridlines + labels */}
        {gridValues.map((gv, i) => {
          const y = yAt(gv);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e1e3e5" strokeWidth={1} strokeDasharray={i === 0 ? undefined : "3,3"} />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fontWeight={700} fill="#8c9196">
                {formatAmount(gv)}
              </text>
            </g>
          );
        })}

        {/* Soft-cornered area + line (skipped for a single point — a dot alone is clearer) */}
        {!single && (
          <>
            <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* X (time) axis labels */}
        {data.map((d: any, i: number) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={d.day ?? i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="10" fontWeight={600} fill="#8c9196">
              {formatDay(d.day)}
            </text>
          );
        })}

        {/* Data points + hover targets */}
        {points.map((p, i) => (
          <g key={i}>
            {(hover === i || single || n <= 45) && <circle cx={p.x} cy={p.y} r={hover === i ? 5 : single ? 4.5 : 3} fill="#fff" stroke={color} strokeWidth={2} />}
            <rect
              x={p.x - (plotW / Math.max(1, n - 1)) / 2}
              y={padT}
              width={plotW / Math.max(1, n - 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="absolute -top-1 text-[10px] font-bold text-white bg-[#202223] rounded-md px-2 py-1 pointer-events-none whitespace-nowrap -translate-x-1/2 z-10"
          style={{ left: `${Math.min(94, Math.max(6, (points[hover].x / W) * 100))}%` }}
        >
          {isCurrency ? `₹${Number(data[hover].revenue).toLocaleString("en-IN")}` : `${Number(data[hover].revenue).toLocaleString("en-IN")}${unitLabel ? " " + unitLabel : ""}`} · {formatDay(data[hover].day)}
        </div>
      )}
    </div>
  );
}

function trendOf(arr: number[]) {
  const last = arr[arr.length - 1] ?? 0;
  const prev = arr[arr.length - 2] ?? 0;
  if (prev === 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

const PERIOD_OPTIONS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "last_6_months", label: "Last 6 Months" },
  { key: "last_1_year", label: "Last 1 Year" },
];

// Compact currency formatter used by the dashboard charts (₹1.2k, ₹3.4L).
function formatINRShort(v: number) {
  const n = Number(v) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

// Generic vertical bar chart (plain SVG-free flex bars) with value tooltips,
// optional highlight of the best bar, and x-axis labels that thin out on
// narrow screens.
function VerticalBarChart({
  data,
  color = "#2c6ecb",
  height = 160,
  format = (v: number) => String(v),
  labelEvery = 1,
  highlightMax = true,
}: {
  data: { label: string; value: number; sub?: string }[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
  labelEvery?: number;
  highlightMax?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total === 0) {
    return <div className="flex items-center justify-center text-sm text-[#8c9196]" style={{ height }}>No data for this period.</div>;
  }
  return (
    <div>
      <div className="relative flex items-end gap-[3px] sm:gap-1" style={{ height }}>
        {/* light gridlines */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div key={g} className="absolute left-0 right-0 border-t border-dashed border-[#eceef0] pointer-events-none" style={{ bottom: `${g * 100}%` }} />
        ))}
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const isMax = highlightMax && i === maxIdx && d.value > 0;
          return (
            <div
              key={d.label + i}
              className="relative flex-1 min-w-0 h-full flex items-end cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onTouchStart={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-[4px] transition-all duration-300"
                style={{
                  height: `${d.value > 0 ? Math.max(2.5, pct) : 1}%`,
                  background: d.value > 0 ? color : "#e4e5e7",
                  opacity: hover === null || hover === i ? (isMax || hover === i ? 1 : 0.72) : 0.35,
                }}
              />
              {hover === i && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-[#202223] text-white text-[10px] font-bold rounded-md px-2 py-1 pointer-events-none shadow-lg">
                  {d.sub || d.label}: {format(d.value)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] sm:gap-1 mt-1.5">
        {data.map((d, i) => (
          <div key={d.label + i} className="relative flex-1 min-w-0 h-3.5">
            {i % labelEvery === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] sm:text-[10px] font-semibold text-[#8c9196]">{d.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Ranked horizontal bars (states, brands, products) with value + share.
function HBarList({
  items,
  color = "#2c6ecb",
  format = (v: number) => String(v),
  sub,
}: {
  items: { label: string; value: number; extra?: string }[];
  color?: string;
  format?: (v: number) => string;
  sub?: (it: { label: string; value: number; extra?: string }) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  if (!items.length) return <p className="text-[#8c9196] text-sm">No data for this period.</p>;
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={it.label + i}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold text-[#8c9196] w-4 shrink-0">{i + 1}</span>
              <span className="font-semibold text-[#202223] truncate">{it.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-bold text-[#202223]">{format(it.value)}</span>
              <span className="text-[10px] text-[#8c9196] ml-1.5">{sub ? sub(it) : `${Math.round((it.value / total) * 100)}%`}</span>
            </span>
          </div>
          <div className="h-2 bg-[#f1f2f3] rounded-full overflow-hidden ml-6">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Small stat tile used in the insights strip.
function MiniStat({ label, value, hint, tone = "#202223" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="bg-white border border-[#e1e3e5] rounded-2xl p-3.5 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c9196] truncate">{label}</p>
      <p className="text-xl font-black mt-1 leading-none truncate" style={{ color: tone }}>{value}</p>
      {hint && <p className="text-[10px] text-[#8c9196] mt-1 truncate">{hint}</p>}
    </div>
  );
}

const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#b98900" },
  processing: { label: "Processing", color: "#2c6ecb" },
  ready_to_ship: { label: "Ready to ship", color: "#6366f1" },
  shipped: { label: "Shipped", color: "#7c5cff" },
  out_for_delivery: { label: "Out for delivery", color: "#0891b2" },
  delivered: { label: "Delivered", color: "#0c8a3e" },
  cancelled: { label: "Cancelled", color: "#d72c0d" },
  returned: { label: "Returned", color: "#8c9196" },
};

const DONUT_PALETTE = ["#2c6ecb", "#10b981", "#f59e0b", "#e11d48", "#9333ea", "#0891b2", "#71717a", "#84cc16", "#f97316"];

function DashboardTab({ onSelectTab, pendingVerifications }: { onSelectTab?: (tab: Tab) => void; pendingVerifications?: number } = {}) {
  const [data, setData] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [period, setPeriod] = useState<string>("today");
  const [visitors, setVisitors] = useState<any[]>([]);
  const [visitorStats, setVisitorStats] = useState<{ today: number; yesterday: number; last7Days: number }>({ today: 0, yesterday: 0, last7Days: 0 });
  const [liveLoading, setLiveLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<"revenue" | "orders" | "aov" | "sessions">("revenue");
  const [sessionsByDay, setSessionsByDay] = useState<{ date: string; count: number }[]>([]);
  const [trafficSources, setTrafficSources] = useState<{ source: string; count: number }[]>([]);
  const [loadError, setLoadError] = useState("");
  const [visitorError, setVisitorError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError("");
    setData(null);
    Promise.all([
      api.getAuth(`/api/analytics/dashboard?period=${period}`),
      api.getAuth(`/api/analytics/insights?period=${period}`).catch(() => null),
      api.getAuth(`/api/analytics/visitor-analytics?period=${period}`).catch(() => null),
    ]).then(([dashboard, insightResult, visitorResult]) => {
      if (!active) return;
      setData(dashboard);
      setInsights(insightResult);
      setVisitorError(!visitorResult);
      setSessionsByDay(visitorResult?.byDay || []);
      setTrafficSources(visitorResult?.sources || []);
    }).catch((e: any) => { if (active) setLoadError(e.message || "Failed to load dashboard"); });
    return () => { active = false; };
  }, [period, reloadKey]);

  useEffect(() => {
    api.getAuth("/api/analytics/visitor-stats").then(setVisitorStats).catch(() => {});
  }, []);

  const loadLive = () => {
    setLiveLoading(true);
    api.getAuth("/api/analytics/live-visitors").catch(() => [])
      .then((v) => setVisitors(Array.isArray(v) ? v : []))
      .finally(() => setLiveLoading(false));
  };
  useEffect(() => {
    loadLive();
    // Every 5s (was every 1s — 3,600 requests/hour per open admin tab, which
    // also kept the phone awake and hammered the shared-hosting DB).
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") loadLive();
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  if (loadError && !data) {
    return (
      <div className={`${card} p-6 text-center`}>
        <p className="text-sm font-semibold text-[#d72c0d]">{loadError}</p>
        <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[120px] rounded-2xl bg-white/70 border border-[#e1e3e5] animate-pulse" />)}
        </div>
        <div className="h-72 rounded-2xl bg-white/70 border border-[#e1e3e5] animate-pulse" />
      </div>
    );
  }

  const last7: any[] = Array.isArray(data.dailyRevenue) ? data.dailyRevenue : [];
  const dailySales = last7.map((d: any) => Number(d.revenue));
  const dailyOrders = last7.map((d: any) => Number(d.orders));
  const dailyAov = last7.map((d: any) => (Number(d.orders) ? Number(d.revenue) / Number(d.orders) : 0));
  const pendingCount = (data.statusBreakdown.find((s: any) => s.status === "pending")?.count) || 0;
  const totalOrdersInBreakdown = data.statusBreakdown.reduce((s: number, x: any) => s + Number(x.count), 0);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label || "Today";
  const periodRevenue = Number(data.period?.revenueInPeriod ?? data.today.revenueToday);
  const periodOrders = Number(data.period?.ordersInPeriod ?? data.today.ordersToday);
  const periodPending = data.period?.pendingInPeriod ?? pendingCount;
  const aov = periodOrders ? periodRevenue / periodOrders : 0;

  const kpis = [
    {
      label: "Booked Sales", value: `₹${periodRevenue.toLocaleString("en-IN")}`,
      sub: `${periodOrders} orders · ${periodLabel}`, color: "#000000", icon: IndianRupee, sparkData: dailySales, trendPct: null,
    },
    {
      label: "Orders", value: periodOrders,
      sub: periodLabel, color: "#2c6ecb", icon: Package, sparkData: dailyOrders, trendPct: null,
    },
    {
      label: "Avg. Order Value", value: `₹${Math.round(aov).toLocaleString("en-IN")}`,
      sub: `per order · ${periodLabel}`, color: "#9333ea", icon: TrendingUp, sparkData: dailyAov, trendPct: null,
    },
    {
      label: "Pending Orders", value: periodPending, sub: `need attention · ${periodLabel}`,
      color: "#b98900", icon: Clock3, sparkData: dailyOrders, trendPct: null,
    },
  ];

  const conversionRate = visitorStats.today > 0 ? Math.round((Number(data.today.ordersToday) / visitorStats.today) * 1000) / 10 : null;

  // Main chart series for the selected metric.
  const sessionsMap: Record<string, number> = {};
  sessionsByDay.forEach((d) => { sessionsMap[String(d.date).slice(0, 10)] = Number(d.count); });
  const chartSeries =
    chartMetric === "sessions"
      ? sessionsByDay.map((d) => ({ day: String(d.date).slice(0, 10), revenue: Number(d.count) }))
      : data.dailyRevenue.map((d: any) => ({
          day: d.day,
          revenue:
            chartMetric === "orders" ? Number(d.orders)
            : chartMetric === "aov" ? (Number(d.orders) ? Math.round(Number(d.revenue) / Number(d.orders)) : 0)
            : Number(d.revenue),
        }));
  const chartIsMoney = chartMetric === "revenue" || chartMetric === "aov";
  const chartTotal = chartSeries.reduce((s: number, d: any) => s + Number(d.revenue), 0);
  const chartPeak = chartSeries.reduce((best: any, d: any) => (!best || Number(d.revenue) > Number(best.revenue) ? d : best), null);
  const CHART_METRICS: { key: "revenue" | "orders" | "aov" | "sessions"; label: string }[] = [
    { key: "revenue", label: "Sales" },
    { key: "orders", label: "Orders" },
    { key: "aov", label: "Avg. order" },
    { key: "sessions", label: "Sessions" },
  ];

  const statusItems = data.statusBreakdown
    .filter((s: any) => Number(s.count) > 0)
    .map((s: any) => ({ label: ORDER_STATUS_META[s.status]?.label || s.status, count: Number(s.count) }));
  const statusColorOf = (label: string) => Object.values(ORDER_STATUS_META).find((m) => m.label === label)?.color || "#8c9196";

  const s = insights?.summary;
  const weekdayData = (insights?.byWeekday || []).map((d: any) => ({ label: d.label, value: Number(d.revenue), sub: `${d.label} · ${d.orders} orders` }));
  const hourData = (insights?.byHour || []).map((d: any) => ({
    label: `${d.hour % 12 === 0 ? 12 : d.hour % 12}${d.hour < 12 ? "a" : "p"}`,
    value: Number(d.orders),
    sub: `${d.hour % 12 === 0 ? 12 : d.hour % 12}:00 ${d.hour < 12 ? "AM" : "PM"}`,
  }));
  const bestDay = weekdayData.reduce((b: any, d: any) => (!b || d.value > b.value ? d : b), null);
  const bestHour = hourData.reduce((b: any, d: any) => (!b || d.value > b.value ? d : b), null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="hidden md:block">
          <h1 className="text-xl font-black text-[#202223] tracking-tight">Home</h1>
          <p className="text-sm text-[#6d7175] font-medium mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs font-semibold text-[#202223]">{visitors.length} live visitor{visitors.length === 1 ? "" : "s"}</span>
          {conversionRate !== null && (
            <span className="text-[11px] font-semibold text-[#6d7175] ml-2">· {conversionRate} orders per 100 visitors today</span>
          )}
        </div>
      </div>

      <LiquidPillGroup options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      <p className="text-[11px] text-[#6d7175]">Sales show placed order value after discounts, including shipping.</p>
      {visitorError && <AdminLoadError message="Visitor analytics could not refresh. Sales figures are available." retry={() => setReloadKey((k) => k + 1)} />}

      {Boolean(pendingVerifications && pendingVerifications > 0) && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_2px_8px_rgba(245,158,11,0.08)]">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0">
              <CreditCard size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <span>{pendingVerifications} Direct UPI Payment{pendingVerifications! > 1 ? "s" : ""} Awaiting Verification</span>
                <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Action Needed</span>
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Customers have submitted UPI UTR numbers and are waiting for payment verification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab?.("Payment Verification")}
            className="btn-liquid-dark px-4 py-2 text-xs font-bold text-white rounded-lg shrink-0 self-start sm:self-center shadow-sm"
          >
            Review Payments &rarr;
          </button>
        </div>
      )}

      {/* KPI cards with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white border border-[#e1e3e5] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[128px] hover:shadow-md transition-shadow min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${k.color}1a`, color: k.color }}>
                  <k.icon size={13} />
                </span>
                <p className="text-[10px] font-bold text-[#6d7175] uppercase tracking-wide leading-tight">{k.label}</p>
              </div>
              <div className="flex items-center justify-between gap-1.5 mt-2">
                <p className="text-xl sm:text-2xl font-black text-[#202223] leading-none truncate min-w-0">{k.value}</p>
                <TrendBadge pct={k.trendPct} />
              </div>
              <p className="text-[10px] text-[#8c9196] mt-1 truncate">{k.sub}</p>
            </div>
            <div className="mt-3">
              <Sparkline data={k.sparkData.length ? k.sparkData : [0]} color={k.color} />
              <p className="text-[9px] text-[#a0a4a8] mt-1">Last 7 days</p>
            </div>
          </div>
        ))}

        {/* Total Visitors - distinct visitor counts, not a live "browsing now" count */}
        <div className="col-span-2 lg:col-span-1 bg-white border border-[#e1e3e5] rounded-2xl p-4 flex flex-col justify-between min-h-[128px] hover:shadow-md transition-shadow">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-[#f3e8ff] text-[#9333ea]">
              <Eye size={13} />
            </span>
            <p className="text-[10px] font-bold text-[#6d7175] uppercase tracking-wider truncate">Total Visitors</p>
          </div>
          <div className="mt-2.5 grid grid-cols-3 lg:grid-cols-1 gap-1.5">
            {[
              { l: "Today", v: visitorStats.today },
              { l: "Yesterday", v: visitorStats.yesterday },
              { l: "Last 7 Days", v: visitorStats.last7Days },
            ].map((r) => (
              <div key={r.l} className="flex lg:items-baseline flex-col lg:flex-row lg:justify-between">
                <span className="text-[10px] text-[#8c9196] font-medium">{r.l}</span>
                <span className="text-base font-black text-[#202223] leading-none">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main performance chart with metric switcher */}
      <div className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#202223]">
              {CHART_METRICS.find((m) => m.key === chartMetric)?.label} over time
              <span className="text-[#8c9196] font-semibold"> · {periodLabel}</span>
            </h3>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-[11px] text-[#6d7175]">
              {chartMetric !== "aov" && (
                <span>Total: <b className="text-[#202223]">{chartIsMoney ? `₹${Math.round(chartTotal).toLocaleString("en-IN")}` : chartTotal.toLocaleString("en-IN")}</b></span>
              )}
              {chartPeak && Number(chartPeak.revenue) > 0 && (
                <span>
                  Best day: <b className="text-[#202223]">{new Date(chartPeak.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</b>{" "}
                  ({chartIsMoney ? formatINRShort(Number(chartPeak.revenue)) : chartPeak.revenue})
                </span>
              )}
            </div>
          </div>
          <LiquidPillGroup<"revenue" | "orders" | "aov" | "sessions"> options={CHART_METRICS} value={chartMetric} onChange={setChartMetric} size="sm" />
        </div>
        <RevenueLineChart
          data={chartSeries}
          color={chartMetric === "orders" ? "#0c8a3e" : chartMetric === "aov" ? "#9333ea" : chartMetric === "sessions" ? "#0891b2" : "#2c6ecb"}
          isCurrency={chartIsMoney}
          unitLabel={chartMetric === "orders" ? "orders" : chartMetric === "sessions" ? "sessions" : ""}
        />
      </div>

      {/* Insights strip */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <MiniStat label="Units sold" value={Number(s.units).toLocaleString("en-IN")} hint={`${s.unitsPerOrder} per order`} />
          <MiniStat label="Shipping collected" value={formatINRShort(s.shipping)} hint={periodLabel} />
          <MiniStat label="New customers" value={String(s.newCustomers)} hint="first order ever" tone="#0c8a3e" />
          <MiniStat label="Returning" value={String(s.returningCustomers)} hint="ordered before" tone="#2c6ecb" />
          <MiniStat label="Delivered" value={`${s.deliveryRate}%`} hint={`${s.delivered} orders`} tone="#0c8a3e" />
          <MiniStat label="Cancelled" value={`${s.cancellationRate}%`} hint={`${s.cancelled} · ${formatINRShort(s.cancelledValue)} lost`} tone={s.cancellationRate > 10 ? "#d72c0d" : "#202223"} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Order status donut */}
        <div className={`${card} p-4 sm:p-5 min-w-0`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Order Status</h3>
          <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · {totalOrdersInBreakdown} orders — where they currently stand</p>
          <DetailedPieChart items={statusItems} colorOf={statusColorOf} totalLabel="Orders" />
        </div>

        {/* Traffic sources donut */}
        <div className={`${card} p-4 sm:p-5 min-w-0`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Source of Visitors</h3>
          <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · where your traffic is coming from</p>
          <TrafficSourcesPieChart sources={trafficSources} />
        </div>
      </div>

      {insights && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#202223]">Sales by Day of Week</h3>
                <p className="text-[11px] text-[#8c9196]">{periodLabel} · revenue per weekday</p>
              </div>
              {bestDay && bestDay.value > 0 && (
                <span className="text-[10px] font-bold text-[#0c5132] bg-[#aee9d1] rounded-full px-2 py-1 shrink-0">Best: {bestDay.label}</span>
              )}
            </div>
            <VerticalBarChart data={weekdayData} color="#2c6ecb" format={formatINRShort} />
          </div>

          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#202223]">Orders by Hour</h3>
                <p className="text-[11px] text-[#8c9196]">{periodLabel} · when customers order (IST)</p>
              </div>
              {bestHour && bestHour.value > 0 && (
                <span className="text-[10px] font-bold text-[#08476b] bg-[#b4e1fa] rounded-full px-2 py-1 shrink-0">Peak: {bestHour.sub}</span>
              )}
            </div>
            <VerticalBarChart data={hourData} color="#0891b2" format={(v) => `${v} orders`} labelEvery={4} />
          </div>

          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Top States by Revenue</h3>
            <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · where your orders ship to</p>
            <HBarList
              items={(insights.byState || []).map((x: any) => ({ label: x.state, value: Number(x.revenue), extra: `${x.orders}` }))}
              color="#7c5cff"
              format={formatINRShort}
              sub={(it) => `${it.extra} orders`}
            />
          </div>

          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Top Phone Brands</h3>
            <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · units sold per phone brand</p>
            <HBarList
              items={(insights.byBrand || []).map((x: any) => ({ label: x.brand, value: Number(x.qty) }))}
              color="#f59e0b"
              format={(v) => `${v} units`}
            />
          </div>

          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Customers: New vs Returning</h3>
            <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · unique phone numbers that ordered</p>
            <DetailedPieChart
              items={[
                { label: "New customers", count: Number(s?.newCustomers || 0) },
                { label: "Returning customers", count: Number(s?.returningCustomers || 0) },
              ].filter((x) => x.count > 0)}
              colorOf={(l) => (l.startsWith("New") ? "#10b981" : "#2c6ecb")}
              totalLabel="Customers"
            />
          </div>

          <div className={`${card} p-4 sm:p-5 min-w-0`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Sales Channel</h3>
            <p className="text-[11px] text-[#8c9196] mb-4">{periodLabel} · online store vs manually created orders</p>
            <DetailedPieChart
              items={(insights.bySource || []).filter((x: any) => Number(x.orders) > 0).map((x: any) => ({ label: x.source, count: Number(x.orders) }))}
              colorOf={(l) => (l.startsWith("Online") ? "#2c6ecb" : "#f59e0b")}
              totalLabel="Orders"
            />
            {(insights.bySource || []).some((x: any) => Number(x.orders) > 0) && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                {(insights.bySource || []).map((x: any) => (
                  <div key={x.source} className="rounded-xl bg-[#f6f6f7] px-3 py-2">
                    <p className="text-[10px] font-bold text-[#8c9196] uppercase">{x.source}</p>
                    <p className="text-sm font-black text-[#202223]">₹{Number(x.revenue).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top products by units sold */}
      <div className={`${card} p-4 sm:p-5 min-w-0`}>
        <h3 className="text-sm font-bold text-[#202223] mb-1">Top Products</h3>
        <p className="text-[11px] text-[#8c9196] mb-4">Best sellers by units — all-time, excludes cancelled orders</p>
        <HBarList
          items={(data.topProducts || []).slice(0, 10).map((p: any) => ({ label: p.title, value: Number(p.qty) }))}
          color="#0c8a3e"
          format={(v) => `${v} sold`}
        />
      </div>

      {/* Live monitoring strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Visitors right now", value: visitors.length, icon: Eye, color: "#2c6ecb" },
          { label: "Active carts", value: visitors.filter((v) => (v.cartCount || 0) > 0 && !v.isCheckout).length, icon: ShoppingCart, color: "#8a5a00" },
          { label: "Checking out", value: visitors.filter((v) => v.isCheckout).length, icon: CreditCard, color: "#b98900" },
          { label: "Orders today", value: Number(data.today.ordersToday), icon: Package, color: "#0c8a3e" },
        ].map((k) => (
          <div key={k.label} className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-1.5">
              <k.icon size={14} style={{ color: k.color }} />
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#8c9196]">{k.label}</p>
            </div>
            <p className="text-2xl font-black text-[#202223] leading-tight">{liveLoading && visitors.length === 0 ? "—" : k.value}</p>
          </div>
        ))}
      </div>

      {/* Live Activity: visitors browsing the storefront right now */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-[#e1e3e5]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <h3 className="font-bold text-[#202223] text-sm">Live Activity — Visitors ({visitors.length})</h3>
          </div>
          <button type="button" onClick={loadLive} aria-label="Refresh live visitors" className={`p-1.5 rounded-lg bg-[#f6f6f7] hover:bg-[#e1e3e5] text-[#6d7175] transition-all ${liveLoading ? "animate-spin" : ""}`}>
            <RefreshCwIcon />
          </button>
        </div>

        {visitors.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm font-semibold text-[#6d7175]">No active visitors right now</p>
              <p className="text-xs text-[#9ca3af] mt-1">Auto-refreshes every 5s</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f1f1f1] max-h-[520px] overflow-y-auto">
              {visitors.map((v) => {
                const secondsOn = Math.max(0, Math.floor((Date.now() - new Date(v.firstSeen).getTime()) / 1000));
                const mins = Math.floor(secondsOn / 60);
                const durationLabel = mins > 0 ? `${mins}m ${secondsOn % 60}s` : `${secondsOn}s`;
                const knownName = v.customerName || v.customerPhone;
                return (
                  <div key={v.id} className="px-4 sm:px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className="font-medium text-[#202223] truncate">
                          {knownName ? knownName : (v.page === "/" ? "Homepage" : (v.pageLabel || v.page))}
                        </span>
                        {v.isCheckout && (
                          <span className="text-[9px] font-bold uppercase text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 shrink-0">
                            At Checkout
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#6d7175] shrink-0">
                        {v.cartCount > 0 && <span className="bg-[#e8f0ff] text-[#2c6ecb] px-2 py-0.5 rounded-full font-semibold">{v.cartCount} in cart</span>}
                        <span className="flex items-center gap-1"><Clock3 size={11} /> {durationLabel}</span>
                      </div>
                    </div>

                    <div className="pl-3.5 mt-1 text-xs text-[#6d7175] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{v.page === "/" ? "Homepage" : (v.pageLabel || v.page)}</span>
                      {v.ipAddress && (
                        <>
                          <span className="text-[#c9cccf]">·</span>
                          <span className="truncate">
                            {v.geoLocation ? v.geoLocation : "IP"} ({v.ipAddress})
                          </span>
                        </>
                      )}
                      {v.customerPhone && (
                        <>
                          <span className="text-[#c9cccf]">·</span>
                          <span>{v.customerPhone}</span>
                        </>
                      )}
                      {v.customerEmail && (
                        <>
                          <span className="text-[#c9cccf]">·</span>
                          <span className="truncate">{v.customerEmail}</span>
                        </>
                      )}
                      {(v.shippingAddress || v.city) && (
                        <>
                          <span className="text-[#c9cccf]">·</span>
                          <span className="truncate">
                            {[v.shippingAddress, v.apartment, v.city, v.state, v.pincode].filter(Boolean).join(", ")}
                          </span>
                        </>
                      )}
                      {v.checkoutTotal ? (
                        <>
                          <span className="text-[#c9cccf]">·</span>
                          <span className="font-semibold text-[#202223]">₹{v.checkoutTotal} cart value</span>
                        </>
                      ) : null}
                      {v.customerPhone && (
                        <a
                          href={`https://wa.me/91${v.customerPhone.replace(/\D/g, "").slice(-10)}`}
                          target="_blank" rel="noreferrer"
                          className="font-semibold text-emerald-600 hover:underline ml-auto"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>

      <a href={`${API_URL}/api/analytics/feed.xml`} target="_blank" rel="noreferrer" className="inline-block text-sm text-[#6d7175] hover:underline">
        View merchant feed (Google Shopping / Meta catalog) →
      </a>
    </div>
  );
}

// ---------------- Abandoned Checkouts ----------------
// Carts where a visitor entered checkout details but never completed the
// order — pulled out of the old Dashboard "Live Activity" toggle into its
// own Sales sub-tab so it's easier to find and act on.

type AbandonedRangeFilter = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "all";

const ABANDONED_RANGE_OPTIONS: { value: AbandonedRangeFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "all", label: "All" },
];

// Monday-start week boundaries (matches how most IN businesses think of "this week").
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}
function inRange(date: Date, filter: AbandonedRangeFilter): boolean {
  const now = new Date();
  if (filter === "all") return true;
  if (filter === "today") return startOfDay(date).getTime() === startOfDay(now).getTime();
  if (filter === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return startOfDay(date).getTime() === startOfDay(y).getTime();
  }
  if (filter === "this_week") {
    return date.getTime() >= startOfWeek(now).getTime();
  }
  if (filter === "last_week") {
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    return date.getTime() >= lastWeekStart.getTime() && date.getTime() < thisWeekStart.getTime();
  }
  if (filter === "this_month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  return true;
}

// e.g. "Today, 4:32 PM" / "Yesterday, 11:05 AM" / "12 Aug, 6:40 PM"
function formatAbandonedTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  if (startOfDay(d).getTime() === startOfDay(now).getTime()) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (startOfDay(d).getTime() === startOfDay(y).getTime()) return `Yesterday, ${time}`;
  const datePart = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${datePart}, ${time}`;
}

// ---- Abandoned Checkout WhatsApp follow-up message templates ----
// Admin sets up two message templates in Settings (Tamil Nadu & Puducherry
// vs every other state). Clicking WhatsApp on an abandoned checkout builds
// the actual message from whichever template matches that customer's state,
// filling in the products (each with its own working product-page link),
// phone model, personalization text/photo, address, etc.
const STORE_BASE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/3dcasemakers/";

const DEFAULT_ABANDONED_MSG_TN_PONDY =
  `3DCASEMAKERS Mobile Covers\nHi {name}! ஆர்டர் பண்ண தயக்கமா?\nஎங்க Real Reviews & Customer Orders பாருங்க\n@3dcasemakers\n{instagram}\n\n50K+ Happy Customers\n\nYour Pick:\n{products}\n\nOrder Continue: {website}\nDoubt இருந்தா DM பண்ணுங்க!`;

const DEFAULT_ABANDONED_MSG_OTHER_STATES =
  `3DCASEMAKERS Mobile Covers\nHi {name}! Still thinking it over? No worries!\nCheck our Real Reviews & Customer Orders\n@3dcasemakers\n{instagram}\n\n50K+ Happy Customers\n\nYour Pick:\n{products}\n\nContinue Order: {website}\nNeed help? DM us!`;

// Tamil Nadu & Puducherry get free shipping (see ProductPage's "Free shipping
// within Tamil Nadu only" note) — every other state pays door-delivery, so
// the two templates need different messaging.
function isTNorPondy(state: string): boolean {
  const s = (state || "").trim().toLowerCase();
  return /tamil\s*nadu|^tn$|pondicherr?y|puducherry/.test(s);
}

// One line per cart item: product name (linked to its actual product page),
// phone model, and any personalization (photo uploaded / text typed / plate
// style chosen) — everything the admin needs to manually re-create the order
// on a call, without opening the admin panel.
function buildAbandonedProductLines(items: any[]): string {
  if (!items || !items.length) return "";
  return items
    .map((i, idx) => {
      const product = i.product || {};
      const link = product.id ? `${STORE_BASE_URL}/product/${product.id}` : "";
      const lines = [`${idx + 1}. ${product.title || "Product"}${link ? ` — ${link}` : ""}`];
      if (i.selectedModel) lines.push(`   Model: ${i.selectedModel}`);
      if (i.customVariant) lines.push(`   ${i.customVariant}`);
      if (i.customName) lines.push(`   Name to print: "${i.customName}"`);
      if (i.customImage) lines.push(`   Photo uploaded: ${api.imageUrl(i.customImage)}`);
      if (i.customImage2) lines.push(`   2nd photo uploaded: ${api.imageUrl(i.customImage2)}`);
      if (i.customName2) lines.push(`   2nd name to print: "${i.customName2}"`);
      if (i.customImage3) lines.push(`   3rd photo uploaded: ${api.imageUrl(i.customImage3)}`);
      if (i.customName3) lines.push(`   3rd name to print: "${i.customName3}"`);
      if (i.quantity > 1) lines.push(`   Qty: ${i.quantity}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildAbandonedWhatsAppText(cart: any, template: string, instagramUrl?: string): string {
  const productsBlock = buildAbandonedProductLines(cart.items || []);
  const address = [cart.shippingAddress, cart.apartment, cart.city, cart.state, cart.pincode].filter(Boolean).join(", ");
  return template
    .replace(/\{name\}/g, cart.customerName || "there")
    .replace(/\{phone\}/g, cart.customerPhone || "")
    .replace(/\{address\}/g, address || "-")
    .replace(/\{total\}/g, cart.total != null ? `₹${cart.total}` : "")
    .replace(/\{products\}/g, productsBlock)
    .replace(/\{instagram\}/g, instagramUrl || DEFAULT_INSTAGRAM_URL)
    .replace(/\{website\}/g, STORE_BASE_URL);
}

function AbandonedCheckoutsTab() {
  const [abandoned, setAbandoned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<AbandonedRangeFilter>("all");
  const [msgSettings, setMsgSettings] = useState<{ tnPondy: string; otherStates: string; instagramUrl: string }>({
    tnPondy: DEFAULT_ABANDONED_MSG_TN_PONDY,
    otherStates: DEFAULT_ABANDONED_MSG_OTHER_STATES,
    instagramUrl: DEFAULT_INSTAGRAM_URL,
  });

  const load = () => {
    setLoading(true);
    api.getAuth("/api/analytics/abandoned-carts").catch(() => [])
      .then(setAbandoned)
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api.getAuth("/api/settings/admin").then((s) => {
      setMsgSettings({
        tnPondy: s?.abandonedMsgTNPondy || DEFAULT_ABANDONED_MSG_TN_PONDY,
        otherStates: s?.abandonedMsgOtherStates || DEFAULT_ABANDONED_MSG_OTHER_STATES,
        instagramUrl: s?.abandonedInstagramUrl || DEFAULT_INSTAGRAM_URL,
      });
    }).catch(() => {});
    const iv = setInterval(load, 15000); // refresh every 15s — no need for 1s polling here
    return () => clearInterval(iv);
  }, []);

  const dismiss = async (sessionId: string) => {
    try {
      await api.del(`/api/analytics/abandoned-carts/${sessionId}`);
      setAbandoned((prev) => prev.filter((c) => c.id !== sessionId));
    } catch {
      /* ignore */
    }
  };

  // Builds the wa.me link with the right template (TN/Pondy vs other
  // states) pre-filled with this exact cart's products (each with its own
  // working product link), phone model, personalization text/photo, and
  // address — so the WhatsApp chat opens with the full follow-up ready to send.
  const whatsappHref = (c: any) => {
    if (!c.customerPhone) return "";
    const template = isTNorPondy(c.state) ? msgSettings.tnPondy : msgSettings.otherStates;
    const text = buildAbandonedWhatsAppText(c, template, msgSettings.instagramUrl);
    return `https://wa.me/91${c.customerPhone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(text)}`;
  };

  const filtered = abandoned.filter((c) => c.updatedAt && inRange(new Date(c.updatedAt), range));
  const [search, setSearch] = useState("");
  const searched = filtered.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(c.id).toLowerCase().includes(q) ||
      (c.customerName || "").toLowerCase().includes(q) ||
      (c.customerPhone || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as AbandonedRangeFilter)}
            className="appearance-none bg-transparent text-sm font-semibold text-[#202223] pl-2.5 pr-6 py-1.5 rounded-lg hover:bg-[#f1f2f3] cursor-pointer outline-none"
          >
            {ABANDONED_RANGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <ChevronDown size={14} className="text-[#8c9196] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
          <Search size={14} className="text-[#8c9196] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search and filter"
            className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]"
          />
        </div>
        <button type="button" onClick={load} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[#6d7175] hover:bg-[#f1f2f3] shrink-0 ${loading ? "animate-spin" : ""}`}>
          <RefreshCwIcon />
        </button>

      </div>

      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        {searched.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-sm font-semibold text-[#6d7175]">
              {abandoned.length === 0 ? "No abandoned carts yet" : "No abandoned carts in this range"}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>

                <th className={thCls}>Checkout</th>
                <th className={thCls}>Created</th>
                <th className={thCls}>Customer name</th>
                <th className={thCls}>Region</th>
                <th className={thCls}>Recovery status</th>
                <th className={thCls}>Total price</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {searched.map((c) => (
                <tr key={c.id} className={trHover}>

                  <td className={tdCls}>
                    <span className="font-semibold text-[#2c6ecb]">#{c.id}</span>
                    <p className="text-xs text-[#8c9196] font-normal">{c.items?.length || 0} item(s)</p>
                  </td>
                  <td className={tdCls}>{c.updatedAt ? formatAbandonedTime(c.updatedAt) : "—"}</td>
                  <td className={tdCls}>
                    <p className="text-[#202223]">{c.customerName || "Unnamed visitor"}</p>
                    <p className="text-xs text-[#8c9196]">
                      {[c.customerPhone, c.customerEmail].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className={tdCls}>{c.state || "India"}</td>
                  <td className={tdCls}><span className={statusPill("warning")}>Not recovered</span></td>
                  <td className={tdCls}>₹{c.total}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-3">
                      {c.customerPhone && (
                        <a href={whatsappHref(c)} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700" title="WhatsApp">
                          <MessageCircle size={15} />
                        </a>
                      )}
                      <button type="button" onClick={() => dismiss(c.id)} className="text-[#8c9196] hover:text-red-600" title="Dismiss">
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------- Report Analysis (dedicated 1-year deep-dive report) ----------------
function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// File Manager — every image ever uploaded to the site's /uploads folder,
// whether it came in through an admin "upload image" button (products,
// banners, collections, content blocks, etc.) or through a shopper's own
// customer photo-case upload on the storefront (both write into this exact
// same folder), so nothing is missed either way. Backed by GET/DELETE
// /api/upload/list & /api/upload/:filename.
function FileManagerTab() {
  const { showToast } = useToast();
  const [files, setFiles] = useState<{ filename: string; url: string; size: number; uploadedAt: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ filename: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = (p = page, q = search) => {
    setLoading(true);
    api
      .getAuth(`/api/upload/list?page=${p}&pageSize=60&search=${encodeURIComponent(q)}`)
      .then((r) => {
        setFiles(r.files || []);
        setTotal(r.total || 0);
        setTotalSize(r.totalSize || 0);
        setTotalPages(r.totalPages || 1);
      })
      .catch(() => showToast("Failed to load uploaded images", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(1, search); setPage(1); }, [search]);
  useEffect(() => { load(page, search); }, [page]);

  const downloadFile = (f: { filename: string; url: string }) => {
    // Plain navigation, not fetch+blob: the live server's /uploads static
    // serving doesn't send CORS headers, so a JS fetch() to it gets blocked
    // by the browser even though the exact same URL loads fine in an <img>
    // tag. Navigating a link isn't subject to CORS at all, and the backend
    // route below sends Content-Disposition: attachment so it downloads
    // instead of just opening in the tab.
    const a = document.createElement("a");
    a.href = `${API_URL}/api/upload/file/${f.filename}`;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteFile = async (filename: string) => {
    if (!confirm("Delete this image permanently? This can't be undone.")) return;
    setDeleting(filename);
    try {
      await api.postAuthJson(`/api/upload/remove`, { filename });
      setPreview(null);
      showToast("Image deleted", "success");
      load(page, search);
    } catch (err: any) {
      showToast(err.message || "Failed to delete image", "error");
    } finally {
      setDeleting(null);
    }
  };

  const toggleSelected = (filename: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  // Selects/clears every image on the CURRENT page - matches what "Select all"
  // means elsewhere in this dashboard's paginated tables (customers, etc.).
  const allOnPageSelected = files.length > 0 && files.every((f) => selected.has(f.filename));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        files.forEach((f) => next.delete(f.filename));
        return next;
      }
      const next = new Set(prev);
      files.forEach((f) => next.add(f.filename));
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} image${selected.size === 1 ? "" : "s"} permanently? This can't be undone.`)) return;
    setBulkDeleting(true);
    const filenames = Array.from(selected);
    let failed = 0;
    for (const filename of filenames) {
      try {
        await api.postAuthJson(`/api/upload/remove`, { filename });
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelected(new Set());
    setSelectMode(false);
    if (failed > 0) showToast(`Deleted ${filenames.length - failed} image(s), ${failed} failed`, "error");
    else showToast(`Deleted ${filenames.length} image(s)`, "success");
    load(page, search);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#6d7175] mt-0.5 font-medium">
            Every image uploaded to 3DCaseMakers — product photos, banners, and customer photo-case uploads — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectMode && (
            <>
              <button type="button" onClick={toggleSelectAll} className={btnSecondary}>
                {allOnPageSelected ? "Deselect all" : "Select all"}
              </button>
              <button type="button"
                onClick={deleteSelected}
                disabled={selected.size === 0 || bulkDeleting}
                className="bg-red-600 hover:bg-red-700 active:scale-[0.97] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDeleting ? "Deleting…" : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
              </button>
            </>
          )}
          <button type="button"
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            className={selectMode ? btnPrimary : btnSecondary}
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8c9196]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename..."
              className={`${inputCls} pl-8 w-56`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><Images size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">Total Images</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">{total}</p>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><Upload size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">Storage Used</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">{formatBytes(totalSize)}</p>
        </div>
      </div>

      <div className={`${card} p-5`}>
        {loading ? (
          <p className="text-[#8c9196] text-sm">Loading images...</p>
        ) : files.length === 0 ? (
          <p className="text-[#8c9196] text-sm">{search ? "No images match that search." : "No images uploaded yet."}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {files.map((f) => {
                const isSelected = selected.has(f.filename);
                return (
                <div
                  key={f.filename}
                  className={`group relative rounded-lg overflow-hidden border ${isSelected ? "border-red-500 ring-2 ring-red-500" : "border-[#e1e3e5]"} bg-[#f6f6f7] aspect-square text-left`}
                >
                  <button type="button"
                    onClick={() => (selectMode ? toggleSelected(f.filename) : setPreview(f))}
                    className="block w-full h-full"
                  >
                    <img src={api.thumbUrl(f.url, 240)} alt={f.filename} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                  {selectMode && (
                    <div className="absolute top-1.5 left-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(f.filename)}
                        className="w-4 h-4 rounded border-[#c9cccf] accent-red-600"
                      />
                    </div>
                  )}
                  {!selectMode && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); downloadFile(f); }}
                      title="Download"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    >
                      <Download size={12} />
                    </button>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-[9px] text-white font-semibold truncate">{f.filename}</p>
                    <p className="text-[8px] text-white/70">{formatBytes(f.size)}</p>
                  </div>
                </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-5">
                <button type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`${btnPrimary} disabled:opacity-40`}
                >
                  Prev
                </button>
                <span className="text-xs font-semibold text-[#6d7175]">Page {page} of {totalPages}</span>
                <button type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`${btnPrimary} disabled:opacity-40`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Preview / delete modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className={`${card} admin-modal-solid max-w-lg w-full p-4 space-y-3`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#202223] truncate">{preview.filename}</p>
              <button type="button" onClick={() => setPreview(null)} className="text-[#8c9196] hover:text-[#202223]"><X size={16} /></button>
            </div>
            <img src={api.imageUrl(preview.url)} alt={preview.filename} className="w-full max-h-[60vh] object-contain rounded-lg bg-[#f6f6f7]" />
            <div className="flex items-center gap-3 pt-1">
              <a href={api.imageUrl(preview.url)} target="_blank" rel="noreferrer" className={btnPrimary}>Open Full Size</a>
              <button type="button"
                onClick={() => downloadFile(preview)}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#2c6ecb] hover:underline"
              >
                <Download size={13} /> Download
              </button>
              <button type="button"
                onClick={() => deleteFile(preview.filename)}
                disabled={deleting === preview.filename}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                <Trash2 size={13} /> {deleting === preview.filename ? "Deleting..." : "Delete image"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Visitors / Views Analytics ----------------
// Detailed "who's coming to the site" tab: unique visitor counts for
// Today / Yesterday / Last 7 Days / Last 28 Days, a daily trend chart,
// where visitors are dropping off (last page seen), and which channel
// brought them in (Google Search, Instagram, Direct, etc.)
const VISITOR_PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "28d", label: "Last 28 Days" },
] as const;
type VisitorPeriod = (typeof VISITOR_PERIODS)[number]["key"];

const SOURCE_COLORS: Record<string, string> = {
  "Google Search": "#4285F4",
  "Bing Search": "#008373",
  "Yahoo Search": "#6001D2",
  "DuckDuckGo Search": "#DE5833",
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  WhatsApp: "#25D366",
  YouTube: "#FF0000",
  "Twitter / X": "#000000",
  Pinterest: "#E60023",
  LinkedIn: "#0A66C2",
  Direct: "#8c9196",
};
const sourceColor = (s: string) => SOURCE_COLORS[s] || "#2c6ecb";

// Detailed donut/pie chart used for "Traffic Sources" — draws one wedge per
// item with a hoverable slice (thickens + shows exact count/share), a
// center total, and a legend with count + percentage per source so the
// breakdown is fully readable at a glance, not just relative bar widths.
function DetailedPieChart({ items, colorOf, totalLabel, stacked }: { items: { label: string; count: number }[]; colorOf: (label: string) => string; totalLabel?: string; stacked?: boolean }) {
  const total = items.reduce((s, x) => s + Number(x.count), 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!items.length || total === 0) return <p className="text-[#8c9196] text-sm">No data for this period.</p>;

  const size = 200, cx = size / 2, cy = size / 2, rOuter = 92, rInner = 56;
  let angle = -90; // start at 12 o'clock

  const toXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const wedges = items.map((it, i) => {
    const pct = Number(it.count) / total;
    const startAngle = angle;
    // A single 100% slice would start and end at the same point and render
    // nothing at all, so cap it just short of a full circle.
    const sweep = Math.min(pct * 360, 359.99);
    const endAngle = startAngle + sweep;
    angle = endAngle;
    const isHover = hover === i;
    const r = isHover ? rOuter + 4 : rOuter;
    const large = sweep > 180 ? 1 : 0;
    const p0 = toXY(startAngle, r);
    const p1 = toXY(endAngle, r);
    const path = `M ${p0.x},${p0.y} A ${r},${r} 0 ${large} 1 ${p1.x},${p1.y} L ${toXY(endAngle, rInner).x},${toXY(endAngle, rInner).y} A ${rInner},${rInner} 0 ${large} 0 ${toXY(startAngle, rInner).x},${toXY(startAngle, rInner).y} Z`;
    return { path, color: colorOf(it.label), pct, i };
  });

  return (
    <div className={stacked ? "flex flex-col items-center gap-5" : "flex flex-col sm:flex-row items-center gap-5"}>
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} width={180} height={180}>
          {wedges.map((w) => (
            <path
              key={w.i}
              d={w.path}
              fill={w.color}
              stroke="#fff"
              strokeWidth={1.5}
              className="transition-all cursor-pointer"
              onMouseEnter={() => setHover(w.i)}
              onMouseLeave={() => setHover((h) => (h === w.i ? null : h))}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hover !== null ? (
            <>
              <span className="text-lg font-black text-[#202223] leading-none">{Math.round(wedges[hover].pct * 100)}%</span>
              <span className="text-[10px] text-[#8c9196] font-semibold mt-0.5 max-w-[80px] text-center truncate">{items[hover].label}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-black text-[#202223] leading-none">{total}</span>
              <span className="text-[10px] text-[#8c9196] font-semibold mt-0.5">{totalLabel || "Total"}</span>
            </>
          )}
        </div>
      </div>

      {/* Legend — each traffic type gets its own full-width row with the
          complete label spelled out (no truncation) so it stays readable
          even in a narrow sidebar card. */}
      <div className={stacked ? "w-full space-y-2" : "flex-1 w-full min-w-0 space-y-2"}>
        {items.map((it, i) => {
          const pct = Math.round((Number(it.count) / total) * 100);
          return (
            <div
              key={it.label}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border transition-colors ${
                hover === i ? "bg-[#f6f6f7] border-[#e1e3e5]" : "border-transparent"
              }`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colorOf(it.label) }} />
                <span className="font-bold text-sm text-[#202223] break-words">{it.label}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-sm font-black text-[#202223] leading-none">{it.count}</span>
                <span className="block text-[10px] text-[#8c9196] font-semibold mt-0.5">{pct}% of total</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GROWTH_RANGE_OPTIONS: { key: "7" | "30" | "90"; label: string }[] = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const TRAFFIC_TYPE_COLORS: Record<string, string> = {
  Paid: "#2c9ce0",
  Direct: "#8b5cf6",
  Organic: "#f24897",
  Social: "#00a884",
  Unknown: "#8c9196",
};

function GrowthTab() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestRef = useRef(0);

  const load = (d: "7" | "30" | "90") => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError("");
    api.getAuth(`/api/analytics/growth?days=${d}`)
      .then((result) => { if (requestId === requestRef.current) setData(result); })
      .catch((err: any) => { if (requestId === requestRef.current) setLoadError(err.message || "Failed to load growth data"); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
  };
  useEffect(() => { load(range); return () => { requestRef.current++; }; }, [range]);

  const currentRangeLabel = GROWTH_RANGE_OPTIONS.find((o) => o.key === range)?.label || "Last 30 days";

  const salesMax = Math.max(1, ...(data?.dailySales || []).map((d: any) => Number(d.revenue)));
  const chartW = 900, chartH = 160, chartPad = 8;
  const salesVals = (data?.dailySales || []).map((d: any) => Number(d.revenue));
  const step = salesVals.length > 1 ? (chartW - chartPad * 2) / (salesVals.length - 1) : 0;
  const points = salesVals.map((v: number, i: number) => {
    const x = chartPad + i * step;
    const y = chartH - chartPad - (v / salesMax) * (chartH - chartPad * 2);
    return `${x},${y}`;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Where visitors come from and how the store's sales are trending</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#202223]">Performance</h3>
        <div className="relative">
          <button type="button"
            onClick={() => setRangeMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#202223] bg-white border border-[#c9cccf] px-3 py-1.5 rounded-lg hover:bg-[#f6f6f7]"
          >
            {currentRangeLabel} <ChevronDown size={14} className="text-[#8c9196]" />
          </button>
          {rangeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRangeMenuOpen(false)} />
              <div className="absolute z-20 top-full right-0 mt-1 w-40 bg-white border border-[#e1e3e5] rounded-lg shadow-lg py-1">
                {GROWTH_RANGE_OPTIONS.map((o) => (
                  <button type="button"
                    key={o.key}
                    onClick={() => { setRange(o.key); setRangeMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f6f7] ${range === o.key ? "font-semibold text-[#202223]" : "text-[#494c50]"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-[#8c9196] text-sm">Loading growth data...</p>
      ) : loadError || !data ? (
        <AdminLoadError message={loadError || "Growth data is unavailable"} retry={() => load(range)} />
      ) : (
        <>
          <div className="grid lg:grid-cols-[1fr_380px] gap-4">
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-[#202223]">Total store sales</h3>
              <p className="text-2xl font-black text-[#202223] mt-1">₹{Number(data.salesTotals.totalRevenue).toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-[#8c9196] mb-3">{data.salesTotals.totalOrders} orders · {currentRangeLabel.toLowerCase()}</p>
              {salesVals.length < 2 ? (
                <p className="text-[#8c9196] text-sm">Not enough data yet for this range.</p>
              ) : (
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36" preserveAspectRatio="none">
                  <polyline points={points.join(" ")} fill="none" stroke="#2c6ecb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <p className="text-[10px] text-[#8c9196] mt-2">Per-channel revenue attribution isn't shown because orders aren't linked to a browsing session in this store yet — sessions below are real, channel revenue would have to be guessed.</p>
            </div>

            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-[#202223] mb-3">Sessions by traffic type</h3>
              {(!data.sessionsByType || data.sessionsByType.length === 0) ? (
                <p className="text-xs text-[#8c9196]">No sessions yet.</p>
              ) : (
                <DetailedPieChart
                  items={data.sessionsByType.map((t: any) => ({ label: t.type, count: Number(t.sessions) }))}
                  colorOf={(l) => TRAFFIC_TYPE_COLORS[l] || "#8c9196"}
                  totalLabel="Sessions"
                  stacked
                />
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.channels.slice(0, 8).map((c: any) => (
              <div key={c.source} className={`${card} p-4`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sourceColor(c.source) }} />
                  <span className="text-sm font-bold text-[#202223] truncate">{c.source}</span>
                </div>
                <p className="text-xl font-black text-[#202223] mt-2">{c.sessions}</p>
                <p className="text-[11px] text-[#8c9196]">sessions · {c.sharePct}% of total</p>
              </div>
            ))}
            {data.channels.length === 0 && <p className="text-[#8c9196] text-sm col-span-full">No traffic recorded for this range yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function VisitorsTab() {
  const [period, setPeriod] = useState<VisitorPeriod>("today");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestRef = useRef(0);

  const load = (p: VisitorPeriod) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError("");
    api
      .getAuth(`/api/analytics/visitor-analytics?period=${p}`)
      .then((result) => { if (requestId === requestRef.current) setData(result); })
      .catch((err: any) => { if (requestId === requestRef.current) setLoadError(err.message || "Failed to load visitors"); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
  };
  useEffect(() => { load(period); return () => { requestRef.current++; }; }, [period]);

  const periodLabel = VISITOR_PERIODS.find((p) => p.key === period)?.label || "Today";
  const byDay: { date: string; count: number }[] = data?.byDay || [];
  const maxDay = Math.max(1, ...byDay.map((d) => Number(d.count)));
  const maxPageCount = Math.max(1, ...(data?.landingPages || []).map((p: any) => Number(p.count)), ...(data?.exitPages || []).map((p: any) => Number(p.count)));

  const formatDay = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#6d7175] mt-0.5 font-medium">How many people came to the site, where they landed, and where they came from</p>
        </div>
        <div className="flex gap-1 bg-[#f1f1f1] rounded-lg p-1 overflow-x-auto max-w-full">
          {VISITOR_PERIODS.map((p) => (
            <button type="button"
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                period === p.key ? "bg-white text-[#202223] shadow-sm" : "text-[#6d7175] hover:text-[#202223]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-[#8c9196] text-sm">Loading visitor analytics...</p>
      ) : loadError || !data ? (
        <AdminLoadError message={loadError || "Visitor data is unavailable"} retry={() => load(period)} />
      ) : (
        <>
          {/* Headline KPI */}
          <div className={`${card} p-5 flex items-center gap-4`}>
            <div className="w-11 h-11 rounded-xl bg-[#e6f0ff] flex items-center justify-center text-[#2c6ecb] shrink-0">
              <Eye size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c9196]">Unique Visitors — {periodLabel}</p>
              <p className="text-3xl font-black text-[#202223] leading-tight">{data.total}</p>
            </div>
          </div>

          {/* Daily trend — always last 28 days for context, selected period highlighted */}
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-4">Daily Visitors — {periodLabel}</h3>
            {byDay.length === 0 ? (
              <p className="text-[#8c9196] text-sm">No visitor data yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-40 overflow-x-auto">
                {byDay.map((d) => {
                  const isToday = d.date.slice(0, 10) === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={d.date} className="flex-1 min-w-[10px] flex flex-col items-center justify-end h-full group relative">
                      <div className="text-[9px] font-bold text-[#202223] mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 whitespace-nowrap">
                        {d.count} on {formatDay(d.date)}
                      </div>
                      <div
                        className={`w-full max-w-[14px] rounded-t-md transition-colors ${isToday ? "bg-[#1a56b0]" : "bg-[#2c6ecb] hover:bg-[#1a56b0]"}`}
                        style={{ height: `${Math.max(3, (Number(d.count) / maxDay) * 100)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Traffic sources — where visitors came from (Google, Instagram, Direct...) */}
            <div className={`${card} p-5 min-w-0`}>
              <h3 className="text-sm font-bold text-[#202223] mb-1">Traffic Sources — {periodLabel}</h3>
              <p className="text-[11px] text-[#8c9196] mb-4">Where visitors came from before landing on the site</p>
              {(data.sources || []).length === 0 ? (
                <p className="text-[#8c9196] text-sm">No data for this period.</p>
              ) : (
                <DetailedPieChart
                  items={data.sources.map((s: any) => ({ label: s.source, count: Number(s.count) }))}
                  colorOf={sourceColor}
                  totalLabel="Visitors"
                />
              )}
            </div>

            {/* Landing pages — first page visitors arrived on */}
            <div className={`${card} p-5 min-w-0`}>
              <h3 className="text-sm font-bold text-[#202223] mb-1">Landing Pages — {periodLabel}</h3>
              <p className="text-[11px] text-[#8c9196] mb-4">The page each visitor first arrived on</p>
              {(data.landingPages || []).length === 0 ? (
                <p className="text-[#8c9196] text-sm">No data for this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.landingPages.map((p: any) => (
                    <div key={p.label} className="min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="font-semibold text-[#202223] truncate min-w-0">{p.label}</span>
                        <span className="text-[#6d7175] font-medium shrink-0">{p.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#f1f1f1] overflow-hidden">
                        <div className="h-full rounded-full bg-[#00a884]" style={{ width: `${(Number(p.count) / maxPageCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Exit / last-seen pages — where visitors were last active (proxy for where they left off) */}
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Pages Visitors Left From — {periodLabel}</h3>
            <p className="text-[11px] text-[#8c9196] mb-4">The last page each visitor was seen on before going inactive — a high "Home" count here usually means people are browsing but bouncing before reaching a product.</p>
            {(data.exitPages || []).length === 0 ? (
              <p className="text-[#8c9196] text-sm">No data for this period.</p>
            ) : (
              <div className="space-y-2.5">
                {data.exitPages.map((p: any) => (
                  <div key={p.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-[#202223] truncate">{p.label}</span>
                      <span className="text-[#6d7175] font-medium shrink-0 ml-2">{p.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#f1f1f1] overflow-hidden">
                      <div className="h-full rounded-full bg-[#e07c24]" style={{ width: `${(Number(p.count) / maxPageCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Live (Shopify "Live View" styled real-time visitor dashboard) ----------------
function LiveTab() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const busyRef = useRef(false);

  const load = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    api
      .getAuth("/api/analytics/live-visitors")
      .then((rows: any[]) => {
        setSessions(Array.isArray(rows) ? rows : []);
        setLoadError("");
        setLastRefresh(new Date());
        setPulse(true);
        setTimeout(() => setPulse(false), 400);
      })
      .catch((err: any) => setLoadError(err.message || "Live visitors could not refresh"))
      .finally(() => { busyRef.current = false; setLoading(false); });
  };
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => clearInterval(id);
  }, []);

  const visitorsNow = sessions.length;
  const checkingOut = sessions.filter((s) => s.isCheckout).length;
  const activeCarts = sessions.filter((s) => (s.cartCount || 0) > 0 && !s.isCheckout).length;
  const savedCheckouts = sessions.filter((s) => s.checkoutTotal != null).length;

  // Sessions grouped by geo location, sorted by count desc
  const byLocation = (() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const loc = s.geoLocation || "Unknown";
      map.set(loc, (map.get(loc) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([loc, count]) => ({ loc, count }))
      .sort((a, b) => b.count - a.count);
  })();
  const maxLocCount = Math.max(1, ...byLocation.map((l) => l.count));

  const secondsAgo = (ts: string) => {
    const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1.5 text-[11px] font-bold text-[#0c8a3e] transition-opacity ${pulse ? "opacity-100" : "opacity-70"}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0c8a3e] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0c8a3e]" />
          </span>
          {loadError ? "Refresh unavailable" : lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Connecting..."}
        </span>
      </div>
      {loadError && <AdminLoadError message={`${loadError}. Showing the last available snapshot.`} retry={load} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Visitors right now", value: visitorsNow, icon: Eye, color: "#2c6ecb" },
          { label: "Active carts", value: activeCarts, icon: ShoppingCart, color: "#8a5a00" },
          { label: "Checking out", value: checkingOut, icon: CreditCard, color: "#b98900" },
          { label: "Saved checkout details", value: savedCheckouts, icon: FileText, color: "#0c8a3e" },
        ].map((k) => (
          <div key={k.label} className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <k.icon size={16} style={{ color: k.color }} />
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c9196]">{k.label}</p>
            </div>
            <p className="text-3xl font-black text-[#202223] leading-tight">{loading ? "—" : k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Sessions by location — live snapshot */}
        <div className={`${card} p-5 min-w-0`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Sessions by location</h3>
          <p className="text-[11px] text-[#8c9196] mb-4">Where visitors currently on the site are browsing from</p>
          {byLocation.length === 0 ? (
            <p className="text-[#8c9196] text-sm">No active sessions right now.</p>
          ) : (
            <div className="space-y-2.5">
              {byLocation.slice(0, 10).map((l) => (
                <div key={l.loc} className="min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-[#202223] truncate">{l.loc}</span>
                    <span className="font-bold text-[#6d7175] shrink-0 ml-2">{l.count}</span>
                  </div>
                  <div className="h-1.5 bg-[#f1f1f1] rounded-full overflow-hidden">
                    <div className="h-full bg-[#2c6ecb] rounded-full transition-all" style={{ width: `${(l.count / maxLocCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Individual live sessions — who's on the site right now, what page, cart */}
        <div className={`${card} p-5 min-w-0`}>
          <h3 className="text-sm font-bold text-[#202223] mb-1">Active sessions</h3>
          <p className="text-[11px] text-[#8c9196] mb-4">Refreshes automatically every 5 seconds</p>
          {sessions.length === 0 ? (
            <p className="text-[#8c9196] text-sm">Nobody's on the site right now.</p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-[#f1f1f1] last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#202223] truncate">{s.pageLabel || s.page || "/"}</p>
                    <p className="text-[10px] text-[#8c9196] truncate">
                      {s.geoLocation || "Unknown location"} · {secondsAgo(s.lastSeen)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.isCheckout && (
                      <span className="px-2 py-0.5 rounded-full bg-[#fff4e4] text-[#b98900] text-[10px] font-bold">Checkout</span>
                    )}
                    {!s.isCheckout && (s.cartCount || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#e6f0ff] text-[#2c6ecb] text-[10px] font-bold">Cart · {s.cartCount}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportsTab() {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [productView, setProductView] = useState<"qty" | "revenue">("revenue");

  // Period-based Sales / Customer report exporter (Excel or PDF) — separate
  // from the fixed "Last 1 Year" analysis below, since admins want to pull
  // a report for a specific window (today, this month, last month, etc.)
  // rather than always the full year.
  const [exportPeriod, setExportPeriod] = useState("this_month");
  const [exportLoading, setExportLoading] = useState<string | null>(null); // which button is busy

  const runExport = async (kind: "sales-excel" | "customer-excel") => {
    setExportLoading(kind);
    try {
      const result: ExportData = await api.getAuth(`/api/analytics/export-data?period=${exportPeriod}`);
      if (kind === "sales-excel") await exportSalesExcel(result);
      else await exportCustomerExcel(result);
    } catch (err: any) {
      showToast(err.message || "Couldn't download this report. Please try again.", "error");
    } finally {
      setExportLoading(null);
    }
  };

  const load = () => {
    setLoading(true);
    setLoadError("");
    api.getAuth("/api/analytics/report?months=12").then(setData).catch((err: any) => setLoadError(err.message || "Failed to load report")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    if (!data) return;
    const rows: string[] = [];
    rows.push("3DCaseMakers Report Analysis — Last 1 Year");
    rows.push(`Generated,${csvCell(new Date(data.generatedAt).toLocaleString("en-IN"))}`);
    rows.push("");
    rows.push("Month,Revenue,Orders");
    data.monthlyRevenue.slice(-12).forEach((m: any) => rows.push(`${m.month},${m.revenue},${m.orders}`));
    rows.push("");
    rows.push("Top Products (by revenue),Qty Sold,Revenue");
    data.topProductsByRevenue.forEach((p: any) => rows.push(`${csvCell(p.title)},${p.qty},${Number(p.revenue).toFixed(2)}`));
    rows.push("");
    rows.push("Brand,Qty Sold,Revenue");
    data.brandBreakdown.forEach((b: any) => rows.push(`${csvCell(b.brand)},${b.qty},${Number(b.revenue).toFixed(2)}`));
    rows.push("");
    rows.push("Collection,Qty Sold,Revenue");
    data.collectionBreakdown.forEach((c: any) => rows.push(`${csvCell(c.collection)},${c.qty},${Number(c.revenue).toFixed(2)}`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3dcasemakers-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (loading) return <p className="text-[#8c9196] text-sm" role="status">Loading report...</p>;
  if (loadError || !data) return <AdminLoadError message={loadError || "Report data is unavailable"} retry={load} />;

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  };
  const productList = productView === "qty" ? data.topProductsByQty : data.topProductsByRevenue;
  const maxProductVal = Math.max(1, ...productList.map((p: any) => (productView === "qty" ? p.qty : p.revenue)));
  const maxBrandRevenue = Math.max(1, ...data.brandBreakdown.map((b: any) => b.revenue));
  const totalYearOrders = data.statusBreakdownYear.reduce((s: number, x: any) => s + Number(x.count), 0);

  const exportBtn = (kind: "sales-excel" | "customer-excel", label: string) => (
    <button type="button"
      onClick={() => runExport(kind)}
      disabled={exportLoading !== null}
      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-[#e1e3e5] text-[#202223] hover:bg-[#f6f6f7] disabled:opacity-50 transition-colors"
    >
      {exportLoading === kind ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Booked order value & sales breakdown — {data.periodLabel || data.windowLabel}.</p>
        </div>
        <button type="button" onClick={exportCSV} className={`${btnPrimary} flex items-center gap-1.5`}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Period-based Sales / Customer report exports (Excel or PDF) */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#202223]">Sales & Customer Reports</h3>
            <p className="text-[11px] text-[#8c9196] mt-0.5">Pick a period, then download as Excel</p>
          </div>
          <LiquidPillGroup options={REPORT_PERIODS} value={exportPeriod} onChange={setExportPeriod} size="sm" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-black text-[#202223] uppercase tracking-wider">Sales Report</p>
            <div className="flex flex-wrap gap-2">
              {exportBtn("sales-excel", "Excel (.xlsx)")}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black text-[#202223] uppercase tracking-wider">Customer Report</p>
            <div className="flex flex-wrap gap-2">
              {exportBtn("customer-excel", "Excel (.xlsx)")}
            </div>
          </div>
        </div>
      </div>

      {/* Top summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><IndianRupee size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">Booked sales (12mo)</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">₹{Number(data.yearTotals.totalRevenue).toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-[#8c9196] mt-1">All-time: ₹{Number(data.allTimeTotals.totalRevenue).toLocaleString("en-IN")}</p>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><Package size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">Orders (1yr)</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">{data.yearTotals.totalOrders}</p>
          <p className="text-[10px] text-[#8c9196] mt-1">All-time: {data.allTimeTotals.totalOrders}</p>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><TrendingUp size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">Avg Order Value</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">₹{Math.round(Number(data.yearTotals.avgOrderValue)).toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-[#8c9196] mt-1">per order, last 1 year</p>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[#6d7175]"><Repeat size={13} /><p className="text-[10px] font-bold uppercase tracking-wider">New vs Returning</p></div>
          <p className="text-2xl font-black text-[#202223] mt-1.5">{data.customerInsights.newCustomers} / {data.customerInsights.returningCustomers}</p>
          <p className="text-[10px] text-[#8c9196] mt-1">new / returning customers</p>
        </div>
      </div>

      {/* Monthly revenue line chart (12 months) — soft curve, X axis = time (month), Y axis = amount */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-[#202223] mb-4">Monthly Revenue — Last 12 Months</h3>
        {data.monthlyRevenue.length === 0 ? (
          <p className="text-[#8c9196] text-sm">No orders in the last 12 months.</p>
        ) : (
          <RevenueLineChart data={data.monthlyRevenue.slice(-12).map((m: any) => ({ day: m.month, revenue: m.revenue }))} formatLabel={formatMonth} />
        )}
      </div>

      {/* Order status breakdown (full year) */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-[#202223] mb-4">Order Fulfillment — Last 1 Year</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.statusBreakdownYear.map((s: any) => (
            <div key={s.status} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-xs text-[#202223] capitalize">{s.status.replace(/_/g, " ")}</span>
                <span className="font-bold text-[#202223]">{s.count}</span>
              </div>
              <div className="h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
                <div className="h-full bg-[#2c6ecb] rounded-full" style={{ width: `${totalYearOrders > 0 ? Math.round((s.count / totalYearOrders) * 100) : 0}%` }} />
              </div>
              <p className="text-[10px] text-[#8c9196]">₹{Number(s.revenue).toLocaleString("en-IN")} revenue</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top products */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#202223] flex items-center gap-1.5"><Award size={15} /> Best Selling Products</h3>
          <div className="flex items-center gap-1 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full p-1">
            {(["revenue", "qty"] as const).map((v) => (
              <button type="button" key={v} onClick={() => setProductView(v)} className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors ${productView === v ? "btn-liquid-dark" : "text-[#6d7175]"}`}>
                {v === "revenue" ? "By Revenue" : "By Units Sold"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          {productList.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <span className="text-[#8c9196] font-bold text-xs w-5 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#202223] font-medium truncate flex items-center gap-1.5">
                    {p.title}
                    {p.isBestSeller && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">BEST SELLER</span>}
                    {p.isTrending && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">TRENDING</span>}
                  </span>
                  <span className="text-[#6d7175] text-xs font-semibold shrink-0">{productView === "qty" ? `${p.qty} sold` : `₹${p.revenue.toLocaleString("en-IN")}`}</span>
                </div>
                <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-[#202223] rounded-full" style={{ width: `${((productView === "qty" ? p.qty : p.revenue) / maxProductVal) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          {productList.length === 0 && <p className="text-[#8c9196] text-sm">No sales data yet.</p>}
        </div>
      </div>

      {/* Brand + Collection breakdown side by side */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223] mb-4">Revenue by Brand</h3>
          <div className="space-y-2.5">
            {data.brandBreakdown.slice(0, 10).map((b: any) => (
              <div key={b.brand} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#202223]">{b.brand}</span>
                  <span className="text-[#6d7175]">₹{b.revenue.toLocaleString("en-IN")} · {b.qty} units</span>
                </div>
                <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#10b981] rounded-full" style={{ width: `${(b.revenue / maxBrandRevenue) * 100}%` }} />
                </div>
              </div>
            ))}
            {data.brandBreakdown.length === 0 && <p className="text-[#8c9196] text-sm">No data yet.</p>}
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223] mb-4">Revenue by Collection</h3>
          <div className="space-y-2.5">
            {data.collectionBreakdown.slice(0, 10).map((c: any) => (
              <div key={c.collection} className="flex items-center justify-between text-sm">
                <span className="text-[#202223] font-medium truncate">{c.collection}</span>
                <span className="text-[#6d7175] text-xs font-semibold shrink-0">₹{c.revenue.toLocaleString("en-IN")} · {c.qty} units</span>
              </div>
            ))}
            {data.collectionBreakdown.length === 0 && <p className="text-[#8c9196] text-sm">No data yet.</p>}
          </div>
        </div>
      </div>

      {/* Top customers */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-[#202223] mb-4">Top Customers (by spend, last 1 year)</h3>
        <div className="divide-y divide-[#f1f1f1]">
          {data.customerInsights.topCustomers.map((c: any, i: number) => (
            <div key={c.customer_phone} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#8c9196] font-bold text-xs w-5">{i + 1}</span>
                <span className="text-[#202223] font-medium">{c.customer_phone}</span>
              </div>
              <span className="text-[#6d7175] text-xs font-semibold">₹{Number(c.totalSpent).toLocaleString("en-IN")} · {c.orderCount} orders</span>
            </div>
          ))}
          {data.customerInsights.topCustomers.length === 0 && <p className="text-[#8c9196] text-sm">No customer data yet.</p>}
        </div>
      </div>

      <p className="text-[10px] text-[#8c9196]">Generated {new Date(data.generatedAt).toLocaleString("en-IN")} · figures exclude cancelled orders</p>
    </div>
  );
}

// ---------------- Analytics (Shopify Analytics-dashboard styled view) ----------------
// Bridge so the shared header's "Export CSV" button can trigger this tab's export
// (mirrors productsTabActions / discountsTabActions above).
const analyticsTabActions: { exportCSV: (() => void) | null } = { exportCSV: null };

// Small inline SVG sparkline used inside each KPI card — no charting library,
// just a normalized polyline through the given values.
function AnalyticsSparkline({ values, color = "#2c6ecb", width = 96, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} />;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((values[values.length - 1] - min) / range) * (height - 4) - 2} r={2.5} fill={color} />
    </svg>
  );
}

// Shopify-style green/red trend chip ("↗ 17%" / "↘ 8%").
function TrendChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[11px] text-[#8c9196] font-semibold">—</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? "text-[#0c8a3e]" : "text-[#b3261e]"}`}>
      {up ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  );
}

const ANALYTICS_RANGE_OPTIONS: { key: "3" | "6" | "12"; label: string }[] = [
  { key: "3", label: "Last 3 months" },
  { key: "6", label: "Last 6 months" },
  { key: "12", label: "Last 12 months" },
];

function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestRef = useRef(0);
  const [range, setRange] = useState<"3" | "6" | "12">("12");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [subTab, setSubTab] = useState<"overview" | "phoneModels">("overview");

  const load = () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError("");
    api.getAuth(`/api/analytics/report?months=${range}`)
      .then((result) => { if (requestId === requestRef.current) setData(result); })
      .catch((err: any) => { if (requestId === requestRef.current) setLoadError(err.message || "Failed to load analytics"); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
  };
  useEffect(() => { load(); return () => { requestRef.current++; }; }, [range]);

  const exportCSV = () => {
    if (!data || loading || loadError) return;
    const rows: string[] = [];
    rows.push(`3DCaseMakers Analytics — ${data.periodLabel || `Last ${range} months`}`);
    rows.push(`Generated,${csvCell(new Date(data.generatedAt).toLocaleString("en-IN"))}`);
    rows.push("");
    rows.push("Month,Revenue,Orders");
    data.monthlyRevenue.slice(-Number(range)).forEach((m: any) => rows.push(`${m.month},${m.revenue},${m.orders}`));
    rows.push("");
    rows.push("Total sales breakdown");
    rows.push(`Gross sales,${data.yearTotals.grossSales}`);
    rows.push(`Shipping charges,${data.yearTotals.totalShipping}`);
    rows.push(`Total sales,${data.yearTotals.totalRevenue}`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3dcasemakers-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  useEffect(() => {
    analyticsTabActions.exportCSV = exportCSV;
    return () => { analyticsTabActions.exportCSV = null; };
  }, [data, range, loading, loadError]);

  if (loading) return <p className="text-[#8c9196] text-sm" role="status">Loading analytics...</p>;
  if (loadError || !data) return <AdminLoadError message={loadError || "Analytics data is unavailable"} retry={load} />;

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  };

  const n = Number(range);
  const months = data.monthlyRevenue.slice(-n);
  const prevMonths = data.monthlyRevenue.slice(-(n * 2), -n);
  const sum = (arr: any[], key: string) => arr.reduce((s, m) => s + Number(m[key]), 0);
  const pctChange = (curr: number, prev: number) => (prevMonths.length === n && prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null);

  const currRevenue = sum(months, "revenue");
  const prevRevenue = sum(prevMonths, "revenue");
  const revenueChangePct = pctChange(currRevenue, prevRevenue);

  const currOrders = sum(months, "orders");
  const prevOrders = sum(prevMonths, "orders");
  const ordersChangePct = pctChange(currOrders, prevOrders);

  const totalCustomers = Number(data.customerInsights.newCustomers) + Number(data.customerInsights.returningCustomers);
  const returningRate = totalCustomers > 0 ? Math.round((data.customerInsights.returningCustomers / totalCustomers) * 1000) / 10 : 0;

  const fulfilledCount = data.statusBreakdownYear
    .filter((s: any) => ["shipped", "out_for_delivery", "delivered"].includes(s.status))
    .reduce((s: number, x: any) => s + Number(x.count), 0);
  const fulfilledPct = data.yearTotals.totalOrders > 0 ? Math.round((fulfilledCount / data.yearTotals.totalOrders) * 100) : 0;
  const netSales = Math.max(0, Number(data.yearTotals.totalRevenue) - Number(data.yearTotals.totalShipping));
  const discounts = Math.max(0, Number(data.yearTotals.grossSales) - netSales);

  const kpis = [
    { label: "Booked sales", value: `₹${currRevenue.toLocaleString("en-IN")}`, change: revenueChangePct, spark: months.map((m: any) => Number(m.revenue)), color: "#2c6ecb", hint: "vs previous period" },
    { label: "Returning customer rate", value: `${returningRate}%`, change: null, spark: [], color: "#8a5a00", hint: "of customers in this period" },
    { label: "Orders fulfilled", value: `${fulfilledCount}`, change: null, spark: [], color: "#0c8a3e", hint: `${fulfilledPct}% of orders in this period` },
    { label: "Orders", value: `${currOrders}`, change: ordersChangePct, spark: months.map((m: any) => Number(m.orders)), color: "#2c6ecb", hint: "vs previous period" },
  ];

  // Big "Total sales over time" chart geometry
  const chartW = 900, chartH = 220, chartPad = 8;
  const revVals = months.map((m: any) => Number(m.revenue));
  const revMax = Math.max(1, ...revVals);
  const chartStep = months.length > 1 ? (chartW - chartPad * 2) / (months.length - 1) : 0;
  const chartPoints = revVals.map((v, i) => {
    const x = chartPad + i * chartStep;
    const y = chartH - chartPad - (v / revMax) * (chartH - chartPad * 2);
    return `${x},${y}`;
  });
  const areaPoints = `${chartPad},${chartH - chartPad} ${chartPoints.join(" ")} ${chartPad + (months.length - 1) * chartStep},${chartH - chartPad}`;

  const currentRangeLabel = ANALYTICS_RANGE_OPTIONS.find((o) => o.key === range)?.label || "Last 12 months";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-[#6d7175]">
        <PieChart size={14} /> Last refreshed {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
      </div>

      <LiquidPillGroup
        options={[
          { key: "overview", label: "Overview" },
          { key: "phoneModels", label: "Best Selling Phone Models" },
        ]}
        value={subTab}
        onChange={(v) => setSubTab(v as "overview" | "phoneModels")}
        size="sm"
      />

      {subTab === "phoneModels" ? (
        <PhoneModelsPanel />
      ) : (
      <>
      {/* Filter bar: date-range dropdown, mirrors the Shopify range picker pill */}
      <div className="flex flex-wrap items-center gap-2 relative">
        <div className="relative">
          <button type="button"
            onClick={() => setRangeMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#202223] bg-white border border-[#c9cccf] px-3 py-1.5 rounded-lg hover:bg-[#f6f6f7]"
          >
            {currentRangeLabel} <ChevronDown size={14} className="text-[#8c9196]" />
          </button>
          {rangeMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRangeMenuOpen(false)} />
              <div className="absolute z-20 top-full left-0 mt-1 w-44 bg-white border border-[#e1e3e5] rounded-lg shadow-lg py-1">
                {ANALYTICS_RANGE_OPTIONS.map((o) => (
                  <button type="button"
                    key={o.key}
                    onClick={() => { setRange(o.key); setRangeMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f6f7] ${range === o.key ? "font-semibold text-[#202223]" : "text-[#494c50]"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="text-xs text-[#8c9196] font-medium">{months.length ? `${formatMonth(months[0].month)} – ${formatMonth(months[months.length - 1].month)}` : ""}</span>
        <span className="text-xs text-[#8c9196] border border-[#e1e3e5] rounded-md px-2 py-1 ml-auto">INR ₹</span>
      </div>

      {/* KPI cards row with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} p-4`}>
            <p className="text-xs font-semibold text-[#202223]">{k.label}</p>
            <div className="flex items-end justify-between mt-1.5 gap-2">
              <div>
                <p className="text-xl font-black text-[#202223]">{k.value}</p>
                {k.change !== null && <TrendChip pct={k.change} />}
                <p className="text-[10px] text-[#8c9196] mt-1">{k.hint}</p>
              </div>
              {k.spark.length > 0 && <AnalyticsSparkline values={k.spark} color={k.color} />}
            </div>
          </div>
        ))}
      </div>

      {/* Main chart + breakdown panel side by side */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223]">Total sales over time</h3>
          <div className="flex items-center gap-2 mt-1 mb-4">
            <span className="text-2xl font-black text-[#202223]">₹{currRevenue.toLocaleString("en-IN")}</span>
            <TrendChip pct={revenueChangePct} />
          </div>
          {months.length < 2 ? (
            <p className="text-[#8c9196] text-sm">Not enough data yet for this range.</p>
          ) : (
            <>
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-56" preserveAspectRatio="none">
                <polygon points={areaPoints} fill="#2c6ecb" opacity={0.08} />
                <polyline points={chartPoints.join(" ")} fill="none" stroke="#2c6ecb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {chartPoints.map((p, i) => {
                  const [x, y] = p.split(",");
                  return <circle key={i} cx={x} cy={y} r={2.5} fill="#2c6ecb" />;
                })}
              </svg>
              <div className="flex justify-between mt-1">
                {months.map((m: any) => (
                  <span key={m.month} className="text-[9px] text-[#8c9196] font-semibold">{formatMonth(m.month)}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-[#202223] mb-3">Total sales breakdown</h3>
          <div className="divide-y divide-[#f1f1f1] text-sm">
            {[
              { label: "Gross sales", value: data.yearTotals.grossSales },
              { label: "Discounts", value: discounts },
              { label: "Sales reversals", value: null },
              { label: "Net sales", value: netSales },
              { label: "Shipping charges", value: data.yearTotals.totalShipping },
              { label: "Return fees", value: null },
              { label: "Taxes", value: null },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2">
                <span className="text-blue-600 font-medium">{r.label}</span>
                <span className="text-[#202223] font-semibold">{r.value === null ? "—" : `₹${Number(r.value).toLocaleString("en-IN")}`}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2 pt-3 border-t border-[#e1e3e5] mt-1">
              <span className="text-blue-600 font-bold">Total sales</span>
              <span className="text-[#202223] font-black">₹{Number(data.yearTotals.totalRevenue).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[#8c9196]">{data.periodLabel || currentRangeLabel} · calendar dates in India Standard Time · cancelled and returned orders excluded · booked sales include orders with pending payment · percentage changes compare the previous equal-length period when its sales are above zero.</p>
      </>
      )}
    </div>
  );
}

// ---------------- Gmail Manager (mailbox send-limit dashboard) ----------------
// Shows today's outbound-email count for each configured Gmail SMTP mailbox
// against Gmail's 500-emails/24hr sending cap, as a pie chart (used vs
// remaining) per mailbox. Backed by GET /api/email-usage, which counts rows
// in email_send_log — every order confirmation, status update, contact
// reply, owner notification, and daily report increments that log the
// moment it's actually sent (see backend/src/services/emailService.js).
type GmailMailboxUsage = {
  address: string;
  label: string;
  sentToday: number;
  limit: number;
  remaining: number;
  usagePct: number;
};

// Simple two-slice donut (used / remaining) drawn with plain SVG stroke-dasharray
// arcs — no charting library needed for a single ratio like this.
function MailboxUsageDonut({ usagePct, color }: { usagePct: number; color: string }) {
  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const usedLen = (Math.min(100, Math.max(0, usagePct)) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f2" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${usedLen} ${circumference - usedLen}`}
        className="transition-all duration-500"
      />
    </svg>
  );
}

function GmailManagerCard({ mailbox }: { mailbox: GmailMailboxUsage }) {
  const nearLimit = mailbox.usagePct >= 80;
  const atLimit = mailbox.sentToday >= mailbox.limit;
  const color = atLimit ? "#dc2626" : nearLimit ? "#d97706" : "#16a34a";
  return (
    <div className="bg-white rounded-xl border border-[#e1e3e5] p-5 flex flex-col items-center text-center">
      <div className="w-full flex items-center gap-2 mb-1 justify-center">
        <Mail className="w-3.5 h-3.5 text-[#8c9196] shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-wide text-[#8c9196] truncate">{mailbox.label}</span>
      </div>
      <p className="text-xs font-bold text-[#202223] mb-4 truncate max-w-full">{mailbox.address}</p>

      <div className="relative">
        <MailboxUsageDonut usagePct={mailbox.usagePct} color={color} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-[#202223] leading-none">{mailbox.sentToday}</span>
          <span className="text-[10px] font-bold text-[#8c9196] mt-0.5">of {mailbox.limit}</span>
        </div>
      </div>

      <div
        className={`mt-4 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${
          atLimit ? "bg-red-100 text-red-600" : nearLimit ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {atLimit ? "Limit reached" : `${mailbox.usagePct}% used`}
      </div>

      <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-[#e1e3e5]">
        <div>
          <p className="text-lg font-black text-[#202223] leading-none">{mailbox.sentToday}</p>
          <p className="text-[10px] font-bold text-[#8c9196] mt-1">Sent today</p>
        </div>
        <div>
          <p className="text-lg font-black text-[#202223] leading-none">{mailbox.remaining}</p>
          <p className="text-[10px] font-bold text-[#8c9196] mt-1">Remaining</p>
        </div>
      </div>
    </div>
  );
}

// Gmail Manager: shows whether each mailbox is configured in the backend .env
// and lets the admin send a real test email — the SMTP error text comes back
// so a wrong app password / missing env var is obvious immediately.
function EmailHealthCard() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.getAuth("/api/email-usage/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  const test = async (mailbox: "customer" | "orders") => {
    setTesting(mailbox);
    setLastResult(null);
    try {
      const r = await api.postAuthJson("/api/email-usage/test", { mailbox, to: to.trim() || undefined });
      setLastResult({ ok: true, text: `Sent from ${r.from} to ${r.to} — check that inbox (and Spam).` });
      showToast("Test email sent", "success");
    } catch (err: any) {
      setLastResult({ ok: false, text: err?.message || "Failed" });
    } finally {
      setTesting(null);
    }
  };

  const Row = ({ label, info, hint }: { label: string; info?: { configured: boolean; address: string | null }; hint: string }) => (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[#f1f2f3] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#202223]">{label}</p>
        <p className="text-[11px] text-[#8c9196]">{hint}</p>
      </div>
      <span className={statusPill(info?.configured ? "success" : "critical")}>
        {info?.configured ? info.address || "Configured" : "Not set"}
      </span>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-[#e1e3e5] p-4 sm:p-5">
      <h3 className="text-sm font-bold text-[#202223] mb-1">Email notifications health</h3>
      <p className="text-[11px] text-[#6d7175] mb-3">Configured in the backend <code>.env</code>. Gmail needs a 16-character App Password (not your normal password).</p>
      {status ? (
        <>
          <Row label="Customer emails (EMAIL_USER)" info={status.customerMailbox} hint="Order confirmation, status updates, contact replies" />
          <Row label="Orders mailbox (ORDERS_EMAIL_USER)" info={status.ordersMailbox} hint="Sends you a mail for every new order + 11:59 PM daily report" />
          <Row label="Owner inbox (OWNER_EMAIL)" info={status.ownerInbox} hint="Where new-order notifications and the daily report arrive" />
        </>
      ) : (
        <p className="text-xs text-[#8c9196]">Couldn't load status (backend needs the latest update).</p>
      )}
      <div className="mt-4 grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Send test to (optional — defaults to owner / store inbox)" className={inputCls} />
        <button type="button" className={btnSecondary} disabled={!!testing} onClick={() => test("customer")}>{testing === "customer" ? "Sending…" : "Test customer mailbox"}</button>
        <button type="button" className={btnPrimary} disabled={!!testing} onClick={() => test("orders")}>{testing === "orders" ? "Sending…" : "Test order notifications"}</button>
      </div>
      {lastResult && (
        <p className={`mt-3 text-xs font-semibold break-words ${lastResult.ok ? "text-[#0c8a3e]" : "text-[#d72c0d]"}`}>
          {lastResult.ok ? "✅ " : "❌ "}{lastResult.text}
        </p>
      )}
    </div>
  );
}

function GmailManagerTab() {
  const [data, setData] = useState<{ limit: number; windowHours: number; mailboxes: GmailMailboxUsage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    api
      .getAuth("/api/email-usage")
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-black text-[#202223] tracking-tight">Gmail Manager</h2>
          <p className="text-xs text-[#6d7175] mt-0.5">
            Today's outbound email count per mailbox, against Gmail's 500 emails / 24hr sending limit.
          </p>
        </div>
        <button type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#202223] border border-[#e1e3e5] rounded-lg px-3 py-1.5 hover:bg-[#f6f6f7]"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <EmailHealthCard />

      {loading ? (
        <div className="py-16 text-center text-xs text-[#8c9196] font-semibold">Loading…</div>
      ) : error || !data ? (
        <div className="py-16 text-center text-xs text-[#8c9196] font-semibold">Couldn't load email usage. Try refreshing.</div>
      ) : data.mailboxes.length === 0 ? (
        <div className="py-16 text-center text-xs text-[#8c9196] font-semibold">
          No Gmail mailboxes configured (EMAIL_USER / ORDERS_EMAIL_USER in .env).
        </div>
      ) : (
        <>
          <div className={`grid gap-4 ${data.mailboxes.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-sm"}`}>
            {data.mailboxes.map((m) => (
              <GmailManagerCard key={m.address} mailbox={m} />
            ))}
          </div>

          <div className="bg-white rounded-xl border border-[#e1e3e5] p-4">
            <p className="text-[11px] text-[#6d7175] leading-relaxed">
              Each Gmail account can send a maximum of <span className="font-bold text-[#202223]">{data.limit} emails</span> in a rolling{" "}
              <span className="font-bold text-[#202223]">{data.windowHours}-hour</span> window before Gmail temporarily blocks further
              sends from that mailbox. Counts reset at midnight IST and are based on emails this store has actually sent (order
              confirmations, status updates, contact replies, owner notifications &amp; daily reports) — not emails received.
            </p>
          </div>
        </>
      )}
    </div>
  );
}


const PHONE_MODEL_PERIOD_OPTIONS: { key: "today" | "7d" | "30d" | "90d" | "1y" | "all"; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "1y", label: "Last 1 year" },
  { key: "all", label: "All time" },
];

function PhoneModelsPanel() {
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "90d" | "1y" | "all">("30d");
  const [data, setData] = useState<{ generatedAt: string; totalUnits: number; models: { model: string; qty: number; revenue: number; orders: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getAuth(`/api/analytics/top-phone-models?period=${period}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const currentLabel = PHONE_MODEL_PERIOD_OPTIONS.find((o) => o.key === period)?.label || "Last 30 days";
  const models = data?.models || [];
  const topQty = models[0]?.qty || 1;

  return (
    <div className="space-y-4">
      {/* Time interval picker */}
      <div className="flex items-center gap-2 relative">
        <div className="relative">
          <button type="button"
            onClick={() => setPeriodMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#202223] bg-white border border-[#c9cccf] px-3 py-1.5 rounded-lg hover:bg-[#f6f6f7]"
          >
            {currentLabel} <ChevronDown size={14} className="text-[#8c9196]" />
          </button>
          {periodMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPeriodMenuOpen(false)} />
              <div className="absolute z-20 top-full left-0 mt-1 w-48 bg-white border border-[#e1e3e5] rounded-lg shadow-lg py-1">
                {PHONE_MODEL_PERIOD_OPTIONS.map((o) => (
                  <button type="button"
                    key={o.key}
                    onClick={() => { setPeriod(o.key); setPeriodMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f6f7] ${period === o.key ? "font-semibold text-[#202223]" : "text-[#494c50]"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {data && (
          <span className="text-xs text-[#8c9196] font-medium ml-1">
            {data.totalUnits} unit{data.totalUnits === 1 ? "" : "s"} sold across {models.length} model{models.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-[#202223] mb-4 flex items-center gap-2">
          <Smartphone size={16} className="text-[#8c9196]" /> Top Selling Phone Models — {currentLabel}
        </h3>

        {loading ? (
          <p className="text-[#8c9196] text-sm py-6 text-center">Loading…</p>
        ) : models.length === 0 ? (
          <p className="text-[#8c9196] text-sm py-6 text-center">No phone-model sales in this period yet.</p>
        ) : (
          <div className="space-y-3">
            {models.map((m, i) => (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#8c9196] w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#202223] truncate">{m.model}</span>
                    <span className="text-xs text-[#6d7175] shrink-0">
                      {m.qty} sold · ₹{m.revenue.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#f1f2f3] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2c6ecb] rounded-full"
                      style={{ width: `${Math.max(4, Math.round((m.qty / topQty) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#8c9196]">Based on the phone model selected by the customer at checkout for each order item · cancelled orders excluded.</p>
    </div>
  );
}

// ---------------- Settings (Maintenance Mode, WhatsApp toggle, key site settings overview) ----------------
function ToggleSwitch({ checked, onChange, label = "Enable setting", disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      disabled={disabled}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="ios-toggle relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[2px]"
      data-checked={checked}
    >
      <span className="ios-toggle-track" />
      <span className="ios-toggle-knob" />
    </button>
  );
}

const MAX_ANNOUNCEMENT_ITEMS = 5;

function AnnouncementMessagesEditor({
  messages,
  onChange,
  onSave,
}: {
  messages: string[];
  onChange: (next: string[]) => void;
  onSave: () => void;
}) {
  const update = (i: number, value: string) => {
    const next = [...messages];
    next[i] = value;
    onChange(next);
  };
  const remove = (i: number) => {
    const next = messages.filter((_, idx) => idx !== i);
    onChange(next);
    onSave();
  };
  const add = () => {
    if (messages.length >= MAX_ANNOUNCEMENT_ITEMS) return;
    onChange([...messages, ""]);
  };

  return (
    <div className="pt-4 border-t border-[#e1e3e5]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-[#202223]">Announcement Items ({messages.length}/{MAX_ANNOUNCEMENT_ITEMS})</p>
        <button
          type="button"
          onClick={add}
          disabled={messages.length >= MAX_ANNOUNCEMENT_ITEMS}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add item
        </button>
      </div>
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={m}
              onChange={(e) => update(i, e.target.value)}
              onBlur={onSave}
              maxLength={80}
              placeholder={`Announcement ${i + 1}`}
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
              aria-label="Remove"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-xs text-[#8c9196]">No items yet — add up to {MAX_ANNOUNCEMENT_ITEMS} to show in the scrolling bar.</p>
        )}
      </div>
      <p className="text-[11px] text-[#8c9196] mt-2">These scroll continuously in the bar under the nav bar. Max {MAX_ANNOUNCEMENT_ITEMS} items, changes save automatically.</p>
    </div>
  );
}

// Settings-tab card: two WhatsApp message templates for following up on
// abandoned checkouts — one for Tamil Nadu/Puducherry customers (free
// shipping), one for every other state (door-delivery charge applies).
// Supports {name}, {phone}, {address}, {total}, {products} placeholders —
// {products} expands to each cart item's title + working product link,
// phone model, and any personalization text/photo.
const ABANDONED_PLACEHOLDERS = ["{name}", "{products}", "{address}", "{phone}", "{total}", "{instagram}", "{website}"];

// A plain, fully-editable textarea for each state group, plus quick-insert
// chips that drop a placeholder token at the cursor — so Hari can write
// whatever wording he wants and still easily place the dynamic bits.
function AbandonedWhatsAppTemplatesCard({ form, set, save }: { form: any; set: (k: string, v: any) => void; save: () => void }) {
  const tnRef = useRef<HTMLTextAreaElement>(null);
  const otherRef = useRef<HTMLTextAreaElement>(null);

  const insertPlaceholder = (key: string, ref: React.RefObject<HTMLTextAreaElement>, fallback: string) => (token: string) => {
    const el = ref.current;
    const current = form[key] ?? fallback;
    if (!el) { set(key, current + token); save(); return; }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    set(key, next);
    save();
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertTN = insertPlaceholder("abandonedMsgTNPondy", tnRef, DEFAULT_ABANDONED_MSG_TN_PONDY);
  const insertOther = insertPlaceholder("abandonedMsgOtherStates", otherRef, DEFAULT_ABANDONED_MSG_OTHER_STATES);

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div>
        <h3 className="text-sm font-bold text-[#202223]">Abandoned Checkout — WhatsApp Message</h3>
        <p className="text-xs text-[#6d7175] mt-1">
          Fully customizable text for each field — write it however you like. When you click WhatsApp on an abandoned checkout, this message is auto-filled with that customer's products (each with a working product link), phone model, personalization text/photo, and address wherever you place the placeholders below.
        </p>
      </div>

      <div>
        <label className="text-xs font-bold text-[#202223] block mb-1">Instagram Link (used by {"{instagram}"})</label>
        <input
          type="text"
          value={form.abandonedInstagramUrl ?? DEFAULT_INSTAGRAM_URL}
          onChange={(e) => set("abandonedInstagramUrl", e.target.value)}
          onBlur={save}
          placeholder="https://instagram.com/3dcasemakers"
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-xs font-bold text-[#202223] block mb-1">Tamil Nadu &amp; Puducherry (Free Shipping)</label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {ABANDONED_PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => insertTN(p)} className="text-[10px] font-bold text-[#202223] bg-[#f6f6f7] hover:bg-[#e1e3e5] rounded-full px-2 py-1 transition">
              + {p}
            </button>
          ))}
        </div>
        <textarea
          ref={tnRef}
          value={form.abandonedMsgTNPondy ?? DEFAULT_ABANDONED_MSG_TN_PONDY}
          onChange={(e) => set("abandonedMsgTNPondy", e.target.value)}
          onBlur={save}
          rows={5}
          placeholder="Write your custom WhatsApp message for Tamil Nadu / Puducherry customers..."
          className={inputCls}
        />
      </div>

      <div>
        <label className="text-xs font-bold text-[#202223] block mb-1">Other States (Door Delivery Charge)</label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {ABANDONED_PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => insertOther(p)} className="text-[10px] font-bold text-[#202223] bg-[#f6f6f7] hover:bg-[#e1e3e5] rounded-full px-2 py-1 transition">
              + {p}
            </button>
          ))}
        </div>
        <textarea
          ref={otherRef}
          value={form.abandonedMsgOtherStates ?? DEFAULT_ABANDONED_MSG_OTHER_STATES}
          onChange={(e) => set("abandonedMsgOtherStates", e.target.value)}
          onBlur={save}
          rows={5}
          placeholder="Write your custom WhatsApp message for other states..."
          className={inputCls}
        />
      </div>
    </div>
  );
}

// ---------------- Settings (Shopify-style Settings shell: sub-sidebar of categories + detail panel) ----------------
type SettingsCategoryKey =
  | "General" | "Payments" | "Checkout"
  | "Shipping and delivery" | "Sales channels"
  | "Domains" | "Notifications" | "Policies";

const SETTINGS_NAV: { key: SettingsCategoryKey; icon: any }[] = [
  { key: "General", icon: SettingsIcon },
  { key: "Payments", icon: CreditCard },
  { key: "Checkout", icon: ShoppingCart },
  { key: "Shipping and delivery", icon: Truck },
  { key: "Sales channels", icon: SlidersHorizontal },
  { key: "Domains", icon: Grid3x3 },
  { key: "Notifications", icon: Bell },
  { key: "Policies", icon: FileText },
];

// Categories that mirror real Shopify settings but have no equivalent system in
// this custom-built, self-hosted, online-payment (Easebuzz) store. Rather than fake interactive
// forms for these, each shows a short honest explanation of how (or whether)
// the store handles that concern — same spirit as the Content-tab sub-pages
// that were intentionally left on their original custom UI.
const SETTINGS_STATIC_INFO: Partial<Record<SettingsCategoryKey, { blurb: string; rows?: { label: string; value: string }[] }>> = {};

// Settings: editable WhatsApp messages for each order status + which status
// changes automatically open a WhatsApp chat with the customer.
function OrderWhatsAppTemplatesCard() {
  const { showToast } = useToast();
  const [tpl, setTpl] = useState<Record<string, string>>({ ...WA_DEFAULT_TEMPLATES });
  const [auto, setAuto] = useState<Record<string, boolean>>({ ready_to_ship: true, delivered: true });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string>("waTplReadyToShip");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api.getAuth("/api/settings/admin").then((s: any) => {
      if (!active) return;
      const t: Record<string, string> = { ...WA_DEFAULT_TEMPLATES };
      WA_ORDER_TEMPLATE_KEYS.forEach((k) => { if (typeof s?.[k.key] === "string" && s[k.key].trim()) t[k.key] = s[k.key]; });
      setTpl(t);
      if (s?.waAutoOpen && typeof s.waAutoOpen === "object") setAuto(s.waAutoOpen);
    }).catch((err: any) => { if (active) setLoadError(err.message || "Couldn't load WhatsApp messages"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const save = async () => {
    if (loading || loadError || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = { waAutoOpen: auto };
      WA_ORDER_TEMPLATE_KEYS.forEach((k) => { payload[k.key] = tpl[k.key]; });
      await saveSettingsPatch(payload);
      showToast("WhatsApp messages saved", "success");
    } catch (err: any) {
      showToast(err?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const sample = { id: "TDC0123", customerName: "Priya", total: 549, state: "Tamil Nadu", trackingId: "ST123456789", items: [{ selectedModel: "Apple - iPhone 15" }] };

  if (loading) return <p role="status" className="text-sm text-[#6d7175]">Loading WhatsApp messages...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={() => setReloadKey((key) => key + 1)} />;

  return (
    <div className="bg-white rounded-xl border border-[#e1e3e5] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-[#202223]">Order WhatsApp Messages</h3>
        <button type="button" className={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save messages"}</button>
      </div>
      <p className="text-[11px] text-[#6d7175] mb-3">
        Used by the WhatsApp button in Orders. Placeholders: <code>{"{name} {order} {models} {total} {tracking} {courier} {track_link} {review_link} {track_order} {store}"}</code>
      </p>
      <div className="space-y-2">
        {WA_ORDER_TEMPLATE_KEYS.map((k) => (
          <div key={k.key} className="border border-[#e1e3e5] rounded-xl">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpen((o) => (o === k.key ? "" : k.key))}
              onKeyDown={(e) => { if (e.key === "Enter") setOpen((o) => (o === k.key ? "" : k.key)); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left cursor-pointer"
            >
              <span className="text-sm font-semibold text-[#202223]">{k.label}</span>
              <span className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="text-[11px] text-[#6d7175]">Auto-open</span>
                <ToggleSwitch label={`Auto-open ${k.label} WhatsApp message`} checked={!!auto[k.status]} onChange={(v) => setAuto((a) => ({ ...a, [k.status]: v }))} />
              </span>
            </div>
            {open === k.key && (
              <div className="px-3 pb-3 grid lg:grid-cols-2 gap-3">
                <textarea
                  value={tpl[k.key]}
                  onChange={(e) => setTpl((t) => ({ ...t, [k.key]: e.target.value }))}
                  rows={7}
                  className={`${inputCls} font-mono text-xs`}
                />
                <div className="bg-[#e7fbe9] border border-[#c7eecb] rounded-xl p-3 text-xs text-[#1b3a1f] whitespace-pre-wrap">
                  <p className="text-[10px] font-bold uppercase text-[#0c8a3e] mb-1">Preview</p>
                  {fillOrderTemplate(tpl[k.key], { ...sample, status: k.status })}
                </div>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#6d7175] hover:text-[#202223] justify-self-start"
                  onClick={() => setTpl((t) => ({ ...t, [k.key]: WA_DEFAULT_TEMPLATES[k.key] }))}
                >
                  Reset to default
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#8c9196] mt-3">
        "Auto-open" = when you change an order to that status, a WhatsApp chat opens with the message ready — you just press Send.
        WhatsApp messages are sent from your own WhatsApp (there's no automatic sending without the paid WhatsApp Business API).
      </p>
    </div>
  );
}

function SettingsStaticInfoCard({ category }: { category: SettingsCategoryKey }) {
  const info = SETTINGS_STATIC_INFO[category];
  if (!info) return null;
  return (
    <div className={`${card} p-5`}>
      <p className="text-sm text-[#494c50] leading-relaxed">{info.blurb}</p>
      {info.rows && (
        <div className="mt-4 pt-4 border-t border-[#e1e3e5] space-y-2">
          {info.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-[#6d7175]">{r.label}</span>
              <span className="text-[#202223] font-semibold">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentSettingsPanel({
  form,
  settings,
  set,
  setAndSave,
  save,
  savingCount,
}: {
  form: any;
  settings: any;
  set: (k: string, v: any) => void;
  setAndSave: (k: string, v: any) => Promise<void>;
  save: () => Promise<void>;
  savingCount: number;
}) {
  const easebuzzEnabled = form.easebuzzEnabled === true;
  const manualUpiEnabled = form.manualUpiEnabled !== false;
  const upiId = form.manualUpiId ?? "325691127665359@cnrb";
  const payeeName = form.manualUpiPayeeName ?? "3D Case Makers";
  const screenshotEnabled = form.manualUpiScreenshotEnabled !== false;

  const [previewQr, setPreviewQr] = useState<string>("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Generate live sample QR code for ₹1,499 with the configured UPI ID
  useEffect(() => {
    let active = true;
    const sampleUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=1499.00&cu=INR&tn=SAMPLE-ORD-1001`;
    QRCode.toDataURL(sampleUri, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setPreviewQr(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [upiId, payeeName]);

  const handleCopyUpi = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(upiId);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  // Determine current active mode
  let activeCase: 1 | 2 | 3 | 4 = 2;
  if (easebuzzEnabled && !manualUpiEnabled) activeCase = 1;
  else if (!easebuzzEnabled && manualUpiEnabled) activeCase = 2;
  else if (easebuzzEnabled && manualUpiEnabled) activeCase = 3;
  else activeCase = 4;

  return (
    <div className="space-y-5">
      {/* Active Mode Status Banner */}
      <div
        className={`rounded-xl border p-4.5 ${
          activeCase === 2
            ? "bg-amber-50/70 border-amber-200"
            : activeCase === 1
            ? "bg-blue-50/70 border-blue-200"
            : activeCase === 3
            ? "bg-emerald-50/70 border-emerald-200"
            : "bg-red-50/70 border-red-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                activeCase === 2
                  ? "bg-amber-500/15 text-amber-800"
                  : activeCase === 1
                  ? "bg-blue-500/15 text-blue-800"
                  : activeCase === 3
                  ? "bg-emerald-500/15 text-emerald-800"
                  : "bg-red-500/15 text-red-800"
              }`}
            >
              <CreditCard size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6d7175]">
                  Current Checkout Mode
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    activeCase === 2
                      ? "bg-amber-200 text-amber-900"
                      : activeCase === 1
                      ? "bg-blue-200 text-blue-900"
                      : activeCase === 3
                      ? "bg-emerald-200 text-emerald-900"
                      : "bg-red-200 text-red-900"
                  }`}
                >
                  {activeCase === 2 && "CASE 2: Direct UPI Manual (Current Active)"}
                  {activeCase === 1 && "CASE 1: Easebuzz Gateway Only"}
                  {activeCase === 3 && "CASE 3: Both Enabled (Customer Choice)"}
                  {activeCase === 4 && "CASE 4: Payments Disabled"}
                </span>
              </div>
              <p className="text-xs text-[#202223] mt-1 font-medium leading-relaxed">
                {activeCase === 2 &&
                  "Customers checkout exclusively via Direct UPI Manual Verification. Orders are created as 'Awaiting Payment', and payments require manual verification by admin."}
                {activeCase === 1 &&
                  "Customers checkout exclusively via Easebuzz Payment Gateway (Cards, UPI, Net Banking). Orders are confirmed automatically upon payment."}
                {activeCase === 3 &&
                  "Customers can choose between 'Pay Online (Easebuzz)' and 'Direct UPI Payment' on the checkout page."}
                {activeCase === 4 &&
                  "Online payment is disabled on checkout. Customers are shown a friendly notice that online payment is temporarily unavailable."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. EASEBUZZ PAYMENT GATEWAY CARD */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2c6ecb]/10 text-[#2c6ecb] flex items-center justify-center shrink-0">
              <CreditCard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#202223]">Easebuzz Payment Gateway</h3>
                {easebuzzEnabled ? (
                  <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                    TEMPORARILY OFF
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6d7175] mt-0.5">
                Automated hosted gateway for Credit/Debit Cards, Net Banking, and Wallets.
              </p>
            </div>
          </div>
          <ToggleSwitch
            label="Enable Easebuzz Payment Gateway"
            checked={easebuzzEnabled}
            onChange={(v) => setAndSave("easebuzzEnabled", v)}
          />
        </div>

        <div className="pt-3 border-t border-[#e1e3e5] text-xs">
          {!easebuzzEnabled ? (
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1.5 text-zinc-700">
              <p className="font-semibold text-zinc-900 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" />
                Easebuzz is safely paused without damaging code or settings
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-zinc-600 pl-1">
                <li>Easebuzz is hidden from storefront checkout.</li>
                <li>No Easebuzz transactions will be initiated.</li>
                <li>All API keys (.env), callback routes, and historical payment records remain 100% intact.</li>
                <li>You can re-enable Easebuzz at any time by flipping the toggle above to ON.</li>
              </ul>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 text-xs">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                Easebuzz Gateway is currently LIVE for customers on checkout.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. DIRECT UPI MANUAL VERIFICATION CARD */}
      <div className={`${card} p-5 space-y-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-700 flex items-center justify-center shrink-0">
              <Smartphone size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#202223]">Direct UPI – Manual Verification</h3>
                {manualUpiEnabled ? (
                  <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                    DISABLED
                  </span>
                )}
              </div>
              <p className="text-xs text-[#6d7175] mt-0.5">
                Direct payments into your UPI bank account with automatic dynamic QR generation and admin UTR verification.
              </p>
            </div>
          </div>
          <ToggleSwitch
            label="Enable Direct UPI Manual Payment"
            checked={manualUpiEnabled}
            onChange={(v) => setAndSave("manualUpiEnabled", v)}
          />
        </div>

        {manualUpiEnabled && (
          <div className="space-y-4 pt-3 border-t border-[#e1e3e5]">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">
                  UPI ID (VPA) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => set("manualUpiId", e.target.value.trim())}
                    onBlur={save}
                    placeholder="325691127665359@cnrb"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="btn-liquid-dark px-3 rounded-lg text-xs font-semibold text-white shrink-0 flex items-center gap-1"
                  >
                    {copyFeedback ? <Check size={13} /> : <Copy size={13} />}
                    {copyFeedback ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-[#8c9196] mt-1">
                  Newly generated payment QR codes automatically embed this UPI ID. You can change this at any time.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#202223] block mb-1">
                  Payee / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={payeeName}
                  onChange={(e) => set("manualUpiPayeeName", e.target.value)}
                  onBlur={save}
                  placeholder="3D Case Makers"
                  className={inputCls}
                />
                <p className="text-[11px] text-[#8c9196] mt-1">
                  Name shown to the customer inside Google Pay, PhonePe, Paytm, or BHIM.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#e1e3e5]">
              <div>
                <p className="text-sm font-semibold text-[#202223]">Enable Payment Screenshot Upload</p>
                <p className="text-xs text-[#6d7175] mt-0.5">
                  Allows customers to upload an optional screenshot of their UPI confirmation alongside their Transaction ID / UTR.
                </p>
              </div>
              <ToggleSwitch
                label="Enable Payment Screenshot Upload"
                checked={screenshotEnabled}
                onChange={(v) => setAndSave("manualUpiScreenshotEnabled", v)}
              />
            </div>

            {/* Dynamic QR Notice & Live Preview */}
            <div className="bg-[#fafbfb] border border-[#e1e3e5] rounded-xl p-4 grid md:grid-cols-[1fr_auto] gap-4 items-center">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h4 className="text-xs font-bold text-[#202223] uppercase tracking-wide">
                    Automatic Dynamic QR Code System Active
                  </h4>
                </div>
                <p className="text-xs text-[#6d7175] leading-relaxed">
                  You do <span className="font-semibold text-[#202223]">NOT</span> need to manually upload a QR code image.
                  The application automatically renders an in-app dynamic QR code for every customer, embedding the exact server-calculated order amount and order reference.
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-[#494c50]">
                  <span className="font-semibold">Current Payee:</span>
                  <code className="bg-white px-2 py-0.5 rounded border border-[#e1e3e5] text-[#202223] font-mono text-[11px]">
                    {payeeName}
                  </code>
                  <span className="font-semibold ml-2">UPI ID:</span>
                  <code className="bg-white px-2 py-0.5 rounded border border-[#e1e3e5] text-[#202223] font-mono text-[11px]">
                    {upiId}
                  </code>
                </div>
              </div>

              {previewQr && (
                <div className="flex flex-col items-center bg-white p-2.5 rounded-lg border border-[#e1e3e5] shadow-sm">
                  <img src={previewQr} alt="Live QR Preview" className="w-28 h-28 object-contain" />
                  <span className="text-[10px] font-bold text-[#8c9196] mt-1">Live QR Preview (Sample ₹1,499)</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. FOUR PAYMENT CASES MATRIX */}
      <div className={`${card} p-5 space-y-3`}>
        <h3 className="text-sm font-bold text-[#202223]">Payment Methods Logic &amp; Behavior</h3>
        <p className="text-xs text-[#6d7175]">
          How the storefront checkout responds based on your payment settings toggles:
        </p>
        <div className="grid sm:grid-cols-2 gap-3 pt-1 text-xs">
          <div className={`p-3 rounded-lg border ${activeCase === 1 ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20" : "bg-white border-[#e1e3e5]"}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#202223]">CASE 1: Easebuzz ON, Direct UPI OFF</span>
              {activeCase === 1 && <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">Active</span>}
            </div>
            <p className="text-[#6d7175] mt-1">Storefront uses Easebuzz Hosted Checkout only. Direct UPI is hidden.</p>
          </div>

          <div className={`p-3 rounded-lg border ${activeCase === 2 ? "bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20" : "bg-white border-[#e1e3e5]"}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#202223]">CASE 2: Easebuzz OFF, Direct UPI ON</span>
              {activeCase === 2 && <span className="text-[10px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded">Current Active</span>}
            </div>
            <p className="text-[#6d7175] mt-1">Storefront routes directly to UPI QR &amp; Manual UTR verification. Easebuzz is safely hidden.</p>
          </div>

          <div className={`p-3 rounded-lg border ${activeCase === 3 ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20" : "bg-white border-[#e1e3e5]"}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#202223]">CASE 3: Easebuzz ON, Direct UPI ON</span>
              {activeCase === 3 && <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded">Active</span>}
            </div>
            <p className="text-[#6d7175] mt-1">Customers choose their preferred method at checkout: Online (Easebuzz) or Direct UPI.</p>
          </div>

          <div className={`p-3 rounded-lg border ${activeCase === 4 ? "bg-red-50/70 border-red-300 ring-2 ring-red-500/20" : "bg-white border-[#e1e3e5]"}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#202223]">CASE 4: Both OFF</span>
              {activeCase === 4 && <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">Active</span>}
            </div>
            <p className="text-[#6d7175] mt-1">Checkout shows friendly alert: "Online payment is temporarily unavailable. Please try again later."</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState<any>({});
  const [savedMsg, setSavedMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savingCount, setSavingCount] = useState(0);
  const formRef = useRef<Record<string, any>>({});
  const savedRef = useRef<Record<string, any>>({});
  const pendingPatchesRef = useRef<Record<string, any>[]>([]);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [category, setCategory] = useState<SettingsCategoryKey>("General");
  const [navSearch, setNavSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      formRef.current = s || {};
      savedRef.current = s || {};
      pendingPatchesRef.current = [];
      setSettings(s || {});
      setForm(s || {});
    } catch (err: any) {
      setLoadError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const set = (key: string, value: any) => {
    formRef.current = { ...formRef.current, [key]: value };
    setForm(formRef.current);
    setSavedMsg(false);
  };

  const flashSaved = () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSavedMsg(true);
    savedTimer.current = setTimeout(() => setSavedMsg(false), 2000);
  };

  const save = async () => {
    if (loading || loadError) return;
    // Compare against both acknowledged and queued changes. A quick true →
    // false switch must enqueue false even while true has not finished saving.
    const patch = settingsChanges(savedRef.current, formRef.current, pendingPatchesRef.current);
    if (!Object.keys(patch).length) return;
    pendingPatchesRef.current.push(patch);
    setSavingCount((count) => count + 1);
    setSaveError("");
    try {
      await saveSettingsPatch(patch);
      savedRef.current = { ...savedRef.current, ...patch };
      setSettings(savedRef.current);
      if (!Object.keys(settingsChanges(savedRef.current, formRef.current)).length) flashSaved();
    } catch (err: any) {
      const message = err.message || "Couldn't save settings. Your changes are still here; try again.";
      setSavedMsg(false);
      setSaveError(message);
      showToast(message, "error");
    } finally {
      pendingPatchesRef.current = pendingPatchesRef.current.filter((pending) => pending !== patch);
      setSavingCount((count) => Math.max(0, count - 1));
    }
  };

  // Save immediately on toggle flip (no need to hit a separate Save button for on/off switches)
  const setAndSave = async (key: string, value: any) => {
    set(key, value);
    await save();
  };

  const filteredNav = SETTINGS_NAV.filter((n) => n.key.toLowerCase().includes(navSearch.trim().toLowerCase()));

  if (loading) return <p className="text-sm text-[#6d7175]" role="status">Loading settings...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  return (
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
      {/* Settings sub-sidebar — mirrors Shopify's Settings category list */}
      <div className={`${card} p-3 lg:sticky lg:top-20 min-w-0`}>
        <div className="flex items-center gap-2 px-1 pb-3">
          <div className="w-7 h-7 rounded-md bg-[#0c8a3e] text-white flex items-center justify-center text-[11px] font-black shrink-0">3CM</div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#202223] truncate">3D Case Makers</p>
            <p className="text-[10px] text-[#8c9196] truncate">{window.location.hostname}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-2.5 py-1.5 mb-2">
          <Search size={13} className="text-[#8c9196] shrink-0" />
          <input
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Search settings"
            className="flex-1 min-w-0 bg-transparent outline-none text-xs text-[#202223] placeholder:text-[#8c9196]"
          />
        </div>
        <nav className="space-y-0.5 max-h-[70vh] overflow-y-auto">
          {filteredNav.map((n) => {
            const Icon = n.icon;
            const activeCat = category === n.key;
            return (
              <button type="button"
                key={n.key}
                onClick={() => setCategory(n.key)}
                className={`w-full flex items-center gap-2 text-left text-xs font-semibold px-2.5 py-2 rounded-lg transition-colors ${activeCat ? "bg-[#f1f2f3] text-[#202223]" : "text-[#494c50] hover:bg-[#f6f6f7]"}`}
              >
                <Icon size={14} className="shrink-0 text-[#6d7175]" /> <span className="truncate">{n.key}</span>
              </button>
            );
          })}
          {filteredNav.length === 0 && <p className="text-[11px] text-[#8c9196] px-2.5 py-2">No matching settings.</p>}
        </nav>
      </div>

      {/* Detail panel */}
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[#202223] flex items-center gap-2 min-w-0">
            {(() => { const Icon = SETTINGS_NAV.find((n) => n.key === category)?.icon || Store; return <Icon size={18} />; })()}
            {category}
          </h2>
          <div className="flex items-center gap-2" aria-live="polite">
            {savingCount > 0 ? <span className="text-xs text-[#6d7175]">Saving...</span> : savedMsg ? <span className="text-xs text-green-600 font-semibold">Saved ✓</span> : null}
            <button type="button" className={btnPrimary} onClick={save} disabled={savingCount > 0 || !Object.keys(settingsChanges(settings, form)).length}>Save changes</button>
          </div>
        </div>
        {saveError && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{saveError}</p>}

        {category === "General" && (
          <>
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#202223]">Maintenance Mode</h3>
                  <p className="text-xs text-[#6d7175] mt-1">
                    {form.maintenanceMode
                      ? "Storefront is currently showing the maintenance page to visitors. Admin panel stays accessible."
                      : "Storefront is live. Turn this on to take the site offline for visitors while you make changes."}
                  </p>
                </div>
                <ToggleSwitch label="Maintenance mode" checked={!!form.maintenanceMode} onChange={(v) => setAndSave("maintenanceMode", v)} />
              </div>
              {form.maintenanceMode && (
                <div className="mt-4 pt-4 border-t border-[#e1e3e5]">
                  <label className="text-xs text-[#6d7175] block mb-1 font-medium">Maintenance Page Message</label>
                  <textarea
                    value={form.maintenanceMessage || ""}
                    onChange={(e) => set("maintenanceMessage", e.target.value)}
                    onBlur={save}
                    rows={2}
                    className={inputCls}
                    placeholder="We're upgrading 3DCaseMakers right now. Back shortly — thanks for your patience!"
                  />
                </div>
              )}
            </div>

            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-[#202223] mb-1">Store details</h3>
              <p className="text-xs text-[#6d7175] mb-4">Read-only snapshot — edit these from Content → Branding / Social &amp; Chat / SEO Tools.</p>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <OverviewRow label="Store Name / Logo Text" value={settings.logoText || "3DCaseMakers"} />
                <OverviewRow label="Tagline" value={settings.tagline || "—"} />
                <OverviewRow label="Contact Phone" value={settings.contactPhone || "—"} />
                <OverviewRow label="Contact Email" value={settings.contactEmail || "—"} />
                <OverviewRow label="WhatsApp Number" value={settings.whatsappNumber || "—"} />
                <OverviewRow label="Instagram" value={settings.instagramUrl || "—"} />
                <OverviewRow label="Facebook" value={settings.facebookUrl || "—"} />
                <OverviewRow label="Currency display" value="Indian Rupee (INR ₹)" />
              </div>
            </div>
          </>
        )}

        {category === "Payments" && (
          <PaymentSettingsPanel
            form={form}
            settings={settings}
            set={set}
            setAndSave={setAndSave}
            save={save}
            savingCount={savingCount}
          />
        )}

        {category === "Notifications" && (
          <div className="space-y-4">
            <OrderWhatsAppTemplatesCard />
            <AbandonedWhatsAppTemplatesCard form={form} set={set} save={save} />
          </div>
        )}

        {category === "Checkout" && (
          <div className={`${card} p-5 space-y-4`}>
            <h3 className="text-sm font-bold text-[#202223]">Website Widgets</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#202223]">Floating WhatsApp Button</p>
                <p className="text-xs text-[#6d7175] mt-0.5">Show the floating WhatsApp chat button on Home, Product, Collections, About &amp; Contact pages.</p>
              </div>
              <ToggleSwitch label="Floating WhatsApp button" checked={form.whatsappFloatingEnabled !== false} onChange={(v) => setAndSave("whatsappFloatingEnabled", v)} />
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-[#e1e3e5]">
              <div>
                <p className="text-sm font-medium text-[#202223]">Announcement Bar</p>
                <p className="text-xs text-[#6d7175] mt-0.5">Scrolling announcement strip directly under the nav bar.</p>
              </div>
              <ToggleSwitch label="Announcement bar" checked={form.announcementBarEnabled !== false} onChange={(v) => setAndSave("announcementBarEnabled", v)} />
            </div>
            {form.announcementBarEnabled !== false && (
              <>
                <AnnouncementMessagesEditor
                  messages={Array.isArray(form.announcementMessages) ? form.announcementMessages : [
                    "Secure Online Payments (UPI / Cards / Net Banking)",
                    "Free Shipping Across Tamil Nadu",
                    "50,000+ Happy Customers",
                    "Premium Quality Guaranteed",
                  ]}
                  onChange={(next) => set("announcementMessages", next)}
                  onSave={save}
                />
                <div className="pt-4 border-t border-[#e1e3e5]">
                  <p className="text-xs font-bold text-[#202223] mb-2">Scroll Speed</p>
                  <div className="w-fit">
                    <LiquidPillGroup
                      options={[
                        { key: "slow", label: "Slow" },
                        { key: "normal", label: "Normal" },
                        { key: "fast", label: "Fast" },
                      ]}
                      value={(form.announcementSpeed || "normal") as "slow" | "normal" | "fast"}
                      onChange={(v) => setAndSave("announcementSpeed", v)}
                      size="sm"
                    />
                  </div>
                  <p className="text-[11px] text-[#8c9196] mt-2">How fast the strip scrolls under the nav bar.</p>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-4 border-t border-[#e1e3e5]">
              <div>
                <p className="text-sm font-medium text-[#202223]">Trust Bar (Cart &amp; Checkout)</p>
                <p className="text-xs text-[#6d7175] mt-0.5">Scrolling trust strip shown only on the Cart and Checkout pages, right before customers pay.</p>
              </div>
              <ToggleSwitch label="Cart and checkout trust bar" checked={form.trustBarEnabled !== false} onChange={(v) => setAndSave("trustBarEnabled", v)} />
            </div>
            {form.trustBarEnabled !== false && (
              <AnnouncementMessagesEditor
                messages={Array.isArray(form.trustBarMessages) ? form.trustBarMessages : [
                  "Serving Customers Since 2018 💗",
                  "📸 59K+ Instagram Followers",
                  "❤️ 50,000+ Happy Customers",
                  "📍 Based in Tamil Nadu Serving All India",
                  "🚚 All India Fast Delivery",
                ]}
                onChange={(next) => set("trustBarMessages", next)}
                onSave={save}
              />
            )}
          </div>
        )}

        {category === "Shipping and delivery" && (
          <>
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-[#202223] mb-1">Shipping by state</h3>
              <p className="text-xs text-[#6d7175] mb-4">Read-only snapshot — edit these from Content → Store Config.</p>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <OverviewRow label="Shipping Zones" value={settings.shippingZones?.length ? `${settings.shippingZones.length} zones configured` : "6 default zones (TN/Pondy free, ₹99–₹149 by zone)"} />
              </div>
            </div>
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-bold text-[#202223] mb-1">Serviceable pincodes</h3>
              <ServiceabilityTab />
            </div>
          </>
        )}

        {category === "Sales channels" && (
          <div className={`${card} p-5 space-y-4`}>
            <div>
              <h3 className="text-sm font-bold text-[#202223]">SEO &amp; Google Shopping Feed</h3>
              <p className="text-xs text-[#6d7175] mt-1">
                Every product and collection has an editable SEO title/description (from the Products and Collections tabs), and the site outputs structured data so Google can show rich results.
                Use the feed below to list products on Google Shopping via Merchant Center.
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-[#202223] block mb-1">Merchant Center Feed URL (Scheduled fetch)</label>
              <div className="flex gap-2">
                <input readOnly value={`${API_URL}/api/merchant-feed.xml`} className={`${inputCls} bg-[#f6f6f7]`} onFocus={(e) => e.target.select()} />
                <button
                  onClick={() => { navigator.clipboard?.writeText(`${API_URL}/api/merchant-feed.xml`); }}
                  className={btnGhost}
                  type="button"
                >
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-[#8c9196] mt-1">
                In Merchant Center: Products → Feeds → Add feed → Google Sheets/Scheduled fetch → paste this URL. It updates automatically as products change — no re-upload needed.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <a href={`${API_URL}/api/merchant-feed.csv`} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                Download CSV Feed
              </a>
              <a href={`${API_URL}/api/merchant-feed.xml`} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                View XML Feed
              </a>
            </div>
          </div>
        )}

        {category === "Domains" && (
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-3">Domain</h3>
            <div className="flex items-center justify-between border border-[#e1e3e5] rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm text-[#202223] font-medium">
                <Globe size={15} className="text-[#6d7175]" />
                {typeof window !== "undefined" ? window.location.hostname : "3dcasemakers.in"}
              </div>
              <span className="text-[11px] font-bold text-[#0c8a3e] bg-[#e3f5ea] px-2 py-0.5 rounded-full">Connected</span>
            </div>
            <p className="text-[11px] text-[#8c9196] mt-3">Domain and SSL are managed directly with the hosting provider — see HOSTINGER_DEPLOY.md — rather than through Shopify Domains.</p>
          </div>
        )}

        {category === "Policies" && (
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-[#202223] mb-1">Policies</h3>
            <p className="text-xs text-[#6d7175] mb-4">These are fixed content pages built into the storefront rather than editable settings — updating the wording requires a developer edit to PolicyPage.tsx.</p>
            <div className="divide-y divide-[#f1f1f1]">
              {[
                { label: "Shipping Policy", href: "/policy/shipping" },
                { label: "Privacy Policy", href: "/policy/privacy" },
                { label: "Terms of Service", href: "/policy/terms" },
                { label: "Returns & Refunds", href: "/policy/returns" },
              ].map((p) => (
                <a key={p.href} href={p.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-2.5 text-sm text-[#202223] hover:text-blue-600">
                  <span>{p.label}</span>
                  <ChevronRight size={15} className="text-[#8c9196]" />
                </a>
              ))}
            </div>
          </div>
        )}

        <SettingsStaticInfoCard category={category} />
      </div>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f1f1f1] pb-2">
      <span className="text-[#6d7175] text-xs font-medium">{label}</span>
      <span className="text-[#202223] font-semibold text-xs truncate max-w-[55%] text-right">{value}</span>
    </div>
  );
}

// ---------------- Discounts (Offers) ----------------
// Manages settings.offers[] — each is a "Buy X qty, get ₹Y off" automatic
// discount. The enabled offer with the highest discount the cart qualifies
// for is applied automatically at Cart/Checkout (no code needed). The same
// list also drives the storefront countdown bar (the first live offer that
// has an end date). Coupon codes are a separate, currently-disabled input on
// the Checkout page — not managed here.
// Bridge for the shared header's "Create discount" button (mirrors productsTabActions).
const discountsTabActions: { addOffer: (() => void) | null } = { addOffer: null };

function DiscountsTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pendingSaves, setPendingSaves] = useState(0);
  const saving = pendingSaves > 0;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const offersRef = useRef<Offer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      const existing = Array.isArray(s?.offers) ? s.offers : defaultOffers();
      offersRef.current = existing;
      setOffers(existing);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load discounts");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (next: Offer[]) => {
    if (loading || loadError) return;
    if (next.some((offer) => !Number.isInteger(offer.minQty) || offer.minQty < 1 || !Number.isFinite(offer.discountAmount) || offer.discountAmount < 0)) {
      setSaveError("Use a whole minimum quantity of at least 1 and a valid non-negative discount amount.");
      return;
    }
    offersRef.current = next;
    setOffers(next);
    setPendingSaves((count) => count + 1);
    setSaveError("");
    try {
      await saveSettingsPatch({ offers: next });
      setSettings((s: any) => ({ ...s, offers: next }));
      showToast("Discounts saved", "success");
    } catch (err: any) {
      const message = err.message || "Couldn't save discounts. Your changes are still here; try again.";
      setSaveError(message);
      showToast(message, "error");
    } finally {
      setPendingSaves((count) => Math.max(0, count - 1));
    }
  };

  const updateOffer = (id: string, patch: Partial<Offer>) => {
    offersRef.current = offersRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setOffers(offersRef.current);
  };

  const toggleOffer = (id: string, enabled: boolean) => {
    const next = offersRef.current.map((o) => (o.id === id ? { ...o, enabled } : o));
    save(next);
  };

  const restartOffer = (id: string, hours: number) => {
    const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const next = offersRef.current.map((o) => (o.id === id ? { ...o, endsAt } : o));
    save(next);
  };

  const addOffer = () => {
    const id = `offer_${Date.now()}`;
    const next: Offer[] = [
      ...offersRef.current,
      { id, label: "New Offer", badgeText: "New Offer", minQty: 2, discountAmount: 50, enabled: false, endsAt: null },
    ];
    save(next);
    setExpanded(id);
  };

  const removeOffer = (id: string) => {
    save(offersRef.current.filter((o) => o.id !== id));
  };

  useEffect(() => {
    discountsTabActions.addOffer = addOffer;
    return () => { discountsTabActions.addOffer = null; };
  });

  if (loading) return <p role="status" className="text-sm text-[#6d7175]">Loading discounts...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;
  const filteredOffers = offers.filter((offer) => `${offer.label} ${offer.badgeText}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      {saveError && <div className="mb-3"><AdminLoadError message={saveError} retry={() => save(offersRef.current)} /></div>}
      <div className="bg-white border border-[#e1e3e5] rounded-t-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="shrink-0 px-2.5 py-1.5 text-sm font-semibold text-[#202223]">All</span>
        <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-[#f1f2f3] rounded-lg px-3 py-1.5">
          <Search size={14} className="text-[#8c9196] shrink-0" />
          <input aria-label="Search discounts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search discounts" className="flex-1 min-w-0 w-full bg-transparent outline-none text-sm text-[#202223] placeholder:text-[#8c9196]" />
        </div>

      </div>

      <div className="bg-white border border-t-0 border-[#e1e3e5] rounded-b-xl overflow-x-auto">
        {filteredOffers.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6d7175]">{offers.length === 0 ? 'No offers yet — click "Create discount" to add one.' : "No discounts match your search."}</div>
        ) : (
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>

                <th className={thCls}>Title</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Method</th>
                <th className={thCls}>Eligibility</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Used</th>
              </tr>
            </thead>
            <tbody>
              {filteredOffers.map((offer) => {
                const isOpen = expanded === offer.id;
                const isLive = offer.enabled && (!offer.endsAt || new Date(offer.endsAt).getTime() > Date.now());
                return (
                  <FragmentRow key={offer.id}>
                    <tr className={trHover} onClick={() => setExpanded(isOpen ? null : offer.id)}>

                      <td className={tdCls}>
                        <p className="font-semibold text-[#202223]">{offer.label || "Untitled Offer"}</p>
                        <p className="text-xs text-[#8c9196] font-normal">
                          ₹{offer.discountAmount}.00 off · Minimum quantity of {offer.minQty} · Applies once per order
                        </p>
                      </td>
                      <td className={tdCls}><span className={statusPill(isLive ? "success" : "neutral")}>{isLive ? "Active" : "Inactive"}</span></td>
                      <td className={tdCls}>Automatic</td>
                      <td className={tdCls}>
                        <span className="inline-flex items-center gap-1.5"><Users size={13} className="text-[#8c9196]" /> All customers</span>
                      </td>
                      <td className={tdCls}>Amount off order</td>
                      <td className={tdCls}>—</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-[#f1f2f3]">
                          <div className="p-4 bg-[#fafbfb]">
                            <OfferCard
                              offer={offer}
                              saving={saving}
                              onFieldChange={(patch) => updateOffer(offer.id, patch)}
                              onSave={() => save(offersRef.current)}
                              onToggle={(v) => toggleOffer(offer.id, v)}
                              onRestart={(hours) => restartOffer(offer.id, hours)}
                              onRemove={() => removeOffer(offer.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={`${card} p-5 mt-4`}>
        <h3 className="text-sm font-bold text-[#202223] mb-1">Coupon Codes</h3>
        <p className="text-xs text-[#6d7175]">
          The manual coupon-code field on Checkout is temporarily disabled (greyed out) while these automatic offers are the active discount mechanism.
        </p>
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  saving,
  onFieldChange,
  onSave,
  onToggle,
  onRestart,
  onRemove,
}: {
  offer: Offer;
  saving: boolean;
  onFieldChange: (patch: Partial<Offer>) => void;
  onSave: () => void;
  onToggle: (v: boolean) => void;
  onRestart: (hours: number) => void;
  onRemove: () => void;
}) {
  const [restartHours, setRestartHours] = useState(48);
  const isLive = offer.enabled && (!offer.endsAt || new Date(offer.endsAt).getTime() > Date.now());
  const isExpired = offer.enabled && !!offer.endsAt && new Date(offer.endsAt).getTime() <= Date.now();

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#202223] flex items-center gap-1.5 truncate">
            <Zap size={15} className="text-blue-500 shrink-0" /> {offer.label || "Untitled Offer"}
          </h3>
          <p className="text-xs text-[#6d7175] mt-1">
            {!offer.enabled ? "Off — not applied to any cart." : isExpired ? "Enabled, but its timer ran out — restart below." : "Live — applies automatically when a cart qualifies."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isLive && <span className="text-[10px] font-black uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Live</span>}
          <ToggleSwitch label={`Enable ${offer.label || "discount"}`} checked={!!offer.enabled} onChange={onToggle} />
          <button onClick={onRemove} className="text-zinc-400 hover:text-rose-500 p-1.5 hover:bg-rose-50 rounded-lg" type="button" aria-label="Remove offer">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-[#e1e3e5] space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Internal Name</label>
            <input value={offer.label} onChange={(e) => onFieldChange({ label: e.target.value })} onBlur={onSave} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Badge Text (shown to customers)</label>
            <input value={offer.badgeText} onChange={(e) => onFieldChange({ badgeText: e.target.value })} onBlur={onSave} placeholder="Buy 2 & Get ₹100 OFF" className={inputCls} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Minimum Quantity in Cart</label>
            <input type="number" min={1} value={offer.minQty} onChange={(e) => onFieldChange({ minQty: Number(e.target.value) || 1 })} onBlur={onSave} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Discount Amount (₹)</label>
            <input type="number" min={0} value={offer.discountAmount} onChange={(e) => onFieldChange({ discountAmount: Number(e.target.value) || 0 })} onBlur={onSave} className={inputCls} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-[#202223] block mb-1">Offer Ends At (optional)</label>
            <input
              type="datetime-local"
              value={offer.endsAt ? toDatetimeLocal(offer.endsAt) : ""}
              onChange={(e) => onFieldChange({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              onBlur={onSave}
              className={inputCls}
            />
            <p className="text-[11px] text-[#8c9196] mt-1">Leave empty for an always-on offer (no countdown shown).</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={restartHours} onChange={(e) => setRestartHours(Number(e.target.value) || 1)} className={`${inputCls} w-20`} />
            <button onClick={() => onRestart(restartHours)} disabled={saving} className={`${btnGhost} inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap`} type="button">
              <RefreshCw size={13} /> Restart ({restartHours}h)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time
function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function ThemesTab() {
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const load = async () => {
    const s = await api.getAuth("/api/settings/admin");
    setSettings(s || {});
    setForm(s || {});
  };
  useEffect(() => { load(); }, []);

  // Live-preview every change instantly across the open admin tab too, the
  // same way the storefront will update once saved.
  useEffect(() => { applyTheme(form); }, [form]);
  // Restore whatever the storefront/site actually has saved if this tab unmounts.
  useEffect(() => () => { applyTheme(settings); }, [settings]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const { showToast } = useToast();
  const save = async () => {
    setSaving(true);
    try {
      await saveChangedSettings(settings, { ...settings, ...form });
      setSettings((s: any) => ({ ...s, ...form }));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
      showToast("Theme saved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save theme", "error");
    } finally {
      setSaving(false);
    }
  };

  const card = "bg-white rounded-xl border border-[#e1e3e5]";
  const inputCls = "w-full border border-[#c9cccf] rounded-lg px-3 py-2 text-sm text-[#202223] focus:outline-none focus:ring-2 focus:ring-[#202223]/10 focus:border-[#8c9196]";
  const btnPrimary = "btn-liquid-dark text-white text-sm font-bold px-4 py-2 rounded-lg";

  const fontOptions: { key: string; label: string; family: string }[] = [
    { key: "default", label: "Default (DM Sans)", family: '"DM Sans", sans-serif' },
    { key: "dmsans", label: "DM Sans (matches 3dcasemakers.com)", family: '"DM Sans", sans-serif' },
    { key: "inter", label: "Inter", family: '"Inter", sans-serif' },
    { key: "baloo", label: "Baloo 2 (rounded, playful)", family: '"Baloo 2", sans-serif' },
    { key: "coolvetica", label: "Coolvetica (display/condensed)", family: '"Coolvetica", sans-serif' },
    { key: "jost", label: "Jost (geometric)", family: '"Jost", sans-serif' },
  ];
  const sizeOptions: { key: string; label: string }[] = [
    { key: "sm", label: "Small" },
    { key: "md", label: "Medium (default)" },
    { key: "lg", label: "Large" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#6d7175] mt-0.5">
            Customize how the storefront looks — colors, fonts and the mobile bottom menu.
            Changes preview live below and apply site-wide once saved.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>}
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? "Saving..." : "Save Theme"}
          </button>
        </div>
      </div>

      {/* Brand color */}
      <div className={`${card} p-5 space-y-4`}>
        <div>
          <h3 className="text-sm font-bold text-[#202223]">Brand Color</h3>
          <p className="text-xs text-[#6d7175] mt-1">
            Colors "Buy Now" / primary buttons, links, badges and highlights across the whole storefront.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.themePrimaryColor || "#2563eb"}
              onChange={(e) => set("themePrimaryColor", e.target.value)}
              className="w-12 h-12 rounded-lg border border-[#e1e3e5] cursor-pointer p-1 bg-white"
              aria-label="Pick brand color"
            />
            <input
              type="text"
              value={form.themePrimaryColor || "#2563eb"}
              onChange={(e) => set("themePrimaryColor", e.target.value)}
              placeholder="#2563eb"
              maxLength={7}
              className={`${inputCls} w-32 font-mono uppercase`}
            />
          </div>
          <div className="flex items-center gap-2">
            {["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0f172a", "#db2777"].map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => set("themePrimaryColor", hex)}
                className={`w-7 h-7 rounded-full border-2 ${form.themePrimaryColor === hex ? "border-[#202223] scale-110" : "border-white"} shadow-sm transition-transform`}
                style={{ background: hex }}
                aria-label={`Use ${hex}`}
              />
            ))}
          </div>
          <button type="button" onClick={() => set("themePrimaryColor", "")} className="text-xs font-semibold text-[#6d7175] hover:text-[#202223] hover:underline">
            Reset
          </button>
        </div>
      </div>

      {/* Button shape */}
      <div className={`${card} p-5 space-y-4`}>
        <h3 className="text-sm font-bold text-[#202223]">Button Shape</h3>
        <p className="text-[11px] text-[#6d7175] -mt-2">All buttons use consistent 12px soft corners, including Buy Now, Add to Cart, navigation, icons and admin actions.</p>
        <span className="glass-btn-primary inline-block text-white font-bold text-xs px-4 py-2">Buy Now</span>
      </div>

      {/* Font */}
      <div className={`${card} p-5 space-y-4`}>
        <h3 className="text-sm font-bold text-[#202223]">Font</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fontOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set("themeFont", opt.key)}
              className={`text-left px-4 py-3 border-2 ${(form.themeFont || "default") === opt.key ? "border-[#202223]" : "border-[#e1e3e5]"} rounded-xl`}
            >
              <div className="text-base font-bold text-[#202223]" style={{ fontFamily: opt.family }}>3DCaseMakers</div>
              <div className="text-[11px] text-[#6d7175] mt-0.5">{opt.label}</div>
            </button>
          ))}
        </div>

        <div className="pt-2 border-t border-[#e1e3e5]">
          <h4 className="text-xs font-bold text-[#202223] mb-2">Text Size</h4>
          <div className="flex gap-2">
            {sizeOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => set("themeFontSize", opt.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border-2 ${(form.themeFontSize || "md") === opt.key ? "border-[#202223] bg-[#202223] text-white" : "border-[#e1e3e5] text-[#202223]"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page transition */}
      <div className={`${card} p-5 space-y-4`}>
        <div>
          <h3 className="text-sm font-bold text-[#202223]">Page Transition</h3>
          <p className="text-xs text-[#6d7175] mt-1">
            Animation played on the storefront whenever a visitor navigates from one page to another
            (clicking a product, collection, or menu link).
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {PAGE_TRANSITIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set("pageTransition", opt.key)}
              className={`text-left px-3.5 py-2.5 border-2 rounded-xl text-xs font-semibold ${
                (form.pageTransition || "slide-up") === opt.key ? "border-[#202223] bg-[#f6f6f7] text-[#202223]" : "border-[#e1e3e5] text-[#6d7175] hover:border-[#c9cccf]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className={`${card} p-5 space-y-4`}>
        <div>
          <h3 className="text-sm font-bold text-[#202223]">Mobile Bottom Menu</h3>
          <p className="text-xs text-[#6d7175] mt-1">Colors for the Home / Collections / Cart / Reviews / Menu bar shown on phones.</p>
        </div>
        <div className="flex flex-wrap gap-6">
          {[
            { key: "themeMobileNavBg", label: "Background", def: "#000000" },
            { key: "themeMobileNavText", label: "Inactive icon/text", def: "#a1a1aa" },
            { key: "themeMobileNavActive", label: "Active icon/text", def: "#2563eb" },
          ].map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                type="color"
                value={form[row.key] || row.def}
                onChange={(e) => set(row.key, e.target.value)}
                className="w-10 h-10 rounded-lg border border-[#e1e3e5] cursor-pointer p-1 bg-white"
                aria-label={row.label}
              />
              <span className="text-xs font-semibold text-[#202223]">{row.label}</span>
            </div>
          ))}
        </div>

        {/* Live preview of the bar itself */}
        <div
          className="flex items-stretch rounded-xl overflow-hidden border border-[#e1e3e5] max-w-sm"
          style={{ background: form.themeMobileNavBg || "#000000" }}
        >
          {[
            { label: "Home", active: true },
            { label: "Collections", active: false },
            { label: "Cart", active: false },
            { label: "Reviews", active: false },
            { label: "Menu", active: false },
          ].map((tab) => (
            <div key={tab.label} className="flex-1 flex flex-col items-center justify-center gap-1 py-3">
              <span
                className="w-4 h-4 rounded-full"
                style={{ background: tab.active ? (form.themeMobileNavActive || "#2563eb") : (form.themeMobileNavText || "#a1a1aa") }}
              />
              <span
                className="text-[9px] font-bold"
                style={{ color: tab.active ? (form.themeMobileNavActive || "#2563eb") : (form.themeMobileNavText || "#a1a1aa") }}
              >
                {tab.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
          {saving ? "Saving..." : "Save Theme"}
        </button>
      </div>
    </div>
  );
}

function RefreshCwIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

// ---------------- FAQs (feature 7 admin side) ----------------
const FAQ_CATEGORIES = [
  "About 3DCaseMakers",
  "Product Customization",
  "How to Place Order?",
  "Payment and Security",
  "Shipping and Delivery",
  "Cancellation and Returns",
  "Coupons and Offers",
];

function FAQsTab() {
  const { showToast } = useToast();
  const [faqs, setFaqs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [subTab, setSubTab] = useState<"questions" | "categories">("questions");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  // Category manager state
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);

  const load = async () => {
    const f: any[] = await api.getAuth("/api/faqs/all");
    setFaqs([...f].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
  };
  useEffect(() => {
    load();
    try {
      const stored = localStorage.getItem("3dcasemakers_faq_custom_categories");
      if (stored) setCustomCategories(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Full category list = built-in defaults + any custom ones created in the admin,
  // plus any category names already used on existing FAQs (covers renames done elsewhere).
  const allCategories = Array.from(new Set([
    ...FAQ_CATEGORIES,
    ...customCategories,
    ...faqs.map((f) => f.category).filter(Boolean),
  ]));

  const persistCustomCategories = (next: string[]) => {
    setCustomCategories(next);
    localStorage.setItem("3dcasemakers_faq_custom_categories", JSON.stringify(next));
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (allCategories.includes(name)) {
      showToast("That category already exists", "error");
      return;
    }
    persistCustomCategories([...customCategories, name]);
    setNewCategoryName("");
    showToast("Category added", "success");
  };

  // Renames a category everywhere: updates every FAQ currently tagged with the old
  // name (so existing Q/A move over automatically) and swaps the name in the list.
  const renameCategory = async (oldName: string) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingCategory(null); return; }
    if (allCategories.includes(newName)) {
      showToast("A category with that name already exists", "error");
      return;
    }
    setCategoryBusy(true);
    try {
      const affected = faqs.filter((f) => (f.category || FAQ_CATEGORIES[0]) === oldName);
      await Promise.all(affected.map((f) => api.put(`/api/faqs/${f.id}`, { ...f, category: newName })));
      persistCustomCategories(customCategories.map((c) => (c === oldName ? newName : c)));
      await load();
      showToast(`Renamed "${oldName}" to "${newName}"`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to rename category", "error");
    } finally {
      setCategoryBusy(false);
      setRenamingCategory(null);
      setRenameValue("");
    }
  };

  // Deletes a category. FAQs still tagged with it fall back to the default category
  // rather than disappearing, so nothing is silently lost.
  const deleteCategory = async (name: string) => {
    const affected = faqs.filter((f) => (f.category || FAQ_CATEGORIES[0]) === name);
    const msg = affected.length
      ? `Delete "${name}"? ${affected.length} FAQ(s) using it will move to "${FAQ_CATEGORIES[0]}".`
      : `Delete "${name}"?`;
    if (!confirm(msg)) return;
    setCategoryBusy(true);
    try {
      await Promise.all(affected.map((f) => api.put(`/api/faqs/${f.id}`, { ...f, category: FAQ_CATEGORIES[0] })));
      persistCustomCategories(customCategories.filter((c) => c !== name));
      await load();
      showToast("Category deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete category", "error");
    } finally {
      setCategoryBusy(false);
    }
  };

  const saveFaqOrder = async (next: any[]) => {
    setFaqs(next);
    setReorderBusy(true);
    try {
      await Promise.all(next.map((f, i) => api.put(`/api/faqs/${f.id}`, { ...f, displayOrder: i })));
      setFaqs(next.map((f, i) => ({ ...f, displayOrder: i })));
      showToast("FAQ order updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update FAQ order", "error");
    } finally {
      setReorderBusy(false);
    }
  };

  const save = async () => {
    if (!editing || !editing.question || !editing.answer) return;
    setSaving(true);
    try {
      if (editing.id) await api.put(`/api/faqs/${editing.id}`, editing);
      else await api.post("/api/faqs", editing, true);
      setEditing(null);
      await load();
      showToast("FAQ saved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save FAQ", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await api.del(`/api/faqs/${id}`);
    load();
  };

  const visibleFaqs = filterCategory === "All" ? faqs : faqs.filter((f) => (f.category || FAQ_CATEGORIES[0]) === filterCategory);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Manage the questions, answers and categories shown on the storefront FAQ page</p>
      </div>
      {/* Sub-nav: Q&A list vs Category manager */}
      <div className="flex items-center gap-1 mb-1 bg-[#f1f1f1] p-1 rounded-lg w-fit">
        {(["questions", "categories"] as const).map((s) => (
          <button type="button"
            key={s}
            onClick={() => setSubTab(s)}
            className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${subTab === s ? "bg-white text-[#202223] shadow-sm" : "text-[#6d7175] hover:text-[#202223]"}`}
          >
            {s === "questions" ? "Questions & Answers" : "Categories"}
          </button>
        ))}
      </div>

      {subTab === "categories" ? (
        <div className="space-y-5 max-w-xl">
          <div className={`${card} p-4`}>
            <p className="text-sm font-semibold text-[#202223] mb-3">Add a new category</p>
            <div className="flex gap-2">
              <input
                placeholder="e.g. Warranty"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                className={inputCls}
              />
              <button type="button" onClick={addCategory} className={`${btnPrimary} shrink-0`}>Add</button>
            </div>
          </div>

          <div className={`${tableWrap}`}>
            {allCategories.map((c) => {
              const count = faqs.filter((f) => (f.category || FAQ_CATEGORIES[0]) === c).length;
              const isRenaming = renamingCategory === c;
              return (
                <div key={c} className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-[#f1f2f3] last:border-b-0 ${trHover}`}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && renameCategory(c)}
                      className={`${inputCls} py-1.5`}
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#202223] truncate">{c}</p>
                      <p className="text-[11px] text-[#8c9196]">{count} question{count === 1 ? "" : "s"}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 shrink-0">
                    {isRenaming ? (
                      <>
                        <button type="button" disabled={categoryBusy} onClick={() => renameCategory(c)} className="text-[#202223] text-sm font-medium hover:underline disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => { setRenamingCategory(null); setRenameValue(""); }} className={btnGhost}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setRenamingCategory(c); setRenameValue(c); }} className="text-[#202223] text-sm font-medium hover:underline">Rename</button>
                        {c !== FAQ_CATEGORIES[0] && (
                          <button type="button" disabled={categoryBusy} onClick={() => deleteCategory(c)} className="text-red-600 text-sm font-medium hover:underline disabled:opacity-50">Delete</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#8c9196]">Renaming a category updates every FAQ that uses it. Deleting a category moves its FAQs to "{FAQ_CATEGORIES[0]}" instead of removing them.</p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" onClick={() => setEditing({ question: "", answer: "", category: filterCategory !== "All" ? filterCategory : allCategories[0], displayOrder: faqs.length, isVisible: true })} className={btnPrimary}>
              + New FAQ
            </button>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="All">All categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {editing && (
            <div className={`${card} p-5 mb-6 space-y-3`}>
              <input placeholder="Question" value={editing.question || ""} onChange={(e) => setEditing({ ...editing, question: e.target.value })} className={inputCls} />
              <textarea placeholder="Answer" value={editing.answer || ""} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} className={inputCls} rows={3} />
              <div>
                <label className="text-xs text-[#6d7175] block mb-1 font-medium">Category</label>
                <select value={editing.category || allCategories[0]} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls}>
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#6d7175]">
                <input type="checkbox" checked={editing.isVisible !== false} onChange={(e) => setEditing({ ...editing, isVisible: e.target.checked })} /> Visible on site
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving..." : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className={btnGhost}>Cancel</button>
              </div>
            </div>
          )}

          <p className="text-xs text-[#8c9196] mb-2">Drag the handle to change the order FAQs appear on the FAQ page.</p>
          <DragReorderList
            items={visibleFaqs}
            getKey={(f) => f.id}
            disabled={reorderBusy}
            onReorder={filterCategory === "All" ? saveFaqOrder : () => {}}
            renderItem={(f) => (
              <div className={`flex items-center justify-between ${card} px-4 py-3`}>
                <div className="min-w-0">
                  <p className="text-[#202223] text-sm truncate">{f.question}</p>
                  <p className="text-[#8c9196] text-[11px] font-medium mt-0.5">{f.category || FAQ_CATEGORIES[0]}</p>
                </div>
                <div className="flex gap-4 shrink-0">
                  <button type="button" onClick={() => setEditing(f)} className="text-[#202223] text-sm font-medium hover:underline">Edit</button>
                  <button type="button" onClick={() => remove(f.id)} className="text-red-500 text-sm font-medium hover:underline">Delete</button>
                </div>
              </div>
            )}
          />
          {visibleFaqs.length === 0 && <p className="text-[#8c9196] text-sm">No FAQs in this category yet.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------- Queries ("Report an Issue" submissions from Contact page) ----------------
function formatQueryDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

const QUERY_STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border border-blue-200",
  reviewed: "bg-amber-50 text-amber-700 border border-amber-200",
  replied: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

function QueriesTab() {
  const { showToast } = useToast();
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "replied">("all");
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows: any[] = await api.getAuth("/api/contact");
      setQueries(rows);
    } catch {
      showToast("Failed to load queries", "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const markReviewed = async (q: any) => {
    setBusyId(q.id);
    try {
      await api.put(`/api/contact/${q.id}/status`, { status: q.status === "new" ? "reviewed" : "new" });
      setQueries((prev) => prev.map((r) => (r.id === q.id ? { ...r, status: r.status === "new" ? "reviewed" : "new" } : r)));
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setBusyId(null);
    }
  };

  const deleteQuery = async (q: any) => {
    if (!confirm(`Delete this query from ${q.name}? This can't be undone.`)) return;
    setBusyId(q.id);
    try {
      await api.del(`/api/contact/${q.id}`);
      setQueries((prev) => prev.filter((r) => r.id !== q.id));
      showToast("Query deleted", "success");
    } catch {
      showToast("Failed to delete query", "error");
    } finally {
      setBusyId(null);
    }
  };

  const openReply = (q: any) => {
    setReplyingTo(q);
    setReplyText(q.reply_message || "");
  };

  const sendReply = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setSending(true);
    try {
      await api.postAuthJson(`/api/contact/${replyingTo.id}/reply`, { reply: replyText.trim() });
      showToast(`Reply sent to ${replyingTo.email}`, "success");
      setQueries((prev) =>
        prev.map((r) =>
          r.id === replyingTo.id ? { ...r, status: "replied", reply_message: replyText.trim(), replied_at: new Date().toISOString() } : r
        )
      );
      setReplyingTo(null);
      setReplyText("");
    } catch (err: any) {
      showToast(err?.message || "Failed to send reply", "error");
    } finally {
      setSending(false);
    }
  };

  const filtered = filter === "all" ? queries : queries.filter((q) => q.status === filter);
  const counts = {
    all: queries.length,
    new: queries.filter((q) => q.status === "new").length,
    reviewed: queries.filter((q) => q.status === "reviewed").length,
    replied: queries.filter((q) => q.status === "replied").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-[#8c9196] mt-0.5">"Report an Issue" submissions from the Contact page. Reply sends an email from {"{"}EMAIL_USER{"}"}  to the customer.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-[#e1e3e5] rounded-lg p-1">
          {(["all", "new", "reviewed", "replied"] as const).map((f) => (
            <button type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                filter === f ? "bg-[#18181b] text-white" : "text-[#6b7076] hover:bg-[#f1f1f1]"
              }`}
            >
              {f} <span className="opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#8c9196]">Loading queries…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#e1e3e5] rounded-xl p-10 text-center">
          <MessageCircle size={28} className="mx-auto text-[#c4c7cb] mb-2" />
          <p className="text-sm text-[#8c9196]">No {filter !== "all" ? filter : ""} queries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <div key={q.id} className="bg-white border border-[#e1e3e5] rounded-xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-[#202223]">{q.name}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${QUERY_STATUS_STYLES[q.status] || QUERY_STATUS_STYLES.new}`}>
                      {q.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-[#6b7076]">
                    <a href={`mailto:${q.email}`} className="hover:underline">{q.email}</a>
                    <span>·</span>
                    <a href={`tel:${q.phone}`} className="hover:underline">{q.phone}</a>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#8c9196] shrink-0">
                  <Clock3 size={13} />
                  {formatQueryDateTime(q.created_at)}
                </div>
              </div>

              <p className="text-sm text-[#3f3f46] mt-3 whitespace-pre-wrap leading-relaxed">{q.message}</p>

              {q.status === "replied" && q.reply_message && (
                <div className="mt-3 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1">
                    Your reply {q.replied_at ? `· ${formatQueryDateTime(q.replied_at)}` : ""}
                  </p>
                  <p className="text-sm text-emerald-900 whitespace-pre-wrap">{q.reply_message}</p>
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button type="button"
                  onClick={() => openReply(q)}
                  className="btn-liquid-dark text-white text-xs font-bold px-3.5 py-1.5 rounded-lg"
                >
                  {q.status === "replied" ? "Reply again" : "Reply"}
                </button>
                <button type="button"
                  onClick={() => markReviewed(q)}
                  disabled={busyId === q.id}
                  className="btn-liquid-light text-xs font-bold px-3.5 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {q.status === "new" ? "Mark as reviewed" : q.status === "reviewed" ? "Mark as new" : "Reviewed"}
                </button>
                <button type="button"
                  onClick={() => deleteQuery(q)}
                  disabled={busyId === q.id}
                  className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply modal */}
      {replyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !sending && setReplyingTo(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-black text-[#202223]">Reply to {replyingTo.name}</h3>
              <button type="button" onClick={() => setReplyingTo(null)} className="text-[#8c9196] hover:text-[#202223]">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-[#8c9196] mb-4">
              Will be emailed to <span className="font-semibold text-[#3f3f46]">{replyingTo.email}</span> from your store's support inbox.
            </p>
            <div className="bg-[#f6f6f7] rounded-lg px-3.5 py-2.5 mb-3 max-h-28 overflow-y-auto">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8c9196] mb-1">Their message</p>
              <p className="text-xs text-[#3f3f46] whitespace-pre-wrap">{replyingTo.message}</p>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={5}
              placeholder="Type your reply…"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-[#202223] resize-none"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button"
                onClick={() => setReplyingTo(null)}
                disabled={sending}
                className="btn-liquid-light text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button type="button"
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="btn-liquid-dark text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Phone Models (brand -> model list, used by Product Page selector) ----------------
// ---- Variant Options: admin-defined extra dropdowns (e.g. "Charger Type") ----
// Stored in store_settings.variantGroups (same pattern as Phone Models' brandModels),
// so no dedicated DB table is needed. Each product picks at most one group via
// product.variantGroupId (see Products tab), and the storefront shows that group's
// dropdown right under the phone model picker.
interface VariantOptionRow { id: string; label: string; isCustomText?: boolean }
interface VariantGroupRow { id: string; name: string; options: VariantOptionRow[]; required?: boolean }

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function VariantOptionsTab() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<VariantGroupRow[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const groupsRef = useRef<VariantGroupRow[]>([]);
  const pendingWritesRef = useRef(0);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      const g: VariantGroupRow[] = Array.isArray(s?.variantGroups) ? s.variantGroups : [];
      setGroups(g);
      groupsRef.current = g;
      setActiveGroupId(g[0]?.id || null);
    } catch (err: any) {
      setLoadError(err.message || "Couldn't load variant options");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next: VariantGroupRow[]) => {
    if (loading || loadError) return;
    groupsRef.current = next;
    setGroups(next);
    pendingWritesRef.current++;
    setSaveError("");
    setSaving(true);
    try {
      await saveSettingsPatch({ variantGroups: next });
      setSettings((s: any) => ({ ...s, variantGroups: next }));
      showToast("Saved", "success");
    } catch (err: any) {
      const message = err.message || "Couldn't save variant options. Your changes are still here; try again.";
      setSaveError(message);
      showToast(message, "error");
    } finally {
      pendingWritesRef.current--;
      setSaving(pendingWritesRef.current > 0);
    }
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const g: VariantGroupRow = { id: uid(), name, options: [], required: true };
    const next = [...groups, g];
    persist(next);
    setActiveGroupId(g.id);
    setNewGroupName("");
  };

  const renameGroup = (id: string, name: string) => {
    groupsRef.current = groupsRef.current.map((g) => (g.id === id ? { ...g, name } : g));
    setGroups(groupsRef.current);
  };

  const toggleRequired = (id: string, required: boolean) => {
    const next = groups.map((g) => (g.id === id ? { ...g, required } : g));
    persist(next);
  };

  const deleteGroup = (id: string) => {
    if (!confirm("Delete this variant option group? Any products using it will stop showing this dropdown.")) return;
    const next = groups.filter((g) => g.id !== id);
    persist(next);
    if (activeGroupId === id) setActiveGroupId(next[0]?.id || null);
  };

  const addOption = () => {
    const label = newOptionLabel.trim();
    if (!label || !activeGroup) return;
    const next = groups.map((g) =>
      g.id === activeGroup.id ? { ...g, options: [...g.options, { id: uid(), label, isCustomText: false }] } : g
    );
    persist(next);
    setNewOptionLabel("");
  };

  const updateOption = (optionId: string, patch: Partial<VariantOptionRow>) => {
    if (!activeGroup) return;
    const next = groupsRef.current.map((g) =>
      g.id === activeGroup.id ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) } : g
    );
    groupsRef.current = next;
    setGroups(next);
    return next;
  };

  const commitOptions = () => persist(groupsRef.current);

  const deleteOption = (optionId: string) => {
    if (!activeGroup) return;
    const next = groups.map((g) =>
      g.id === activeGroup.id ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g
    );
    persist(next);
  };

  const moveOption = (optionId: string, dir: -1 | 1) => {
    if (!activeGroup) return;
    const opts = [...activeGroup.options];
    const idx = opts.findIndex((o) => o.id === optionId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= opts.length) return;
    [opts[idx], opts[swapIdx]] = [opts[swapIdx], opts[idx]];
    const next = groups.map((g) => (g.id === activeGroup.id ? { ...g, options: opts } : g));
    persist(next);
  };

  if (loading) return <div className="text-sm text-[#6d7175] py-10 text-center">Loading…</div>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  return (
    <div className="space-y-4 max-w-5xl">
      {saveError && <AdminLoadError message={saveError} retry={commitOptions} />}
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Custom dropdown groups that can be attached to any product</p>
      </div>
      <div className={`${card} p-4`}>
        <p className="text-sm text-[#6d7175] mb-1">
          Create dropdowns (e.g. "Charger Type") with your own options. Assign a group to any product from the
          Products tab — it'll show right under the phone model dropdown on that product's page. Mark one option as
          "Create your own text" to let the customer type something custom instead of picking from the list.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Groups list */}
        <div className={`${card} p-4 space-y-3 md:col-span-1`}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#6d7175]">Variant Groups</p>
          <div className="space-y-1">
            {groups.map((g) => (
              <button type="button"
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeGroupId === g.id ? "bg-[#202223] text-white" : "hover:bg-[#f1f1f1] text-[#3f4144]"
                }`}
              >
                {g.name} <span className="opacity-60 text-xs">({g.options.length})</span>
              </button>
            ))}
            {groups.length === 0 && <p className="text-xs text-[#8c9196] px-1">No groups yet — add one below.</p>}
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#e1e3e5]">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              placeholder="New group name e.g. Charger Type"
              className={inputCls}
            />
            <button type="button" onClick={addGroup} disabled={!newGroupName.trim() || saving} className={`${btnPrimary} shrink-0`}>
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Options editor */}
        <div className={`${card} p-4 space-y-3 md:col-span-2`}>
          {!activeGroup ? (
            <p className="text-sm text-[#8c9196] py-8 text-center">Select or create a group to manage its options.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={activeGroup.name}
                  onChange={(e) => renameGroup(activeGroup.id, e.target.value)}
                  onBlur={commitOptions}
                  className={`${inputCls} font-semibold`}
                />
                <button type="button" onClick={() => deleteGroup(activeGroup.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#3f4144] cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={activeGroup.required !== false}
                  onChange={(e) => toggleRequired(activeGroup.id, e.target.checked)}
                />
                Required — customer must pick an option to proceed
                <span className="text-[#8c9196]">
                  {activeGroup.required !== false ? "(compulsory)" : "(optional — skippable)"}
                </span>
              </label>

              <div className="space-y-2">
                {activeGroup.options.map((o, i) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 bg-[#f6f6f7] rounded-lg p-2">
                    <div className="flex flex-col">
                      <button type="button" aria-label={`Move ${o.label || "option"} up`} onClick={() => moveOption(o.id, -1)} disabled={i === 0} className="text-[#8c9196] disabled:opacity-30 hover:text-[#202223]">
                        <ChevronDown size={14} className="rotate-180" />
                      </button>
                      <button type="button" aria-label={`Move ${o.label || "option"} down`} onClick={() => moveOption(o.id, 1)} disabled={i === activeGroup.options.length - 1} className="text-[#8c9196] disabled:opacity-30 hover:text-[#202223]">
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <input
                      value={o.label}
                      onChange={(e) => updateOption(o.id, { label: e.target.value })}
                      onBlur={commitOptions}
                      aria-label="Option label"
                      className="flex-1 min-w-0 basis-[140px] bg-white border border-[#c9cccf] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#458fff]"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-[#6d7175] font-medium shrink-0 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!o.isCustomText}
                        onChange={(e) => { const next = updateOption(o.id, { isCustomText: e.target.checked }); if (next) persist(next); }}
                      />
                      Show text box
                    </label>
                    <button type="button" onClick={() => deleteOption(o.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {activeGroup.options.length === 0 && (
                  <p className="text-xs text-[#8c9196]">No options yet. Add entries below — e.g. "Type-C", "Micro USB", and a final "Create your own text" option with "Show text box" checked.</p>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-[#e1e3e5]">
                <input
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addOption()}
                  placeholder='Add option e.g. "Create your own text"'
                  className={inputCls}
                />
                <button type="button" onClick={addOption} disabled={!newOptionLabel.trim() || saving} className={`${btnPrimary} shrink-0`}>
                  <Plus size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneModelsTab() {
  const { showToast } = useToast();
  // Phone models power the Brand -> Model dropdown on the Product Page. The
  // SAME list is used for every case material (Acrylic, Gold, Glass, etc) —
  // there's no per-material split, so a model added here is instantly
  // available for every product regardless of its material.
  const [brandModels, setBrandModels] = useState<Record<string, string[]>>({});
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const pendingWritesRef = useRef(0);
  const modelsDraftRef = useRef<Record<string, string[]>>({});

  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState("");
  const [newModel, setNewModel] = useState("");
  const [bulkModels, setBulkModels] = useState("");
  const [dragBrand, setDragBrand] = useState<string | null>(null);
  const [dragOverBrand, setDragOverBrand] = useState<string | null>(null);
  const [dragModel, setDragModel] = useState<string | null>(null);
  const [dragOverModel, setDragOverModel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      // Fallback chain: use the saved flat list if it's already been
      // customized, otherwise fall back to any old per-material data (merged
      // into one list) or the built-in default catalog — so the page starts
      // out fully populated instead of empty.
      let merged: Record<string, string[]>;
      if (s?.brandModels && typeof s.brandModels === "object" && !Array.isArray(s.brandModels)) {
        merged = s.brandModels;
      } else if (s?.materialBrandModels && Object.keys(s.materialBrandModels).length) {
        merged = {};
        Object.values(s.materialBrandModels as Record<string, Record<string, string[]>>).forEach((perBrand) => {
          Object.entries(perBrand || {}).forEach(([brand, models]) => {
            merged[brand] = Array.from(new Set([...(merged[brand] || []), ...(models || [])]));
          });
        });
      } else {
        merged = DEFAULT_BRAND_MODELS;
      }
      setBrandModels(merged);
      modelsDraftRef.current = merged;
      setActiveBrand(Object.keys(merged)[0] || null);
    } catch (err: any) {
      setLoadError(err.message || "Couldn't load phone models");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next: Record<string, string[]>) => {
    if (loading || loadError) return;
    modelsDraftRef.current = next;
    setBrandModels(next);
    setSavedMsg(false);
    setSaveError("");
    pendingWritesRef.current++;
    setSaving(true);
    try {
      // Saved as the single flat list every material shares. materialBrandModels
      // (the old per-material data) is intentionally left alone on the backend
      // but no longer read anywhere, so this is a clean, non-destructive switch.
      await saveSettingsPatch({ brandModels: next });
      setSettings((s: any) => ({ ...s, brandModels: next }));
      if (JSON.stringify(modelsDraftRef.current) === JSON.stringify(next)) setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
    } catch (err: any) {
      const message = err.message || "Couldn't save phone models. Your changes are still here; try again.";
      setSaveError(message);
      showToast(message, "error");
    } finally {
      pendingWritesRef.current--;
      setSaving(pendingWritesRef.current > 0);
    }
  };

  // ---- CSV export/import for Brand,Model pairs ----
  const csvEscape = csvCell;

  const exportCSV = () => {
    const rows = [["Brand", "Model"]];
    Object.keys(brandModels).forEach((b) => {
      const models = brandModels[b] || [];
      if (models.length === 0) rows.push([b, ""]);
      else models.forEach((m) => rows.push([b, m]));
    });
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "phone-models.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(field); field = "";
          if (row.some((f) => f.trim() !== "")) rows.push(row);
          row = [];
        } else field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  };

  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) return;
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = header[0] === "brand";
      const dataRows = hasHeader ? rows.slice(1) : rows;

      const next: Record<string, string[]> = {};
      dataRows.forEach(([brand, model]) => {
        const b = (brand || "").trim();
        const m = (model || "").trim();
        if (!b) return;
        if (!next[b]) next[b] = [];
        if (m && !next[b].includes(m)) next[b].push(m);
      });

      if (!Object.keys(next).length) { showToast("This file has no valid brand/model rows", "error"); return; }
      if (!confirm(`Import ${Object.keys(next).length} brand(s) from CSV? This replaces the entire Phone Models list (used by every material).`)) return;
      await persist(next);
      setActiveBrand(Object.keys(next)[0] || null);
    } catch (err) {
      alert("Couldn't read that CSV file. Please check the format and try again.");
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const addBrand = () => {
    const name = newBrand.trim();
    if (!name || brandModels[name]) return;
    const next = { ...brandModels, [name]: [] };
    persist(next);
    setActiveBrand(name);
    setNewBrand("");
  };

  const removeBrand = (brand: string) => {
    if (!confirm(`Delete brand "${brand}" and all its models?`)) return;
    const next = { ...brandModels };
    delete next[brand];
    persist(next);
    if (activeBrand === brand) setActiveBrand(Object.keys(next)[0] || null);
  };

  const addModel = () => {
    if (!activeBrand) return;
    const name = newModel.trim();
    if (!name || brandModels[activeBrand]?.includes(name)) return;
    const next = { ...brandModels, [activeBrand]: [...(brandModels[activeBrand] || []), name] };
    persist(next);
    setNewModel("");
  };

  const addModelsBulk = () => {
    if (!activeBrand || !bulkModels.trim()) return;
    const names = bulkModels.split("\n").map((s) => s.trim()).filter(Boolean);
    const existing = brandModels[activeBrand] || [];
    const merged = Array.from(new Set([...existing, ...names]));
    persist({ ...brandModels, [activeBrand]: merged });
    setBulkModels("");
  };

  const removeModel = (brand: string, model: string) => {
    const next = { ...brandModels, [brand]: (brandModels[brand] || []).filter((m) => m !== model) };
    persist(next);
  };

  // Drag-and-drop reorder for brands (order of keys) — rebuild the object in the new key order.
  const reorderBrands = (from: string, to: string) => {
    if (from === to) return;
    const order = Object.keys(brandModels);
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, from);
    const next: Record<string, string[]> = {};
    order.forEach((b) => { next[b] = brandModels[b]; });
    persist(next);
  };

  // Sort the active brand's models alphabetically (A-Z).
  const sortModelsAZ = (brand: string) => {
    const list = [...(brandModels[brand] || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    persist({ ...brandModels, [brand]: list });
  };


  const reorderModels = (from: string, to: string) => {
    if (!activeBrand || from === to) return;
    const list = [...(brandModels[activeBrand] || [])];
    const fromIdx = list.indexOf(from);
    const toIdx = list.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return;
    list.splice(fromIdx, 1);
    list.splice(toIdx, 0, from);
    persist({ ...brandModels, [activeBrand]: list });
  };

  if (loading) return <p className="text-[#8c9196] text-sm">Loading...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  const brands = Object.keys(brandModels);

  return (
    <div className="space-y-4">
      {saveError && <AdminLoadError message={saveError} retry={() => persist(modelsDraftRef.current)} />}
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">One Brand &amp; Model list, shared by every case material</p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <p className="text-sm text-[#6d7175]">
          This list powers the Brand &amp; Model selector on the product page for <span className="font-semibold text-[#202223]">every material</span> — Acrylic, Gold, Glass, and all the rest.
        </p>
        {saving && <span className="text-xs text-[#8c9196]">Saving...</span>}
        {savedMsg && <span className="text-xs text-green-600 font-semibold">Saved ✓</span>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportCSV} className="btn-liquid-light flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5">
            <Download size={13} /> Export CSV
          </button>
          <button type="button" onClick={() => importFileRef.current?.click()} className="btn-liquid-light flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5">
            <Upload size={13} /> Import CSV
          </button>
          <input ref={importFileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Brands column */}
        <div className={`${card} p-4`}>
          <h3 className="text-sm font-black text-[#202223] mb-3">Brands ({brands.length}) <span className="font-normal text-[#8c9196]">— drag to reorder</span></h3>
          <div className="space-y-1 max-h-96 overflow-y-auto mb-3">
            {brands.map((b) => (
              <div
                key={b}
                draggable
                onDragStart={() => setDragBrand(b)}
                onDragOver={(e) => { e.preventDefault(); if (b !== dragOverBrand) setDragOverBrand(b); }}
                onDrop={(e) => { e.preventDefault(); if (dragBrand) reorderBrands(dragBrand, b); setDragBrand(null); setDragOverBrand(null); }}
                onDragEnd={() => { setDragBrand(null); setDragOverBrand(null); }}
                onClick={() => setActiveBrand(b)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing ${
                  activeBrand === b ? "btn-liquid-dark" : "text-[#6d7175] hover:bg-[#f6f6f7]"
                } ${dragOverBrand === b && dragBrand && dragBrand !== b ? "ring-2 ring-[#3b93f0]" : ""} ${dragBrand === b ? "opacity-50" : ""}`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <GripVertical size={13} className={activeBrand === b ? "text-[#c9cccf]" : "text-[#c9cccf]"} />
                  {b}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${activeBrand === b ? "text-[#c9cccf]" : "text-[#8c9196]"}`}>{brandModels[b]?.length || 0}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeBrand(b); }} className={activeBrand === b ? "text-red-300" : "text-red-400"}>
                    <X size={13} />
                  </button>
                </span>
              </div>
            ))}
            {brands.length === 0 && <p className="text-[#8c9196] text-xs">No brands yet.</p>}
          </div>
          <div className="flex gap-2">
            <input
              placeholder="New brand e.g. Google"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBrand()}
              className={inputCls}
            />
            <button type="button" onClick={addBrand} className={btnPrimary}>Add</button>
          </div>
        </div>

        {/* Models column */}
        <div className={`${card} p-4 md:col-span-2`}>
          <h3 className="text-sm font-black text-[#202223] mb-3 flex items-center justify-between gap-2 flex-wrap">
            <span>
              {activeBrand ? <>Models — {activeBrand} <span className="font-normal text-[#8c9196]">— drag to reorder</span></> : "Select a brand"}
            </span>
            {activeBrand && (brandModels[activeBrand] || []).length > 1 && (
              <button type="button"
                onClick={() => sortModelsAZ(activeBrand)}
                className="text-xs font-bold text-[#3b93f0] hover:underline flex items-center gap-1"
              >
                <ArrowDownAZ size={13} /> Sort A-Z
              </button>
            )}
          </h3>

          {activeBrand && (
            <>
              <div className="flex flex-wrap gap-2 mb-4 max-h-72 overflow-y-auto">
                {(brandModels[activeBrand] || []).map((m) => (
                  <span
                    key={m}
                    draggable
                    onDragStart={() => setDragModel(m)}
                    onDragOver={(e) => { e.preventDefault(); if (m !== dragOverModel) setDragOverModel(m); }}
                    onDrop={(e) => { e.preventDefault(); if (dragModel) reorderModels(dragModel, m); setDragModel(null); setDragOverModel(null); }}
                    onDragEnd={() => { setDragModel(null); setDragOverModel(null); }}
                    className={`flex items-center gap-1.5 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full px-3 py-1.5 text-xs text-[#202223] cursor-grab active:cursor-grabbing ${
                      dragOverModel === m && dragModel && dragModel !== m ? "ring-2 ring-[#3b93f0]" : ""
                    } ${dragModel === m ? "opacity-50" : ""}`}
                  >
                    <GripVertical size={11} className="text-[#c9cccf]" />
                    {m}
                    <button type="button" onClick={() => removeModel(activeBrand, m)} className="text-[#8c9196] hover:text-red-500">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {(brandModels[activeBrand] || []).length === 0 && <p className="text-[#8c9196] text-xs">No models yet — add below.</p>}
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  placeholder="Add single model e.g. IPHONE 17 PRO"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addModel()}
                  className={inputCls}
                />
                <button type="button" onClick={addModel} className={btnPrimary}>Add</button>
              </div>

              <div>
                <label className="text-xs text-[#6d7175] block mb-1 font-medium">Bulk add (one model per line)</label>
                <textarea
                  value={bulkModels}
                  onChange={(e) => setBulkModels(e.target.value)}
                  rows={4}
                  placeholder={"IPHONE 18\nIPHONE 18 PRO\nIPHONE 18 PRO MAX"}
                  className={inputCls}
                />
                <button type="button" onClick={addModelsBulk} className={`${btnPrimary} mt-2`}>Add All Lines</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------- Serviceability (pincode delivery availability) ----------------
function ServiceabilityTab() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [checkInput, setCheckInput] = useState("");
  const [checkResult, setCheckResult] = useState<null | boolean>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [checkError, setCheckError] = useState("");
  const busyRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      setPincodes(Array.isArray(s?.servicablePincodes) ? s.servicablePincodes : []);
    } catch (err: any) {
      setLoadError(err.message || "Couldn't load serviceable pincodes");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next: string[]) => {
    if (busyRef.current || loading || loadError) return false;
    busyRef.current = true;
    setSaving(true);
    try {
      await saveSettingsPatch({ servicablePincodes: next });
      setPincodes(next);
      setCheckResult(null);
      setSettings((s: any) => ({ ...s, servicablePincodes: next }));
      showToast("Serviceable pincodes saved", "success");
      return true;
    } catch (err: any) {
      showToast(err.message || "Couldn't save pincodes. Please try again.", "error");
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const addBulk = async () => {
    const codes = bulkInput.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!codes.length) return showToast("Enter at least one 6-digit pincode", "error");
    if (codes.some((code) => !/^[1-9]\d{5}$/.test(code))) return showToast("Every pincode must contain 6 digits and start with 1–9", "error");
    const merged = Array.from(new Set([...pincodes, ...codes]));
    if (await persist(merged)) setBulkInput("");
  };

  const removeCode = (code: string) => persist(pincodes.filter((p) => p !== code));

  const check = () => {
    if (!/^[1-9]\d{5}$/.test(checkInput.trim())) { setCheckResult(null); setCheckError("Enter a valid 6-digit pincode"); return; }
    setCheckError("");
    setCheckResult(pincodes.length === 0 ? true : pincodes.includes(checkInput.trim()));
  };

  if (loading) return <p role="status" className="text-sm text-[#6d7175]">Loading serviceable pincodes...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  return (
    <div>
      <p className="text-sm text-[#6d7175] mb-4">
        Add pincodes you deliver to. If the list is empty, every pincode is treated as serviceable (no restriction).
        {saving && <span className="text-[#8c9196] ml-2">Saving...</span>}
      </p>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={`${card} p-4`}>
          <h3 className="text-sm font-black text-[#202223] mb-3">Add Pincodes</h3>
          <textarea
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            rows={5}
            placeholder={"641601\n641602, 641603\n625007"}
            className={inputCls}
          />
          <button type="button" onClick={addBulk} disabled={saving || !bulkInput.trim()} className={`${btnPrimary} mt-2`}>Add Pincodes</button>

          <h3 className="text-sm font-black text-[#202223] mt-6 mb-2">Serviceable Pincodes ({pincodes.length})</h3>
          <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
            {pincodes.map((p) => (
              <span key={p} className="flex items-center gap-1 bg-[#f6f6f7] border border-[#e1e3e5] rounded-full px-2.5 py-1 text-xs text-[#202223]">
                {p}
                <button type="button" aria-label={`Remove pincode ${p}`} disabled={saving} onClick={() => removeCode(p)} className="text-[#8c9196] hover:text-red-500"><X size={11} /></button>
              </span>
            ))}
            {pincodes.length === 0 && <p className="text-[#8c9196] text-xs">No restriction set — all pincodes serviceable.</p>}
          </div>
        </div>

        <div className={`${card} p-4`}>
          <h3 className="text-sm font-black text-[#202223] mb-3">Check a Pincode</h3>
          <div className="flex gap-2">
            <input
              placeholder="e.g. 641601"
              value={checkInput}
              onChange={(e) => { setCheckInput(e.target.value.replace(/\D/g, "")); setCheckResult(null); setCheckError(""); }}
              inputMode="numeric"
              aria-label="Pincode to check"
              onKeyDown={(e) => e.key === "Enter" && check()}
              className={inputCls}
              maxLength={6}
            />
            <button type="button" onClick={check} className={btnPrimary}>Check</button>
          </div>
          {checkError && <p role="alert" className="text-xs text-red-600 mt-2">{checkError}</p>}
          {checkResult !== null && (
            <p className={`mt-3 text-sm font-semibold ${checkResult ? "text-green-600" : "text-red-500"}`}>
              {checkResult ? "✓ Deliverable" : "✗ Not serviceable yet"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Website Content (homepage About/Reviews/Contact section text) ----------------
// Renamed from the old standalone "Website Content" tab — now rendered as
// the "Page Text" sub-section inside the merged WebsiteContentIntegratedTab.
// ---------------- Reviews (dedicated moderation page) ----------------
// Every review a customer submits — whether from a product page's "Write a
// Review" tab or the general /reviews page — lands here pending, and never
// shows up on the storefront until an admin approves it.
const REVIEWS_SUBTABS = ["Product Reviews", "General Reviews", "Stories"] as const;

function ReviewsTab() {
  const [sub, setSub] = useState<(typeof REVIEWS_SUBTABS)[number]>("Product Reviews");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Moderate product reviews, site-wide reviews, and review stories</p>
      </div>
      <div className="flex gap-2 mb-5 border-b border-[#e1e3e5] overflow-x-auto">
        {REVIEWS_SUBTABS.map((s) => (
          <button type="button"
            key={s}
            onClick={() => setSub(s)}
            className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
              sub === s ? "border-[#202223] text-[#202223]" : "border-transparent text-[#8c9196] hover:text-[#202223]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {sub === "Product Reviews" && <ProductReviewsQueue />}
      {sub === "General Reviews" && <SiteReviewsQueue />}
      {sub === "Stories" && <ReviewStoriesManager />}
    </div>
  );
}

// Moderation queue for reviews left on individual product pages (the
// "Customer Reviews" tab on each product). Approving one makes it live on
// that product's page instantly and folds it into the product's star rating.
function ProductReviewsQueue() {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.getAuth("/api/reviews/admin/all");
      setReviews(rows || []);
    } catch {
      // ignore — section just shows empty state
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string, isApproved: boolean) => {
    setBusyId(id);
    try {
      await api.put(`/api/reviews/${id}/approve`, { isApproved });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, is_approved: isApproved } : r)));
      showToast(isApproved ? "Review approved — now live on the product page" : "Review unapproved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update review", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this review permanently?")) return;
    setBusyId(id);
    try {
      await api.del(`/api/reviews/${id}`);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast("Review deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete review", "error");
    } finally {
      setBusyId(null);
    }
  };

  const pending = reviews.filter((r) => !r.is_approved);
  const approved = reviews.filter((r) => r.is_approved);

  const ReviewRow = ({ r, approvedRow }: { r: ProductReview; approvedRow: boolean }) => (
    <div className={`border rounded-lg px-3 py-2.5 ${approvedRow ? "bg-[#f6f6f7] border-[#e1e3e5]" : "bg-blue-50 border-blue-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {r.image && (
            <img src={api.imageUrl(r.image)} alt="Review" className="w-12 h-12 object-cover rounded-lg border border-[#e1e3e5] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-sm font-bold text-[#202223]">{r.name}</span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={11} className={i < r.rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"} />
                ))}
              </span>
              {r.product_title && (
                <span className="text-[10px] font-semibold text-[#6d7175] bg-white border border-[#e1e3e5] rounded-full px-2 py-0.5 truncate max-w-[200px]">
                  {r.product_title}
                </span>
              )}
            </div>
            {r.comment && <p className="text-xs text-[#6d7175]">{r.comment}</p>}
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          {approvedRow ? (
            <>
              <button type="button" onClick={() => approve(r.id, false)} disabled={busyId === r.id} className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-50">Unpublish</button>
              <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50">Delete</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => approve(r.id, true)} disabled={busyId === r.id} className="text-xs font-bold text-green-600 hover:underline disabled:opacity-50">Approve</button>
              <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} className="text-xs font-bold text-red-500 hover:underline disabled:opacity-50">Reject</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-black text-[#202223]">Product Reviews Approval Queue</h3>
        {pending.length > 0 && (
          <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full px-2 py-0.5">{pending.length} pending</span>
        )}
      </div>
      <p className="text-xs text-[#8c9196] mb-4">
        Reviews submitted through the "Customer Reviews" tab on a product page. Approve to make one go live on that
        product (and count toward its star rating); reject to remove it.
      </p>

      {loading ? (
        <p className="text-[#8c9196] text-sm">Loading...</p>
      ) : reviews.length === 0 ? (
        <p className="text-[#8c9196] text-sm">No product reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8c9196] uppercase tracking-wide mb-2">Pending</p>
              <div className="space-y-2">
                {pending.map((r) => <ReviewRow key={r.id} r={r} approvedRow={false} />)}
              </div>
            </div>
          )}
          {approved.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8c9196] uppercase tracking-wide mb-2">Live on site</p>
              <div className="space-y-2">
                {approved.map((r) => <ReviewRow key={r.id} r={r} approvedRow={true} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// "Stories" — admin posts a screenshot/photo daily, Instagram Highlights
// style. Shown as a row of circular bubbles at the top of the public
// /reviews page; customers tap through them full-screen.
function ReviewStoriesManager() {
  const { showToast } = useToast();
  const [stories, setStories] = useState<ReviewStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [name, setName] = useState("");
  const [caption, setCaption] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The thumbnail the admin uploads here is also the exact image shown
  // full-screen in the storefront's portrait story viewer (see
  // ReviewStories.tsx). It used to be uploaded raw with no cropping step,
  // so whatever the admin picked (often a square/landscape screenshot)
  // didn't match the portrait frame customers actually see it in - hence
  // needing to scroll/hunt to see the part of the photo that mattered.
  // Cropping to the same 9:16 portrait ratio here makes the preview and
  // the live story pixel-exact.
  const [cropFile, setCropFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.getAuth("/api/review-stories/admin/all");
      setStories(rows || []);
    } catch {
      // ignore — section just shows empty state
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const uploadThumb = async (file: File) => {
    setUploadingThumb(true);
    try {
      const res = await api.upload(file);
      setThumbUrl(res.url);
    } catch (err: any) {
      showToast(err.message || "Thumbnail upload failed", "error");
    } finally {
      setUploadingThumb(false);
    }
  };

  const uploadVideo = async (file: File) => {
    setUploadingVideo(true);
    try {
      const res = await api.upload(file);
      setVideoUrl(res.url);
    } catch (err: any) {
      showToast(err.message || "Video upload failed", "error");
    } finally {
      setUploadingVideo(false);
    }
  };

  const postStory = async () => {
    if (!name.trim()) {
      showToast("Give the story a name first", "error");
      return;
    }
    if (!thumbUrl) {
      showToast("Add a thumbnail image first", "error");
      return;
    }
    setPosting(true);
    try {
      await api.post(
        "/api/review-stories",
        {
          image: thumbUrl,
          video: videoUrl || undefined,
          mediaType: videoUrl ? "video" : "image",
          name: name.trim(),
          caption: caption.trim(),
          displayOrder: 0,
        },
        true
      );
      setName("");
      setCaption("");
      setThumbUrl("");
      setVideoUrl("");
      showToast("Story posted — now live on /reviews", "success");
      load();
    } catch (err: any) {
      showToast(err.message || "Failed to post story", "error");
    } finally {
      setPosting(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setBusyId(id);
    try {
      await api.put(`/api/review-stories/${id}`, { isActive });
      setStories((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)));
    } catch (err: any) {
      showToast(err.message || "Failed to update story", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this story permanently?")) return;
    setBusyId(id);
    try {
      await api.del(`/api/review-stories/${id}`);
      setStories((prev) => prev.filter((s) => s.id !== id));
      showToast("Story deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete story", "error");
    } finally {
      setBusyId(null);
    }
  };

  const reorder = async (next: ReviewStory[]) => {
    setStories(next);
    try {
      await api.put("/api/review-stories/reorder/all", { ids: next.map((s) => s.id) });
    } catch (err: any) {
      showToast(err.message || "Failed to save order", "error");
    }
  };

  return (
    <div className={`${card} p-5`}>
      <h3 className="text-sm font-black text-[#202223] mb-1">Stories (Instagram Highlights style)</h3>
      <p className="text-xs text-[#8c9196] mb-4">
        Post a screenshot or photo — it shows up as a circular story bubble at the top of the public /reviews page.
        Customers tap through them full-screen, just like Instagram. Stories stay up permanently (like Instagram
        Highlights) — no auto-expiry. Unpublish or delete a story anytime to take it down.
      </p>

      <div className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg p-3 mb-5 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Story name (required, e.g. Priya's Unboxing) — shown under the circle"
          className={inputCls}
        />
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption (optional, shown when the story is opened)"
          className={inputCls}
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className={`flex items-center justify-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2.5 w-fit cursor-pointer ${thumbUrl ? "bg-white border border-[#e1e3e5] text-[#202223]" : "bg-[#202223] text-white hover:bg-black"}`}>
            {thumbUrl && <img src={api.imageUrl(thumbUrl)} alt="Thumbnail" className="w-5 h-5 rounded-full object-cover" />}
            <Upload size={13} />
            {uploadingThumb ? "Uploading..." : thumbUrl ? "Change thumbnail" : "Upload thumbnail (required)"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingThumb}
              onChange={(e) => {
                if (e.target.files?.[0]) setCropFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>

          <label className={`flex items-center justify-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2.5 w-fit cursor-pointer ${videoUrl ? "bg-white border border-[#e1e3e5] text-[#202223]" : "bg-white border border-dashed border-[#c9cccf] text-[#6d7175] hover:border-[#8c9196]"}`}>
            <Upload size={13} />
            {uploadingVideo ? "Uploading..." : videoUrl ? "Video attached ✓ (tap to change)" : "Attach video (optional, plays with sound)"}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploadingVideo}
              onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
            />
          </label>
          {videoUrl && (
            <button type="button" onClick={() => setVideoUrl("")} className="text-xs font-medium text-red-500 hover:underline">
              Remove video
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#8c9196]">
          Thumbnail is the small circle shown before the story is opened. If you attach a video, that plays
          full-screen with sound when the customer opens the story — otherwise the thumbnail image itself is shown full-screen,
          so you'll crop it to the same portrait frame customers see it in.
        </p>

        {cropFile && (
          <ImageCropModal
            file={cropFile}
            aspectW={9}
            aspectH={16}
            onCancel={() => setCropFile(null)}
            onConfirm={(croppedFile) => {
              setCropFile(null);
              uploadThumb(croppedFile);
            }}
          />
        )}

        <button
          type="button"
          onClick={postStory}
          disabled={posting || uploadingThumb || uploadingVideo || !name.trim() || !thumbUrl}
          className={`text-xs font-bold text-white rounded-lg px-4 py-2.5 w-fit ${posting || uploadingThumb || uploadingVideo || !name.trim() || !thumbUrl ? "bg-[#c9cccf] cursor-not-allowed" : "bg-[#202223] cursor-pointer hover:bg-black"}`}
        >
          {posting ? "Posting..." : "Post today's story"}
        </button>
      </div>

      {loading ? (
        <p className="text-[#8c9196] text-sm">Loading...</p>
      ) : stories.length === 0 ? (
        <p className="text-[#8c9196] text-sm">No stories posted yet.</p>
      ) : (
        <DragReorderList
          items={stories}
          getKey={(s) => s.id}
          onReorder={reorder}
          renderItem={(s) => {
            const expired = Date.now() - new Date(s.created_at).getTime() > 24 * 60 * 60 * 1000;
            return (
            <div className={`flex items-center gap-3 bg-white border rounded-lg px-3 py-2.5 ${!s.is_active || expired ? "border-dashed border-[#c9cccf] opacity-60" : "border-[#e1e3e5]"}`}>
              <GripVertical size={14} className="text-[#c9cccf] shrink-0" />
              <img
                src={api.imageUrl(s.image)}
                alt={s.name}
                className="rounded-full object-cover border-2 border-[#e1e3e5] shrink-0 aspect-square"
                style={{ width: 48, height: 48 }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[#202223] truncate">{s.name}</p>
                  {s.media_type === "video" && s.video && (
                    <span className="text-[9px] font-bold text-white bg-purple-600 rounded-full px-1.5 py-0.5 shrink-0">Video</span>
                  )}
                  {expired ? (
                    <span className="text-[9px] font-bold text-white bg-[#8c9196] rounded-full px-1.5 py-0.5 shrink-0">Highlights</span>
                  ) : s.is_active ? (
                    <span className="text-[9px] font-bold text-white bg-green-600 rounded-full px-1.5 py-0.5 shrink-0">Live</span>
                  ) : (
                    <span className="text-[9px] font-bold text-white bg-[#c9cccf] rounded-full px-1.5 py-0.5 shrink-0">Unpublished</span>
                  )}
                </div>
                {s.caption && <p className="text-[11px] text-[#6d7175] truncate">{s.caption}</p>}
                <p className="text-[10px] text-[#8c9196]">{new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button type="button" onClick={() => toggleActive(s.id, !s.is_active)} disabled={busyId === s.id} className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-50">
                  {s.is_active ? "Unpublish" : "Publish"}
                </button>
                <button type="button" onClick={() => remove(s.id)} disabled={busyId === s.id} className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50">Delete</button>
              </div>
            </div>
            );
          }}
        />
      )}
    </div>
  );
}

function WebsiteContentSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoadingSettings(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      setForm(s || {});
    } catch (err: any) {
      setLoadError(err.message || "Couldn't load website content");
    } finally {
      setLoadingSettings(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value }));

  const save = async () => {
    if (loadingSettings || loadError || saving) return;
    setSaving(true);
    try {
      await saveChangedSettings(settings, { ...settings, ...form });
      setSettings((s: any) => ({ ...s, ...form }));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
    } catch (err: any) {
      setSavedMsg(false);
      showToast(err.message || "Couldn't save content. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, k, textarea = false }: { label: string; k: string; textarea?: boolean }) => (
    <div>
      <label className="text-xs text-[#6d7175] block mb-1 font-medium">{label}</label>
      {textarea ? (
        <textarea value={form[k] || ""} onChange={(e) => set(k, e.target.value)} rows={2} className={inputCls} />
      ) : (
        <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} className={inputCls} />
      )}
    </div>
  );

  if (loadingSettings) return <p role="status" className="text-sm text-[#6d7175]">Loading website content...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving..." : "Save All Content"}</button>
        {savedMsg && <span className="text-xs text-green-600 font-semibold">Saved ✓</span>}
      </div>

      <div className="space-y-6">
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-black text-[#202223] mb-4">About / Brand Story Section</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Section Title", k: "aboutSectionTitle" })}
          </div>
          <div className="mt-4 space-y-4">
            {Field({ label: "Subtitle", k: "aboutSectionSubtitle", textarea: true })}
            {Field({ label: "Paragraph 1", k: "aboutSectionDesc1", textarea: true })}
            {Field({ label: "Paragraph 2", k: "aboutSectionDesc2", textarea: true })}
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="text-sm font-black text-[#202223] mb-4">Contact / Support Section</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Title", k: "contactTitle" })}
            {Field({ label: "Subtitle", k: "contactSubtitle" })}
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {Field({ label: "Contact Email", k: "contactEmail" })}
            {Field({ label: "Contact Phone", k: "contactPhone" })}
            {Field({ label: "Contact Address", k: "contactAddress" })}
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="text-sm font-black text-[#202223] mb-4">Site Text — Home &amp; Global</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "\"Shop By Collections\" Heading", k: "homeCollectionsTitle" })}
            {Field({ label: "\"Featured\" Heading", k: "homeFeaturedTitle" })}
            {Field({ label: "\"Best Selling Products\" Heading", k: "homeBestSellersTitle" })}
            {Field({ label: "\"Trending Now\" Heading", k: "homeTrendingTitle" })}
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {Field({ label: "Newsletter Title", k: "newsletterTitle" })}
            {Field({ label: "Newsletter Subtitle", k: "newsletterSubtitle" })}
          </div>
          <div className="mt-4">
            {Field({ label: "Footer Disclaimer / Brand Blurb", k: "footerDisclaimer", textarea: true })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Moderation queue for reviews submitted by real site visitors via the
// "Write a Review" form on the public /reviews page. Every submission lands
// pending; approving it makes it go live instantly on /reviews (merged
// alongside the admin-authored testimonials below).
function SiteReviewsQueue() {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.getAuth("/api/site-reviews/admin/all");
      setReviews(rows || []);
    } catch {
      // ignore — section just shows empty state
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: string, isApproved: boolean) => {
    setBusyId(id);
    try {
      await api.put(`/api/site-reviews/${id}/approve`, { isApproved });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isApproved } : r)));
      showToast(isApproved ? "Review approved — now live on /reviews" : "Review unapproved", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update review", "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this review permanently?")) return;
    setBusyId(id);
    try {
      await api.del(`/api/site-reviews/${id}`);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast("Review deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete review", "error");
    } finally {
      setBusyId(null);
    }
  };

  const pending = reviews.filter((r) => !r.isApproved);
  const approved = reviews.filter((r) => r.isApproved);

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-black text-[#202223]">Reviews Approval Queue (from visitors)</h3>
        {pending.length > 0 && (
          <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full px-2 py-0.5">{pending.length} pending</span>
        )}
      </div>
      <p className="text-xs text-[#8c9196] mb-4">
        Reviews submitted by visitors through the "Write a Review" button on the public /reviews page. Approve to make them
        go live instantly; delete to reject.
      </p>

      {loading ? (
        <p className="text-[#8c9196] text-sm">Loading...</p>
      ) : reviews.length === 0 ? (
        <p className="text-[#8c9196] text-sm">No visitor-submitted reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8c9196] uppercase tracking-wide mb-2">Pending</p>
              <div className="space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-[#202223]">{r.name}</span>
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={11} className={i < r.rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"} />
                            ))}
                          </span>
                        </div>
                        {r.comment && <p className="text-xs text-[#6d7175]">{r.comment}</p>}
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button type="button" onClick={() => approve(r.id, true)} disabled={busyId === r.id} className="text-xs font-bold text-green-600 hover:underline disabled:opacity-50">Approve</button>
                        <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} className="text-xs font-bold text-red-500 hover:underline disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {approved.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#8c9196] uppercase tracking-wide mb-2">Live on site</p>
              <div className="space-y-2">
                {approved.map((r) => (
                  <div key={r.id} className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-[#202223]">{r.name}</span>
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={11} className={i < r.rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"} />
                            ))}
                          </span>
                        </div>
                        {r.comment && <p className="text-xs text-[#6d7175]">{r.comment}</p>}
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button type="button" onClick={() => approve(r.id, false)} disabled={busyId === r.id} className="text-xs font-medium text-[#202223] hover:underline disabled:opacity-50">Unpublish</button>
                        <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Customer Reviews shown on the Cart page AND on the public /reviews page —
// plain admin-entered testimonials, never claimed to be pulled from Google/Meta.
// Stored as settings.siteTestimonials. Admin can post a review on behalf of a
// customer (e.g. one they sent over WhatsApp) with an optional photo and an
// optional "which product" tag — it shows up immediately on the storefront's
// Reviews page and the Cart page carousel, no customer login needed.
function TestimonialsEditor({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const { showToast } = useToast();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const list: Testimonial[] = Array.isArray(form.siteTestimonials) ? form.siteTestimonials : [];

  const update = (next: Testimonial[]) => set("siteTestimonials", next);

  const addOne = () => {
    update([{ id: crypto.randomUUID(), name: "", rating: 5, comment: "", image: "", productTitle: "" }, ...list]);
  };
  const editOne = (id: string, patch: Partial<Testimonial>) => {
    update(list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const removeOne = (id: string) => {
    update(list.filter((t) => t.id !== id));
  };

  const uploadReviewImage = async (id: string, file: File) => {
    setUploadingId(id);
    try {
      const res = await api.upload(file);
      editOne(id, { image: res.url });
      showToast("Review photo uploaded", "success");
    } catch (err: any) {
      showToast(err.message || "Upload failed", "error");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-black text-[#202223]">Customer Reviews (Cart page + /reviews)</h3>
        <button type="button" onClick={addOne} className="text-xs font-bold text-[#202223] hover:underline">+ Post Review</button>
      </div>
      <p className="text-xs text-[#8c9196] mb-4">
        Post a review on behalf of a customer — with their name, rating, comment, an optional photo (e.g. a WhatsApp
        screenshot they sent you), and which product it's about. It appears instantly on the storefront's Reviews page
        once you hit "Save All Content" below.
      </p>
      <div className="space-y-3">
        {list.map((t) => (
          <div key={t.id} className="bg-[#f6f6f7] border border-[#e1e3e5] rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <input value={t.name} onChange={(e) => editOne(t.id, { name: e.target.value })} placeholder="Customer name" className={inputCls} />
              <select value={t.rating} onChange={(e) => editOne(t.id, { rating: Number(e.target.value) })} className={`${inputCls} w-24`}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
              </select>
              <button type="button" onClick={() => removeOne(t.id)} className="text-red-500 text-xs font-medium px-2 shrink-0">Delete</button>
            </div>
            <textarea value={t.comment} onChange={(e) => editOne(t.id, { comment: e.target.value })} placeholder="Review text" rows={2} className={inputCls} />
            <input
              value={t.productTitle || ""}
              onChange={(e) => editOne(t.id, { productTitle: e.target.value })}
              placeholder="Product name (optional, e.g. Custom Photo Case)"
              className={inputCls}
            />
            <div className="flex items-center gap-3">
              {t.image ? (
                <div className="relative">
                  <img src={api.imageUrl(t.image)} alt="Review" className="w-16 h-16 object-cover rounded-lg border border-[#e1e3e5]" />
                  <button type="button"
                    onClick={() => editOne(t.id, { image: "" })}
                    className="absolute -top-2 -right-2 bg-white border border-[#e1e3e5] rounded-full w-5 h-5 flex items-center justify-center text-[#6d7175] hover:text-red-500"
                    title="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#202223] cursor-pointer border border-dashed border-[#c9cccf] rounded-lg px-3 py-2 hover:bg-white">
                  <Upload size={13} />
                  {uploadingId === t.id ? "Uploading..." : "Attach photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingId === t.id}
                    onChange={(e) => e.target.files?.[0] && uploadReviewImage(t.id, e.target.files[0])}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-[#8c9196] text-sm">No reviews yet — click "+ Post Review".</p>}
      </div>
    </div>
  );
}

// ---------------- Content (Branding / Social / Store Config / SEO) ----------------
const CONTENT_SUBTABS = ["Branding", "Social & Chat", "Store Config", "SEO Tools"] as const;

// ---------------- Website Content (integrated) ----------------
// Merges the old separate "Website Content" (page copy: About, taglines etc.)
// and "Content" (site-wide content blocks) tabs into a single sidebar entry
// with an internal sub-tab switch, per the requested 5-tool sidebar layout.
function WebsiteContentIntegratedTab() {
  const [section, setSection] = useState<"page" | "site">("page");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#6d7175] mt-0.5 font-medium">Editable page text and general site content shown on the storefront</p>
      </div>
      <div className="flex gap-1 bg-[#f1f1f1] rounded-lg p-1 mb-5 w-fit">
        {([
          { key: "page" as const, label: "Page Text" },
          { key: "site" as const, label: "Site Content" },
        ]).map((s) => (
          <button type="button"
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              section === s.key ? "bg-white text-[#202223] shadow-sm" : "text-[#6d7175] hover:text-[#202223]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "page" ? <WebsiteContentSection /> : <ContentSection />}
    </div>
  );
}

function ShippingZonesEditor({ form, set }: { form: any; set: (key: string, value: any) => void }) {
  const zones: ShippingZone[] = Array.isArray(form.shippingZones) && form.shippingZones.length
    ? form.shippingZones
    : defaultShippingZones();

  // First edit on the defaults should actually persist them into the form,
  // not just display them — otherwise clicking Save before touching a zone
  // would save nothing and admin's next visit would silently reset.
  const ensureZonesInForm = () => {
    if (!Array.isArray(form.shippingZones) || !form.shippingZones.length) {
      set("shippingZones", zones);
    }
    return Array.isArray(form.shippingZones) && form.shippingZones.length ? form.shippingZones : zones;
  };

  const updateZone = (id: string, patch: Partial<ShippingZone>) => {
    const current = ensureZonesInForm();
    set("shippingZones", current.map((z: ShippingZone) => (z.id === id ? { ...z, ...patch } : z)));
  };

  const addZone = () => {
    const current = ensureZonesInForm();
    const id = `zone_${Date.now()}`;
    set("shippingZones", [...current, { id, name: "New Zone", rate: 99, states: [] }]);
  };

  const removeZone = (id: string) => {
    const current = ensureZonesInForm();
    set("shippingZones", current.filter((z: ShippingZone) => z.id !== id));
  };

  const assignedStates = new Set(zones.flatMap((z) => z.states));
  const unassigned = ALL_INDIAN_STATES.filter((s) => !assignedStates.has(s));

  return (
    <div className="space-y-4">
      <div className={`${card} p-5 space-y-1`}>
        <h3 className="text-sm font-bold text-[#202223]">Shipping Zones (state-based)</h3>
        <p className="text-xs text-[#6d7175]">
          Each zone is a flat shipping rate for the states listed in it — set a rate to ₹0 for free shipping (Tamil Nadu &amp; Puducherry by default).
          A state can only belong to one zone; move it by removing it from its current zone's list and adding it to another.
        </p>
      </div>

      {zones.map((zone) => (
        <div key={zone.id} className={`${card} p-4 space-y-3`}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-[#8c9196] block mb-1 font-medium">Zone Name</label>
              <input
                value={zone.name}
                onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="w-36">
              <label className="text-[11px] text-[#8c9196] block mb-1 font-medium">Rate (₹)</label>
              <input
                type="number"
                min={0}
                value={zone.rate}
                onChange={(e) => updateZone(zone.id, { rate: Number(e.target.value) || 0 })}
                className={inputCls}
              />
            </div>
            <button type="button"
              onClick={() => removeZone(zone.id)}
              className="mt-5 text-[#8c9196] hover:text-red-600 p-2 rounded-lg hover:bg-red-50 shrink-0"
              title="Delete zone"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div>
            <label className="text-[11px] text-[#8c9196] block mb-1 font-medium">
              States in this zone (comma separated — must match spelling in the checkout dropdown)
            </label>
            <textarea
              value={zone.states.join(", ")}
              onChange={(e) =>
                updateZone(zone.id, { states: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
              rows={2}
              className={inputCls}
              placeholder="Tamil Nadu, Puducherry"
            />
          </div>
        </div>
      ))}

      <button type="button" onClick={addZone} className={btnSecondary}>+ Add Zone</button>

      <div className={`${card} p-4`}>
        <label className="text-[11px] text-[#8c9196] block mb-1 font-medium">
          Fallback Rate (₹) — charged for any state not listed in a zone above
        </label>
        <input
          type="number"
          min={0}
          value={form.shippingFallbackRate ?? DEFAULT_FALLBACK_SHIPPING_RATE}
          onChange={(e) => set("shippingFallbackRate", Number(e.target.value) || 0)}
          className={`${inputCls} max-w-[10rem]`}
        />
        {unassigned.length > 0 && (
          <p className="text-[11px] text-[#8c9196] mt-2">
            Not yet assigned to any zone (will use the fallback rate): {unassigned.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function ContentSection() {
  const { showToast } = useToast();
  const [sub, setSub] = useState<(typeof CONTENT_SUBTABS)[number]>("Branding");
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoadingSettings(true);
    setLoadError("");
    try {
      const s = await api.getAuth("/api/settings/admin");
      setSettings(s || {});
      setForm(s || {});
    } catch (err: any) {
      setLoadError(err.message || "Couldn't load store content");
    } finally {
      setLoadingSettings(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const save = async () => {
    if (loadingSettings || loadError || saving) return;
    setSaving(true);
    try {
      await saveChangedSettings(settings, { ...settings, ...form });
      setSettings((s: any) => ({ ...s, ...form }));
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
    } catch (err: any) {
      setSavedMsg(false);
      showToast(err.message || "Couldn't save store content. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.upload(file);
      set("logoUrl", res.url);
    } catch (err: any) {
      showToast(err.message || "Couldn't upload the logo", "error");
    } finally {
      setUploading(false);
    }
  };

  const Field = ({ label, k }: { label: string; k: string }) => (
    <div>
      <label className="text-xs text-[#6d7175] block mb-1 font-medium">{label}</label>
      <input value={form[k] || ""} onChange={(e) => set(k, e.target.value)} className={inputCls} />
    </div>
  );

  if (loadingSettings) return <p role="status" className="text-sm text-[#6d7175]">Loading store content...</p>;
  if (loadError) return <AdminLoadError message={loadError} retry={load} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {CONTENT_SUBTABS.map((s) => (
          <button type="button"
            key={s}
            onClick={() => setSub(s)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${sub === s ? "btn-liquid-dark" : "text-[#6d7175] hover:bg-[#f6f6f7]"}`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {savedMsg && <span className="text-xs text-green-600 font-semibold">Saved ✓</span>}
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      {sub === "Branding" && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Logo Text", k: "logoText" })}
            {Field({ label: "Tagline", k: "tagline" })}
          </div>
          <div>
            <label className="text-xs text-[#6d7175] block mb-1 font-medium">Logo Image</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} className="text-[#6d7175] text-sm" />
            {uploading && <p className="text-xs text-[#8c9196] mt-1">Uploading...</p>}
            {form.logoUrl && <img src={api.imageUrl(form.logoUrl)} className="w-16 h-16 mt-2 rounded-lg border border-[#e1e3e5] object-contain bg-[#f6f6f7]" />}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {Field({ label: "Contact Phone", k: "contactPhone" })}
            {Field({ label: "Contact Email", k: "contactEmail" })}
            {Field({ label: "Address", k: "contactAddress" })}
          </div>
          {Field({ label: "Footer Disclaimer", k: "footerDisclaimer" })}
        </div>
      )}

      {sub === "Social & Chat" && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Instagram URL", k: "instagramUrl" })}
            {Field({ label: "Facebook URL", k: "facebookUrl" })}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "WhatsApp Number (with country code)", k: "whatsappNumber" })}
            {Field({ label: "YouTube URL (optional)", k: "youtubeUrl" })}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Instagram Followers (shown on About Us, e.g. 12.5K)", k: "instagramFollowers" })}
            {Field({ label: "YouTube Subscribers (shown on About Us, e.g. 3.2K)", k: "youtubeSubscribers" })}
          </div>
          <div>
            <label className="text-xs text-[#6d7175] block mb-1 font-medium">WhatsApp Floating Button — Default Message</label>
            <textarea
              value={form.whatsappMessage || ""}
              onChange={(e) => set("whatsappMessage", e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Hi 3DCaseMakers! I'd like to know more about your products."
            />
            <p className="text-[11px] text-[#8c9196] mt-1">Pre-filled text that opens with the storefront's floating WhatsApp button.</p>
          </div>
        </div>
      )}

      {sub === "Store Config" && <ShippingZonesEditor form={form} set={set} />}

      {sub === "SEO Tools" && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="grid md:grid-cols-2 gap-4">
            {Field({ label: "Homepage SEO Title", k: "seoHomeTitle" })}
            {Field({ label: "Homepage SEO Keywords (comma separated)", k: "seoHomeKeywords" })}
          </div>
          <div>
            <label className="text-xs text-[#6d7175] block mb-1 font-medium">Homepage Meta Description</label>
            <textarea value={form.seoHomeDescription || ""} onChange={(e) => set("seoHomeDescription", e.target.value)} rows={2} className={inputCls} />
          </div>
          <p className="text-xs text-[#8c9196]">
            These override the default homepage SEO tags. Product and collection pages generate their own SEO tags automatically from their title/description.
          </p>
        </div>
      )}
    </div>
  );
}

