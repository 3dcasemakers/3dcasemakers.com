import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";

// Listens for "3dcasemakers:offer-applied" (dispatched by CartContext the
// moment a discount newly kicks in) and shows a short congratulatory toast.
export default function OfferSavedPopup() {
  const [toast, setToast] = useState<{ amount: number; label: string } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { amount: number; label: string };
      if (!detail?.amount) return;
      setToast(detail);
    };
    window.addEventListener("3dcasemakers:offer-applied", handler);
    return () => window.removeEventListener("3dcasemakers:offer-applied", handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-[200] px-4 w-full max-w-sm animate-[popupIn_0.25s_cubic-bezier(0.16,1,0.3,1)]">
      <div className="flex items-center gap-3 bg-black text-white rounded-2xl shadow-2xl px-4 py-3.5 border border-blue-400/40">
        <span className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
          <PartyPopper className="w-4.5 h-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight text-white">Congrats! You've saved ₹{toast.amount}</p>
          <p className="text-[11px] text-blue-400 font-semibold mt-0.5 truncate">{toast.label}</p>
        </div>
        <button onClick={() => setToast(null)} className="text-white/50 hover:text-blue-400 shrink-0" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
