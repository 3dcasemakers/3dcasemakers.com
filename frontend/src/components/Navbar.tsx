import { Link, useNavigate, useLocation } from "react-router";
import { createPortal } from "react-dom";
import { ShoppingCart, Menu, X, Home as HomeIcon, LayoutGrid, Truck, Info, Phone, ChevronRight, HelpCircle, Star, FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import BrandLogo from "./BrandLogo";
import SearchModal from "./SearchModal";

// Left-hand utility strip — mirrors the "Contact Us | FAQ's | Track Order" row
const UTILITY_ITEMS = [
  { label: "Home", path: "/", icon: HomeIcon },
  { label: "Collections", path: "/collections", icon: LayoutGrid },
  { label: "Reviews", path: "/reviews", icon: Star },
  { label: "Contact Us", path: "/contact", icon: Phone },
  { label: "FAQ's", path: "/faqs", icon: HelpCircle },
  { label: "Track Order", path: "/track-order", icon: Truck },
];

const MOBILE_MENU_ITEMS = [
  { label: "Home", path: "/", icon: HomeIcon },
  { label: "Collections", path: "/collections", icon: LayoutGrid },
  { label: "Reviews", path: "/reviews", icon: Star },
  { label: "Track Order", path: "/track-order", icon: Truck },
  { label: "About Us", path: "/about-us", icon: Info },
  { label: "Contact", path: "/contact", icon: Phone },
  { label: "Shipping Policy", path: "/policy/shipping", icon: FileText },
  { label: "Terms & Conditions", path: "/policy/terms", icon: FileText },
  { label: "Privacy Policy", path: "/policy/privacy", icon: FileText },
  { label: "Cancellations & Refunds", path: "/policy/returns", icon: FileText },
];

function isMenuItemActive(itemPath: string, pathname: string) {
  if (itemPath === "/") return pathname === "/";
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

export default function Navbar({ collections }: { collections: { name: string; slug: string }[] }) {
  const { count, openDrawer } = useCart();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Lets the mobile bottom tab bar's "Menu" tab trigger this same popup,
  // instead of duplicating the menu markup in two places.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("3dcasemakers:open-mobile-menu", handler);
    return () => window.removeEventListener("3dcasemakers:open-mobile-menu", handler);
  }, []);

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-40 w-full bg-white/70 backdrop-blur-xl backdrop-saturate-150 border-b border-white/60 shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_30px_-12px_rgba(0,0,0,0.15)]">
      {/* Row 1: utility links | brand | login + cart */}
      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-10 lg:px-16 flex items-center justify-between h-[68px] gap-3">
        {/* Left */}
        <div className="flex items-center gap-1">
          <button
            className="lg:hidden text-zinc-800 w-10 h-10 rounded-full flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          {/* Desktop: logo sits on the left instead of the hamburger */}
          <Link to="/" aria-label="3DCaseMakers" className="hidden lg:flex items-center">
            <BrandLogo markClassName="h-9 w-9" textClassName="hidden" gap="gap-0" />
          </Link>
        </div>

        {/* Center (mobile only): brand lockup, dead-center while the hamburger owns the left */}
        <Link
          to="/"
          aria-label="3DCaseMakers"
          className="lg:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          <BrandLogo markClassName="h-9 w-9 sm:h-10 sm:w-10" textClassName="hidden" gap="gap-0" />
        </Link>

        {/* Center (desktop only): nav links, with the current page underlined */}
        <nav className="hidden lg:flex items-center gap-8 text-[15px] font-semibold text-zinc-700 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {UTILITY_ITEMS.map((item) => {
            const active = isMenuItemActive(item.path, location.pathname);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative pb-1 transition-colors hover:text-[var(--brand-primary)] ${active ? "text-[var(--brand-primary)]" : ""}`}
              >
                {item.label}
                {active && <span className="absolute left-0 right-0 -bottom-0.5 h-[2px] bg-[var(--brand-primary)] rounded-full" />}
              </Link>
            );
          })}
        </nav>

        {/* Right */}
        <div className="flex items-center justify-end gap-2 sm:gap-4">
          {/* Search bar (replaces the old search icon-only button). Acts as a
             trigger that opens the full SearchModal, so typing UX/results
             stay driven by that component. */}
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="flex items-center gap-2 sm:bg-zinc-100 sm:hover:bg-zinc-200 sm:active:bg-zinc-300 text-zinc-700 sm:text-zinc-500 rounded-full h-10 pl-0 sm:pl-3.5 pr-0 sm:pr-3 md:pr-4 w-10 sm:w-40 md:w-56 lg:w-64 justify-center sm:justify-start transition-all duration-200 overflow-hidden"
          >
            <Search size={18} strokeWidth={2} className="shrink-0" />
            <span className="hidden sm:inline text-sm font-medium truncate">Search products...</span>
          </button>
          <button onClick={openDrawer} className="relative text-zinc-800 w-10 h-10 rounded-full flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200" aria-label="Cart">
            <ShoppingCart size={22} strokeWidth={1.75} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-[var(--brand-primary)] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>

    <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

    {open && createPortal(
      <div className="fixed inset-0 z-[100] lg:hidden font-sans flex items-center justify-center p-5">
        <div
          className="absolute inset-0 bg-neutral-950/60 transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
        <div
          className="relative w-full max-w-[19rem] max-h-[70vh] bg-white shadow-2xl flex flex-col rounded-3xl overflow-hidden"
          style={{ animation: "popupIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <BrandLogo markClassName="h-8 w-8" textClassName="text-sm" gap="gap-1.5" />
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer border border-transparent hover:border-zinc-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
            {MOBILE_MENU_ITEMS.map((item) => {
              const active = isMenuItemActive(item.path, location.pathname);
              return (
                <button
                  key={item.label}
                  onClick={() => { setOpen(false); navigate(item.path); }}
                  className={`flex items-center px-3.5 py-2.5 rounded-2xl text-left cursor-pointer border-none transition-all ${
                    active ? "bg-[var(--brand-primary)] text-white" : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <span className="flex-1 font-bold text-xs uppercase tracking-wide">{item.label}</span>
                  <ChevronRight size={14} className={active ? "text-white/70" : "text-zinc-300"} />
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-zinc-100">
            <p className="text-[9px] text-zinc-400 text-center uppercase tracking-widest font-bold">
              Products That Tell Your Story
            </p>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
