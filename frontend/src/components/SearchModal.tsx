import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { X, Search } from "lucide-react";
import { api } from "../utils/api";
import { Product } from "../types";

// Feature 4: popup search overlay with live results preview
export default function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && allProducts.length === 0) {
      api.get("/api/products").then(setAllProducts).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const term = q.trim().toLowerCase();
    setResults(
      allProducts
        .filter((p) => p.title.toLowerCase().includes(term) || p.tags?.some((t) => t.toLowerCase().includes(term)))
        .slice(0, 6)
    );
  }, [q, allProducts]);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative glass-strong w-full max-w-xl rounded-3xl overflow-hidden">
        <form onSubmit={submit} className="flex items-center gap-3 px-5 py-4 border-b border-white/50">
          <Search size={20} className="text-zinc-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for phone cases, brands, models..."
            className="flex-1 outline-none text-zinc-900 bg-transparent"
          />
          <button type="button" onClick={onClose}><X size={20} className="text-zinc-400" /></button>
        </form>
        {results.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => { navigate(`/product/${p.id}`); onClose(); setQ(""); }}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/60 text-left transition-colors"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-50 shrink-0">
                  {p.images?.[0] && <img src={api.thumbUrl(p.images[0], 160)} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
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
