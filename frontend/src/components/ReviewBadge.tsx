import { Star, BadgeCheck } from "lucide-react";

// A premium, self-branded rating summary — deliberately its own visual identity
// (not a copy of Google's review badge/logo) so it never misrepresents these as
// pulled from a third-party platform. If 3DCaseMakers has a real Google Business
// profile, wire real data in via the Google Places API instead of styling this
// to look like Google's badge.
export function RatingSummaryBadge({ average, count }: { average: string | number; count: number }) {
  return (
    <div className="inline-flex items-center gap-3 glass-card rounded-2xl px-5 py-3">
      <div className="flex flex-col items-center leading-none">
        <span className="text-2xl font-black text-zinc-900">{average}</span>
        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">out of 5</span>
      </div>
      <div className="h-9 w-px bg-zinc-200" />
      <div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${i < Math.round(Number(average)) ? "fill-blue-400 text-blue-400" : "text-zinc-200"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
          <span className="text-[11px] font-bold text-zinc-500">{count} verified reviews</span>
        </div>
      </div>
    </div>
  );
}

// Small pill shown on each review card. Only appears for reviews with a
// linked product/order context so it never claims to verify a review that
// isn't actually tied to a purchase.
export function VerifiedBuyerTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--brand-primary)] bg-[var(--brand-primary-soft)] rounded-full px-2 py-0.5">
      <BadgeCheck className="w-3 h-3" />
      Verified Buyer
    </span>
  );
}
