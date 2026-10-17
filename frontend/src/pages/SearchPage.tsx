import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../utils/api";
import { Product } from "../types";
import ProductCard from "../components/ProductCard";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api.get("/api/products")
      .then((data) => { if (alive) setProducts(Array.isArray(data) ? data : []); })
      .catch((err) => { if (alive) setError(err.message || "Products could not be loaded. Please try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);

  const term = q.trim().toLowerCase();
  const results = term ? products.filter((p) => [p.title, p.brand, ...(p.tags || []), ...(p.models || [])]
    .some((value) => String(value || "").toLowerCase().includes(term))) : [];

  return (
    <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-10">
      <h1 className="text-xl font-bold text-zinc-900 mb-6 break-words">{term ? `Search results for "${q.trim()}"` : "Search products"}</h1>
      {loading ? <p className="text-zinc-500" role="status">Loading products…</p> : error ? (
        <div role="alert" className="space-y-3">
          <p className="text-red-600">{error}</p>
          <button type="button" onClick={() => setRetry((v) => v + 1)} className="glass-btn-grey px-5 py-2.5 rounded-full text-sm font-semibold">Try again</button>
        </div>
      ) : !term ? <p className="text-zinc-500">Use the search bar to find products by name, brand, model or tag.</p> : results.length === 0 ? (
        <p className="text-zinc-400">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {results.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
