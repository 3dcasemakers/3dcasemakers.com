import { forwardRef } from "react";
import { Zap } from "lucide-react";
import { useOffers, getPrimaryDisplayOffer, useCountdown, pad2 } from "../utils/useOffers";

// Slim countdown strip shown right under the navbar on Home / Collections /
// Product pages. Driven by Admin -> Discounts -> Offers. Auto-hides if no
// offer is currently enabled/live.
//
// Height is NOT fixed: on narrow screens the content wraps to two lines, so
// this forwards its root ref out to App.tsx, which measures the real
// rendered height (ResizeObserver) and sizes the layout spacer to match —
// that's what keeps the AnnouncementBar/banners from sliding underneath it.
const OfferTimerBar = forwardRef<HTMLDivElement>((_props, ref) => {
  const offers = useOffers();
  const offer = getPrimaryDisplayOffer(offers);
  const countdown = useCountdown(offer?.endsAt || null);

  if (!offer) return null;

  return (
    <div ref={ref} className="fixed top-[68px] left-0 right-0 z-30 w-full bg-black border-b border-[var(--brand-accent,#000000)]/40">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-10 lg:px-16 py-2 sm:py-2.5 flex items-center justify-center sm:justify-between gap-2 sm:gap-3 flex-wrap text-center">
        {/* Left side: badge + offer text */}
        <span className="inline-flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 bg-[var(--brand-accent,#000000)] text-white text-[11px] sm:text-[13px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0">
            <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {offer.badgeText}
          </span>
          {offer.endsAt && (
            <span className="text-zinc-300 text-[11px] sm:text-[13px] font-bold shrink-0">
              Offer ends in
            </span>
          )}
        </span>

        {/* Right side: bigger countdown */}
        {offer.endsAt && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 sm:ml-auto">
            <TimeChip value={countdown.days} label="D" />
            <Colon />
            <TimeChip value={countdown.hours} label="H" />
            <Colon />
            <TimeChip value={countdown.minutes} label="M" />
            <Colon />
            <TimeChip value={countdown.seconds} label="S" />
          </div>
        )}
      </div>
    </div>
  );
});

OfferTimerBar.displayName = "OfferTimerBar";

export default OfferTimerBar;

function TimeChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 bg-white/10 border border-white/20 rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5">
      <span className="text-white font-black text-sm sm:text-lg tabular-nums">{pad2(value)}</span>
      <span className="text-white/60 text-[9px] sm:text-[11px] font-bold">{label}</span>
    </span>
  );
}

function Colon() {
  return <span className="text-white/50 font-black text-sm sm:text-lg">:</span>;
}
