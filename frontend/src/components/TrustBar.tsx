import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../utils/api";

const DEFAULT_MESSAGES = [
  "Serving Customers Since 2018 💗",
  "📸 59K+ Instagram Followers",
  "❤️ 50,000+ Happy Customers",
  "📍 Based in Tamil Nadu Serving All India",
  "🚚 All India Fast Delivery",
];

const MAX_ITEMS = 5;

// Pixels the strip should travel per second — kept in sync with AnnouncementBar
// so the two scrolling bars feel consistent site-wide.
const PIXELS_PER_SECOND = 45;
const MIN_DURATION = 6;

// Scrolling "trust" strip shown on Cart + Checkout pages only, to reassure
// buyers right before they pay. Content comes from Admin -> Settings ->
// Website Widgets -> Trust Bar (up to 5 items). Falls back to sensible
// defaults if admin hasn't set anything yet. Can be fully hidden via
// trustBarEnabled.
export default function TrustBar() {
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [enabled, setEnabled] = useState(true);
  const [duration, setDuration] = useState(14);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s: any) => {
        if (Array.isArray(s.trustBarMessages) && s.trustBarMessages.length) {
          setMessages(s.trustBarMessages.filter((m: string) => m && m.trim()).slice(0, MAX_ITEMS));
        }
        setEnabled(s.trustBarEnabled !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!trackRef.current) return;
    // Track renders two copies back-to-back, so a single copy's width is half.
    const singleWidth = trackRef.current.scrollWidth / 2;
    const computed = singleWidth / PIXELS_PER_SECOND;
    setDuration(Math.max(MIN_DURATION, computed));
  }, [messages]);

  if (!enabled || messages.length === 0) return null;

  const track = (
    <div className="flex items-center gap-6 sm:gap-10 shrink-0 px-3">
      <span className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap bg-emerald-500 text-white text-[11px] sm:text-[13px] font-black uppercase tracking-wide px-3 py-1 rounded-full shrink-0">
        <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
        <b className="font-black">Trusted Store</b>
      </span>
      {messages.map((m, i) => (
        <span key={i} className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap">
          <span className="text-white/90 text-[11px] sm:text-[13px] font-bold">{m}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="bg-black overflow-hidden py-2.5">
      <div
        ref={trackRef}
        className="flex w-max animate-marquee hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {track}
        {track}
      </div>
    </div>
  );
}
