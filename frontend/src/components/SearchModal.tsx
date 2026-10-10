import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { X, Search } from "lucide-react";
import { api } from "../utils/api";
import { Product } from "../types";

// Feature 4: popup search overlay with live results preview
export default function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    api.get("/api/products")
      .then((data) => { if (alive) setAllProducts(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) setError(err.message || "Products could not be loaded."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, retry]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not([disabled]), a[href]");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  const term = q.trim().toLowerCase();
  const results = term ? allProducts.filter((p) => [p.title, p.brand, ...(p.tags || []), ...(p.models || [])]
    .some((value) => String(value || "").toLowerCase().includes(term))).slice(0, 6) : [];

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) {
      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      onClose();
      setQ("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-24 px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Search products" className="relative glass-strong w-full max-w-xl rounded-3xl overflow-hidden max-h-[calc(100dvh-6rem)] overflow-y-auto">
        <form onSubmit={submit} className="flex items-center gap-3 px-5 py-4 border-b border-white/50">
          <Search size={20} className="text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for phone cases, brands, models..."
            aria-label="Search by product, brand or phone model"
            className="flex-1 min-w-0 outline-none text-zinc-900 bg-transparent"
          />
          <button type="button" aria-label="Close search" onClick={onClose} className="shrink-0 p-2 rounded-full"><X size={20} className="text-zinc-400" /></button>
        </form>
        {loading ? <p className="px-5 py-4 text-sm text-zinc-500" role="status">Loading products…</p> : error ? (
          <div className="px-5 py-4 text-sm space-y-2" role="alert"><p className="text-red-600">{error}</p><button type="button" onClick={() => setRetry((v) => v + 1)} className="font-semibold underline">Try again</button></div>
        ) : term && !results.length ? <p className="px-5 py-4 text-sm text-zinc-500">No products found.</p> : results.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => { navigate(`/product/${p.id}`); onClose(); setQ(""); }}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/60 text-left transition-colors"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-50 shrink-0">
                  {p.images?.[0] && <img src={api.thumbUrl(p.images[0], 160)} alt={p.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{p.title}</p>
                  <p className="text-xs text-zinc-500">₹{p.price}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
