import { useEffect, useRef, useState } from "react";
import { Star, BadgeCheck } from "lucide-react";
import { api } from "../utils/api";
import { Testimonial } from "./CustomerReviews";

// Compact, horizontally-scrollable reviews strip shown on Checkout right
// below PaymentTrustBanner — one more bit of social proof exactly where
// payment doubts happen.
//
// Pulls from ALL THREE review sources on the site and merges them:
//  1. `testimonials` prop — the admin-curated general reviews (Admin ->
//     Website Content -> Customer Reviews), same ones CartPage/Home use.
//  2. GET /api/reviews — real reviews customers submitted themselves on a
//     product page (the "Write a Review" form), already approved by admin.
//  3. GET /api/site-reviews — general (not product-specific) reviews
//     customers submitted on the storefront /reviews page, already
//     approved by admin.
// Either way, only entries with BOTH a photo and written text are shown,
// since that combo is what this compact card format needs.
export default function CheckoutReviewsStrip({ testimonials }: { testimonials?: Testimonial[] }) {
  const [customerReviews, setCustomerReviews] = useState<Testimonial[]>([]);
  const [siteReviews, setSiteReviews] = useState<Testimonial[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0); // 0 = start, 1 = end
  const [canScroll, setCanScroll] = useState(false);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScroll(max > 4);
    setScrollProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0);
  };

  useEffect(() => {
    api
      .get("/api/reviews?limit=50")
      .then((rows: any[]) => {
        setCustomerReviews(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            rating: r.rating,
            comment: r.comment,
            image: r.image,
            productTitle: r.product_title,
          }))
        );
      })
      .catch(() => {});

    api
      .get("/api/site-reviews")
      .then((rows: any[]) => {
        setSiteReviews(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            rating: r.rating,
            comment: r.comment,
            image: r.image,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const merged = [...(testimonials || []), ...customerReviews, ...siteReviews];
  const list = merged.filter((t) => t.image && t.comment && t.comment.trim());

  useEffect(() => {
    // Re-check scrollability once the list (and thus card widths) settle.
    const id = requestAnimationFrame(handleScroll);
    return () => cancelAnimationFrame(id);
  }, [list.length]);

  if (list.length === 0) return null;

  const avg = (list.reduce((s, t) => s + (t.rating || 5), 0) / list.length).toFixed(1);

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-black text-zinc-900">What Our Customers Say</h3>
        <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1 shrink-0">
          <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400" />
          <span className="text-xs font-black text-zinc-900">{avg}/5</span>
          <span className="text-[10px] font-medium text-zinc-500 whitespace-nowrap">from {list.length}+ reviews</span>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-0.5 px-0.5 no-scrollbar"
      >
        {list.map((t, i) => (
          <div
            key={`${t.id}-${i}`}
            className="snap-start shrink-0 basis-[47%] sm:basis-[220px] glass-card rounded-2xl p-3"
          >
            <div className="w-full aspect-[1/2] rounded-xl mb-2.5 overflow-hidden bg-white flex items-center justify-center">
              <img
                src={api.imageUrl(t.image!)}
                alt={`${t.name}'s review`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="flex items-center gap-1 mb-1.5 min-w-0">
              <p className="text-xs font-bold text-zinc-900 truncate">{t.name}</p>
              <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
            </div>
            <div className="flex items-center gap-0.5 mb-1.5">
              {Array.from({ length: 5 }).map((_, i2) => (
                <Star key={i2} className={`w-3 h-3 ${i2 < t.rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"}`} />
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 leading-snug line-clamp-3">{t.comment}</p>
          </div>
        ))}
      </div>

      {/* Scroll indicator — a track with a moving thumb showing how far you've scrolled */}
      {canScroll && (
        <div className="mt-2 mx-0.5 h-1 rounded-full bg-zinc-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--brand-primary)] transition-[width,transform] duration-150 ease-out"
            style={{
              width: "35%",
              transform: `translateX(${scrollProgress * (100 / 0.35 - 100)}%)`,
            }}
          />
        </div>
      )}
    </section>
  );
}
