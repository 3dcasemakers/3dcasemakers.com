import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import { api } from "../utils/api";
import { Collection } from "../types";
import { Trash2, Minus, Plus, ShoppingCart, ShieldCheck, Truck, ArrowLeft, BadgeCheck, Zap } from "lucide-react";
import AboutUsSection from "../components/AboutUsSection";
import CustomerReviews from "../components/CustomerReviews";
import CheckoutReviewsStrip from "../components/CheckoutReviewsStrip";
import TrustBar from "../components/TrustBar";
import { toTitleCase } from "../utils/textFormat";

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, subtotal, discount, appliedOffer, nextOffer, itemsToNextOffer, total } = useCart();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<any>({});
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  // "Explore our collections" - shows every visible collection (not just
  // products) so the customer can keep browsing the whole catalogue from
  // the cart, same ordering as the rest of the storefront.
  useEffect(() => {
    api.get("/api/collections").then((all: Collection[]) => {
      setCollections(
        all
          .filter((c) => c.isVisible)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      );
    }).catch(() => {});
  }, []);

  if (items.length === 0) {
    return (
      <div>
        <TrustBar />
        <div className="max-w-3xl mx-auto px-6 sm:px-10 lg:px-20 py-24 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-100/60 flex items-center justify-center">
          <ShoppingCart className="w-8 h-8 text-zinc-300" />
        </div>
        <h1 className="text-lg font-black uppercase tracking-wide text-zinc-900">Your cart is empty</h1>
        <p className="text-zinc-400 text-sm mt-1.5">Add products from our collections</p>
        <Link
          to="/collections"
          className="inline-block mt-7 glass-btn-primary text-white font-black text-sm px-8 py-3.5 rounded-full"
        >
          Start Exploring
        </Link>
        <div className="mt-20 text-left space-y-14 max-w-[1600px] mx-auto">
          <AboutUsSection settings={settings} />
          <CustomerReviews testimonials={settings?.siteTestimonials} />
        </div>
        </div>
      </div>
    );
  }

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalSavings = items.reduce(
    (s, i) => s + Math.max(0, (i.product.comparePrice - i.product.price) * i.quantity),
    0
  );

  return (
    <div>
      <TrustBar />
      <div className="max-w-6xl mx-auto px-6 sm:px-10 lg:px-20 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link to="/collections" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-700 uppercase tracking-wide mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Continue shopping
          </Link>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">
            Your Cart <span className="text-zinc-400 font-bold text-lg">({totalItems} {totalItems === 1 ? "item" : "items"})</span>
          </h1>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => { if (confirm("Remove all items from your cart?")) clearCart(); }}
            className="text-[11px] font-bold text-zinc-400 hover:text-red-500 uppercase tracking-wide transition"
          >
            Clear cart
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => {
            const hasDiscount = item.product.comparePrice > item.product.price;
            return (
              <div key={item.product.id + item.selectedModel} className="flex gap-4 glass-card rounded-2xl p-4">
                <img
                  src={api.thumbUrl(item.product.images?.[0] || "", 160)}
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-24 rounded-xl object-cover bg-zinc-100/40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-zinc-900 font-bold text-sm leading-snug">{item.product.title}</h3>
                    <button
                      onClick={() => removeItem(item.product.id, item.selectedModel)}
                      aria-label="Remove item"
                      className="text-zinc-300 hover:text-red-500 transition shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {item.selectedModel && (
                    <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wide mt-1">{item.selectedModel}</p>
                  )}
                  {item.customImage && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {/\.(mp4|webm|mov)$/i.test(item.customImage) ? (
                        <video src={api.imageUrl(item.customImage)} className="w-6 h-6 rounded object-cover border border-white/60" muted />
                      ) : (
                        <img src={api.imageUrl(item.customImage)} className="w-6 h-6 rounded object-cover border border-white/60" />
                      )}
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">
                        Custom {/\.(mp4|webm|mov)$/i.test(item.customImage) ? "video" : "photo"} attached
                        {(item.customImage2 || item.customImage3) ? ` (+${[item.customImage2, item.customImage3].filter(Boolean).length} more)` : ""}
                      </span>
                    </div>
                  )}
                  {item.customName && (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1.5">Text 1: {item.customName}</p>
                  )}
                  {item.customName2 && (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1.5">Text 2: {item.customName2}</p>
                  )}
                  {item.customName3 && (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1.5">Text 3: {item.customName3}</p>
                  )}
                  {item.customVariant && (
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1.5">{item.customVariant}</p>
                  )}

                  <div className="flex items-end justify-between mt-3">
                    <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden">
                      <button
                        className="w-7 h-7 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 text-zinc-700 transition"
                        onClick={() => updateQuantity(item.product.id, item.selectedModel, item.quantity - 1)}
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-xs font-black text-zinc-900">{item.quantity}</span>
                      <button
                        className="w-7 h-7 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 text-zinc-700 transition"
                        onClick={() => updateQuantity(item.product.id, item.selectedModel, item.quantity + 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-zinc-900 font-black text-sm">₹{item.product.price * item.quantity}</p>
                      {hasDiscount && (
                        <p className="text-zinc-400 text-[11px] line-through">₹{item.product.comparePrice * item.quantity}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="glass-card rounded-2xl p-5 lg:sticky lg:top-28 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-900">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-zinc-500">
                <span>Subtotal ({totalItems} {totalItems === 1 ? "item" : "items"})</span>
                <span className="font-bold text-zinc-900">₹{subtotal}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex items-center justify-between text-emerald-600">
                  <span>You save</span>
                  <span className="font-bold">₹{totalSavings}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between gap-2 bg-emerald-500 rounded-xl px-3 py-2.5 shadow-sm shadow-emerald-500/30">
                  <span className="flex items-center gap-1.5 text-white font-black text-[11px] uppercase tracking-wide">
                    <BadgeCheck className="w-4 h-4 shrink-0" />
                    {appliedOffer?.badgeText} Applied
                  </span>
                  <span className="font-black text-white text-sm shrink-0">-₹{discount}</span>
                </div>
              )}
              {!appliedOffer && nextOffer && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 rounded-xl px-3 py-2.5">
                  <Zap className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-bold text-blue-800 leading-snug">
                    Add {itemsToNextOffer} more {itemsToNextOffer === 1 ? "product" : "products"} to get ₹{nextOffer.discountAmount} OFF!
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>
            </div>
            <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
              <span className="text-zinc-500 text-sm font-medium">Total</span>
              <span className="text-xl font-black text-zinc-900">₹{total}</span>
            </div>
            <button
              onClick={() => navigate("/checkout")}
              className="w-full glass-btn-gold font-black text-sm py-3.5 rounded-full"
            >
              Proceed to Checkout
            </button>
            <div className="flex items-center gap-4 justify-center pt-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
              <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Secure Payments</span>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Secure Checkout</span>
            </div>
          </div>
        </div>
      </div>

      {/* Same Instagram/WhatsApp reviews social-proof strip shown on Checkout —
          right above "Explore Our Collections" so cart-page visitors get the
          same trust nudge before they even reach checkout. */}
      <div className="mt-10 pt-8 border-t border-zinc-100">
        <CheckoutReviewsStrip testimonials={settings?.siteTestimonials} />
      </div>

      {collections.length > 0 && (
        <div className="mt-10 pt-8 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-zinc-900 uppercase tracking-tight">Explore Our Collections</h2>
            <Link to="/collections" className="text-xs font-bold text-zinc-900 border border-zinc-200 rounded-full px-3 py-1.5 hover:bg-zinc-50 whitespace-nowrap">
              View all →
            </Link>
          </div>
          <div className="flex gap-3.5 sm:gap-5 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {collections.map((c) => (
              <Link key={c.id} to={`/collections/${c.slug}`} className="group shrink-0 w-[110px] sm:w-[130px] snap-start flex flex-col items-center">
                <div
                  className={`aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-sm ${
                    c.isHighlighted ? "border-2 border-blue-400 ring-2 ring-blue-300/60" : "border border-zinc-200"
                  }`}
                >
                  {c.image ? (
                    <img src={api.thumbUrl(c.image, 320)} alt={toTitleCase(c.name)} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">{toTitleCase(c.name)}</div>
                  )}
                </div>
                <span className={`mt-2 text-[11px] sm:text-xs font-bold leading-snug text-center line-clamp-2 ${c.isHighlighted ? "text-blue-600" : "text-zinc-800"}`}>
                  {toTitleCase(c.name)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-20 space-y-14">
        <AboutUsSection settings={settings} />
        <CustomerReviews testimonials={settings?.siteTestimonials} />
      </div>
      </div>
    </div>
  );
}
