import { Link } from "react-router";
import { Star } from "lucide-react";
import { api } from "../utils/api";
import { RatingSummaryBadge, VerifiedBuyerTag } from "./ReviewBadge";

export type Testimonial = {
  id: string;
  name: string;
  rating: number;
  comment: string;
  // Optional photo attached to the review (e.g. a customer's WhatsApp screenshot
  // of the product, or a proof-of-purchase image) - uploaded by admin.
  image?: string;
  // Optional product name this review is about, shown as a small tag.
  productTitle?: string;
};

// Fallback testimonials shown until the store owner adds real ones from
// Admin -> Website Content -> Customer Reviews. Plain "Customer Reviews" —
// deliberately NOT presented as pulled from Google/Meta, since they aren't.
export const DEFAULT_TESTIMONIALS: Testimonial[] = [
  { id: "d1", name: "Priya S.", rating: 5, comment: "Case quality super ah irundhuchu, printing sharp and colours popped exactly like the preview." },
  { id: "d2", name: "Arun Kumar", rating: 5, comment: "Ordered a custom photo case, delivery was quick and packaging protected it well." },
  { id: "d3", name: "Divya Ramesh", rating: 4, comment: "Nice fit for my phone, sturdy build. Would've liked a few more colour options." },
  { id: "d4", name: "Karthik M", rating: 5, comment: "Great value for the price — been using it for weeks with zero fading." },
  { id: "d5", name: "Sneha Iyer", rating: 5, comment: "Loved the finish on the acrylic case, feels premium in hand." },
  { id: "d6", name: "Vignesh R", rating: 5, comment: "Fast shipping and the case matched what I designed exactly." },
  { id: "d7", name: "Meena Prakash", rating: 4, comment: "Good quality print, camera cutout was precise." },
  { id: "d8", name: "Suresh Babu", rating: 5, comment: "Ordered twice now, consistent quality both times." },
  { id: "d9", name: "Anitha K", rating: 5, comment: "Packaging was neat, case arrived without a scratch." },
  { id: "d10", name: "Rahul Nair", rating: 5, comment: "Sharp printing and the grip feels solid. Recommended." },
];

export default function CustomerReviews({ testimonials }: { testimonials?: Testimonial[] }) {
  const list = testimonials && testimonials.length ? testimonials : DEFAULT_TESTIMONIALS;
  const avg = (list.reduce((s, t) => s + (t.rating || 5), 0) / list.length).toFixed(1);

  return (
    <section className="mt-14">
      <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">
        Customer Reviews
      </h2>
      <div className="flex items-center justify-center mb-6">
        <RatingSummaryBadge average={avg} count={list.length} />
      </div>
      <div className="text-center mb-6">
        <Link to="/reviews" className="text-xs font-bold text-[var(--brand-primary)] hover:underline">
          View all reviews
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {list.map((t) => (
          <div key={t.id} className="glass-card rounded-2xl p-5">
            {t.image && (
              <img
                src={api.imageUrl(t.image)}
                alt={`${t.name}'s review`}
                className="w-full h-40 object-cover rounded-xl mb-3"
                loading="lazy"
              />
            )}
            <div className="flex items-center gap-0.5 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-3.5 h-3.5 ${i < t.rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"}`} />
              ))}
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">{t.comment}</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-zinc-900">{t.name}</p>
              <div className="flex items-center gap-1.5">
                {t.productTitle && <VerifiedBuyerTag />}
              </div>
            </div>
            {t.productTitle && (
              <span className="mt-1.5 inline-block text-[10px] font-semibold text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-full px-2 py-0.5 truncate max-w-full">
                {t.productTitle}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
