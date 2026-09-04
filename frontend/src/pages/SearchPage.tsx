import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../utils/api";
import { Product } from "../types";
import ProductCard from "../components/ProductCard";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api.get("/api/products").then(setProducts).catch(() => {});
  }, []);

  const results = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-10">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Search results for "{q}"</h1>
      {results.length === 0 ? (
        <p className="text-zinc-400">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {results.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
