import { Link } from "react-router";
import { Star } from "lucide-react";
import { Product } from "../types";
import { api } from "../utils/api";
import { toTitleCase } from "../utils/textFormat";

export default function ProductCard({ product }: { product: Product }) {
  // Listing thumbnails only support photos — if the admin put a video first,
  // fall back to the first actual photo so the card never shows broken art.
  const img = (product.images || []).find((i) => !/\.(mp4|webm|mov)$/i.test(i || ""));
  const hasDiscount = product.comparePrice && product.comparePrice > product.price;
  const discountPct = hasDiscount ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100) : 0;
  const rating = product.rating || 0;
  const reviewsCount = product.reviewsCount || 0;

  return (
    <Link
      to={`/product/${product.id}`}
      className="group bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-md transition-all rounded-sm overflow-hidden flex flex-col"
    >
      <div className="relative bg-white flex items-center justify-center aspect-square overflow-hidden">
        {hasDiscount && (
          <span className="absolute top-0 left-0 z-10 bg-[var(--brand-accent,#000000)] text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-1">
            {discountPct}% Off
          </span>
        )}
        {!hasDiscount && product.isBestSeller && (
          <span className="absolute top-0 left-0 z-10 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
            Best Seller
          </span>
        )}
        {!hasDiscount && product.isTrending && (
          <span className="absolute top-0 left-0 z-10 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
            Trending
          </span>
        )}
        {!hasDiscount && product.isNewArrival && !product.isBestSeller && !product.isTrending && (
          <span className="absolute top-0 left-0 z-10 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1">
            New Arrival
          </span>
        )}

        {img ? (
          <img
            src={api.thumbUrl(img, 480)}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
            onError={(e) => {
              const el = e.currentTarget;
              el.onerror = null;
              el.style.display = "none";
              el.parentElement?.insertAdjacentHTML(
                "beforeend",
                '<div class="w-full h-full flex items-center justify-center text-zinc-400 text-sm">No image</div>'
              );
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">No image</div>
        )}
      </div>

      <div className="p-2 sm:p-3.5 border-t border-zinc-100">
        {rating > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
            <span className="text-[10px] sm:text-xs font-bold text-zinc-800">{rating.toFixed(1)}</span>
            {reviewsCount > 0 && <span className="text-[10px] sm:text-xs text-zinc-400">| {reviewsCount}</span>}
          </div>
        )}
        <h3 className="text-[11px] sm:text-sm text-zinc-800 font-semibold break-words whitespace-normal line-clamp-2">
          {toTitleCase(product.title)}
        </h3>
        <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 mt-1 sm:mt-1.5">
          <span className="text-zinc-900 font-bold text-sm sm:text-base">₹{product.price}</span>
          {hasDiscount && (
            <>
              <span className="text-zinc-400 text-[10px] sm:text-xs line-through">₹{product.comparePrice}</span>
              <span className="text-emerald-700 text-[10px] sm:text-xs font-semibold">{discountPct}% off</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
