import { useEffect, useMemo, useState } from "react";
import { Star, Upload, X, SlidersHorizontal } from "lucide-react";
import { api } from "../utils/api";
import { setSEO } from "../utils/useSEO";
import { DEFAULT_TESTIMONIALS, Testimonial } from "../components/CustomerReviews";
import { RatingSummaryBadge, VerifiedBuyerTag } from "../components/ReviewBadge";
import ReviewStories from "../components/ReviewStories";
import { SiteReview } from "../types";

function WriteReviewForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.customerUpload(file);
      setImage(res.url);
    } catch {
      // silently ignore - photo is optional
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim() || !rating) return;
    setSubmitting(true);
    try {
      await api.post("/api/site-reviews", { name: name.trim(), rating, comment: comment.trim(), image });
      setDone(true);
      setName("");
      setComment("");
      setRating(5);
      setImage("");
      onSubmitted();
    } catch {
      // silently keep the form open so they can retry
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div className="text-center mb-10">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white text-sm font-bold px-5 py-2.5 hover:bg-zinc-800 transition"
        >
          <Star className="w-4 h-4 fill-white" /> Write a Review
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto mb-10 text-center glass-card rounded-2xl p-6">
        <p className="text-sm font-bold text-zinc-900 mb-1">Thanks for the review!</p>
        <p className="text-xs text-zinc-500">It'll appear here once our team approves it.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mb-10 glass-card rounded-2xl p-6">
      <h3 className="text-sm font-black text-zinc-900 mb-4 text-center">Write a Review</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1 font-medium">Your Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya S."
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1 font-medium">Rating</label>
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => {
              const val = i + 1;
              const filled = val <= (hoverRating || rating);
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHoverRating(val)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(val)}
                  aria-label={`${val} star`}
                >
                  <Star className={`w-6 h-6 ${filled ? "fill-blue-400 text-blue-400" : "text-zinc-200"}`} />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1 font-medium">Your Review</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us about your experience..."
            rows={3}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1 font-medium">Photo (optional)</label>
          {image ? (
            <div className="relative w-20 h-20 mx-auto">
              <img src={api.imageUrl(image)} alt="Your upload" className="w-20 h-20 object-cover rounded-lg border border-zinc-200" />
              <button
                type="button"
                onClick={() => setImage("")}
                className="absolute -top-2 -right-2 bg-white border border-zinc-200 rounded-full w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-red-500"
                title="Remove photo"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-1.5 text-xs font-bold text-zinc-900 cursor-pointer border border-dashed border-zinc-300 rounded-lg px-3 py-2 w-fit mx-auto hover:bg-zinc-50">
              <Upload size={13} />
              {uploading ? "Uploading..." : "Attach photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </label>
          )}
        </div>
        <div className="flex gap-3 justify-center pt-1">
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || uploading}
            className="rounded-full bg-zinc-900 text-white text-sm font-bold px-5 py-2 hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm font-semibold text-zinc-500 hover:underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Local view of a review card, tagged with where it came from so it can be
// filtered ("General" = storefront-wide /reviews submissions and admin
// testimonials, "Product" = reviews left on a specific product page) and
// sorted (newest first, or A-Z by reviewer name).
type ReviewItem = Testimonial & {
  type: "general" | "product";
  createdAt?: string;
};

type FilterOption = "all" | "general" | "product";
type SortOption = "latest" | "az";

export default function ReviewsPage() {
  const [settings, setSettings] = useState<any>({});
  const [publicReviews, setPublicReviews] = useState<SiteReview[]>([]);
  const [productReviews, setProductReviews] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sort, setSort] = useState<SortOption>("latest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadPublicReviews = () => {
    api.get("/api/site-reviews").then(setPublicReviews).catch(() => {});
  };

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
    loadPublicReviews();
    // ?limit=500 pulls the full approved product-review list (the default
    // /api/reviews call elsewhere only grabs 9 for homepage teasers).
    api.get("/api/reviews?limit=500").then(setProductReviews).catch(() => {});
  }, []);

  useEffect(() => {
    setSEO({
      title: "Customer Reviews | 3DCaseMakers",
      description: "See what 3DCaseMakers customers are saying about their custom phone cases and stickers.",
      url: "/reviews",
    });
  }, []);

  const adminTestimonials: ReviewItem[] = (
    settings?.siteTestimonials && settings.siteTestimonials.length ? settings.siteTestimonials : []
  ).map((t: Testimonial) => ({ ...t, type: t.productTitle ? "product" : "general" }));

  // General reviews: customer submissions from this page's own "Write a
  // Review" form, approved by admin.
  const submitted: ReviewItem[] = publicReviews.map((r) => ({
    id: r.id,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    image: r.image,
    type: "general",
    createdAt: r.createdAt,
  }));

  // Product reviews: approved reviews left on individual product pages.
  const productList: ReviewItem[] = productReviews.map((r) => ({
    id: r.id,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    image: r.image,
    productTitle: r.product_title,
    type: "product",
    createdAt: r.created_at,
  }));

  const combined: ReviewItem[] =
    adminTestimonials.length || submitted.length || productList.length
      ? [...submitted, ...productList, ...adminTestimonials]
      : DEFAULT_TESTIMONIALS.map((t) => ({ ...t, type: "general" as const }));

  const filtered = useMemo(
    () => (filter === "all" ? combined : combined.filter((t) => t.type === filter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, publicReviews, productReviews, settings]
  );

  const list: ReviewItem[] = useMemo(() => {
    const arr = [...filtered];
    if (sort === "az") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);

  const avg = combined.length
    ? (combined.reduce((s, t) => s + (t.rating || 5), 0) / combined.length).toFixed(1)
    : "5.0";

  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: "all", label: "All Reviews" },
    { value: "general", label: "General Reviews" },
    { value: "product", label: "Product Reviews" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-12 sm:py-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl md:text-3xl tracking-tight font-black text-zinc-900 uppercase">
          What Our Customers Say
        </h1>
        <div className="flex items-center justify-center mt-4">
          <RatingSummaryBadge average={avg} count={combined.length} />
        </div>
      </div>

      <ReviewStories />

      <WriteReviewForm onSubmitted={loadPublicReviews} />

      <div className="max-w-6xl mx-auto mb-6">
        {/* Mobile: compact toggle that reveals the filter/sort bar so it never
            crowds the header on small screens. Desktop: bar is always visible. */}
        <div className="flex sm:hidden justify-center mb-3">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 border border-zinc-200 rounded-full px-3.5 py-1.5"
          >
            <SlidersHorizontal size={13} />
            Filter & Sort
          </button>
        </div>

        <div
          className={`${
            filtersOpen ? "flex" : "hidden"
          } sm:flex flex-col sm:flex-row items-center sm:items-center justify-center gap-3 sm:gap-4`}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`text-xs font-bold rounded-full px-3.5 py-1.5 border transition ${
                  filter === opt.value
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="review-sort" className="text-xs font-semibold text-zinc-400">
              Sort by
            </label>
            <select
              id="review-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="text-xs font-bold text-zinc-700 border border-zinc-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:border-zinc-400"
            >
              <option value="latest">Latest</option>
              <option value="az">A-Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {list.map((t) => (
          <div key={t.id} className="glass-card rounded-2xl p-5">
            {t.image && (
              <img
                src={api.imageUrl(t.image)}
                alt={`${t.name}'s review`}
                className="w-full h-48 object-cover rounded-xl mb-3"
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
              {t.productTitle && <VerifiedBuyerTag />}
            </div>
            {t.productTitle && (
              <span className="mt-1.5 inline-block text-[10px] font-semibold text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-full px-2 py-0.5 truncate max-w-full">
                {t.productTitle}
              </span>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="col-span-full text-center text-sm text-zinc-400">
            {filter === "general" ? "No general reviews yet." : filter === "product" ? "No product reviews yet." : "No reviews yet."}
          </p>
        )}
      </div>
    </div>
  );
}
