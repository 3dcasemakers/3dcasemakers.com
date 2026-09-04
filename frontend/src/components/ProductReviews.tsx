import { useEffect, useState } from "react";
import { Star, Upload, X } from "lucide-react";
import { api } from "../utils/api";

interface ProductReview {
  id: string;
  name: string;
  rating: number;
  comment: string;
  image?: string;
  created_at: string;
}

function Stars({ rating, size = "w-4 h-4" }: { rating: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${size} ${i < rating ? "fill-blue-400 text-blue-400" : "text-zinc-200"}`} />
      ))}
    </div>
  );
}

function WriteProductReviewForm({ productId, onSubmitted }: { productId: string; onSubmitted: () => void }) {
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
      await api.post(`/api/reviews/${productId}`, { name: name.trim(), rating, comment: comment.trim(), image });
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
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white text-xs font-bold px-4 py-2.5 hover:bg-zinc-800 transition"
      >
        <Star className="w-3.5 h-3.5 fill-white" /> Write a Review
      </button>
    );
  }

  if (done) {
    return (
      <div className="max-w-md glass-card rounded-2xl p-5">
        <p className="text-sm font-bold text-zinc-900 mb-1">Thanks for the review!</p>
        <p className="text-xs text-zinc-500">It'll appear here once our team approves it.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md glass-card rounded-2xl p-5">
      <h3 className="text-sm font-black text-zinc-900 mb-4">Write a Review</h3>
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
            placeholder="Tell us about the case..."
            rows={3}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1 font-medium">Photo (optional)</label>
          {image ? (
            <div className="relative w-20 h-20">
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
            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 cursor-pointer border border-dashed border-zinc-300 rounded-lg px-3 py-2 w-fit hover:bg-zinc-50">
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
        <div className="flex gap-3 pt-1">
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

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  const load = () => {
    api.get(`/api/reviews/${productId}`).then(setReviews).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const avg = reviews.length ? reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length : 0;

  return (
    <div className="lg:col-span-12 mt-6 pt-8 border-t border-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black text-zinc-900 uppercase tracking-tight">Customer Reviews</h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <Stars rating={Math.round(avg)} />
              <span className="text-xs text-zinc-500 font-medium">
                {avg.toFixed(1)} out of 5 ({reviews.length} review{reviews.length === 1 ? "" : "s"})
              </span>
            </div>
          )}
        </div>
        <WriteProductReviewForm productId={productId} onSubmitted={load} />
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">No reviews yet — be the first to review this product.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <div key={r.id} className="glass-card rounded-2xl p-5">
              {r.image && (
                <img
                  src={api.imageUrl(r.image)}
                  alt={`${r.name}'s review`}
                  className="w-full h-40 object-cover rounded-xl mb-3"
                  loading="lazy"
                />
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-zinc-900">{r.name}</span>
                <Stars rating={r.rating} size="w-3.5 h-3.5" />
              </div>
              {r.comment && <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line">{r.comment}</p>}
              <p className="text-[11px] text-zinc-400 mt-2">
                {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
