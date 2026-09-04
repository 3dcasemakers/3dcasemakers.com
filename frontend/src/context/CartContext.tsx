import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router";
import { CartItem, Product } from "../types";
import { trackAddToCart } from "../utils/metaPixel";
import { useOffers, getBestOffer, getNextOffer, Offer } from "../utils/useOffers";

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, selectedModel: string, quantity?: number, customImage?: string, customName?: string, customVariant?: string, customImage2?: string, customName2?: string, customImage3?: string, customName3?: string) => void;
  removeItem: (productId: string, selectedModel: string) => void;
  updateQuantity: (productId: string, selectedModel: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  discount: number;
  appliedOffer: Offer | null;
  nextOffer: Offer | null;
  itemsToNextOffer: number;
  total: number;
  count: number;
  // Retired slide-in drawer - kept for API compatibility, always false now
  // (see openDrawer note in CartProvider: every cart entry point goes to
  // the full /cart page instead).
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "3dcasemakers_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Feature 3 (the slide-in side-cart drawer) is retired per Hari: every
  // "cart" entry point - the navbar icon, the mobile bottom-tab, and
  // Add to Cart itself - now always lands on the full /cart page instead of
  // a partial overlay, so the customer always sees the complete, detailed
  // cart (offers, "You may also like", everything) no matter how they got
  // there. isDrawerOpen/closeDrawer stay in the context shape so nothing
  // else has to change, but nothing sets isDrawerOpen true anymore.
  const navigate = useNavigate();
  const isDrawerOpen = false;
  const openDrawer = () => {
    // Guard against pushing a duplicate /cart history entry (e.g. quick-add
    // from a product already sitting on the cart page) — that would make
    // the back button need an extra press to leave, the exact bug already
    // fixed once before.
    if (window.location.pathname !== "/cart") navigate("/cart");
  };
  const closeDrawer = () => {};

  const addItem = (product: Product, selectedModel: string, quantity = 1, customImage?: string, customName?: string, customVariant?: string, customImage2?: string, customName2?: string, customImage3?: string, customName3?: string) => {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.product.id === product.id && i.selectedModel === selectedModel && i.customImage === customImage && i.customName === customName && i.customVariant === customVariant && i.customImage2 === customImage2 && i.customName2 === customName2 && i.customImage3 === customImage3 && i.customName3 === customName3
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { product, selectedModel, quantity, customImage, customName, customVariant, customImage2, customName2, customImage3, customName3 }];
    });
    trackAddToCart({ productId: product.id, productName: product.title, price: product.price, quantity });
    // Deliberately does NOT navigate here — Buy Now and the checkout
    // upsell's quick-add both call addItem too, and neither should get
    // yanked onto the /cart page mid-flow. The explicit "Add to Cart"
    // button (ProductPage) calls openDrawer itself right after this.
  };

  const removeItem = (productId: string, selectedModel: string) => {
    setItems((prev) => prev.filter((i) => !(i.product.id === productId && i.selectedModel === selectedModel)));
  };

  const updateQuantity = (productId: string, selectedModel: string, quantity: number) => {
    if (quantity <= 0) return removeItem(productId, selectedModel);
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId && i.selectedModel === selectedModel ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => setItems([]);

  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  // Automatic "Buy X, Get ₹Y off" discount — driven by Admin -> Discounts.
  const offers = useOffers();
  const appliedOffer = getBestOffer(offers, count);
  const discount = appliedOffer ? Math.min(appliedOffer.discountAmount, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);
  // "Add N more to get ₹Y off" nudge — the next live offer not yet reached.
  const nextOffer = getNextOffer(offers, count);
  const itemsToNextOffer = nextOffer ? nextOffer.minQty - count : 0;

  // Fires a "Congrats, you saved ₹X" popup the moment the cart newly
  // qualifies for a discount (or jumps to a bigger one), not on every render.
  const prevOfferIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevOfferIdRef.current;
    const nextId = appliedOffer?.id || null;
    if (nextId && nextId !== prevId) {
      window.dispatchEvent(
        new CustomEvent("3dcasemakers:offer-applied", {
          detail: { amount: discount, label: appliedOffer?.badgeText || "" },
        })
      );
    }
    prevOfferIdRef.current = nextId;
  }, [appliedOffer?.id, discount]);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, subtotal, discount, appliedOffer, nextOffer, itemsToNextOffer, total, count, isDrawerOpen, openDrawer, closeDrawer }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
