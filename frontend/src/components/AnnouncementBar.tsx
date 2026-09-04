import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../utils/api";

const DEFAULT_MESSAGES = [
  "Cash on Delivery Available",
  "Free Shipping Across Tamil Nadu",
  "50,000+ Happy Customers",
  "Premium Quality Guaranteed",
];

const MAX_ITEMS = 5;

// Pixels the strip should travel per second — higher = faster scroll.
// Duration is derived from this + the actual rendered width, so speed stays
// consistent no matter how many/few messages the admin sets. Admin-controlled
// via Settings -> Checkout -> Announcement Bar (announcementSpeed: slow/
// normal/fast), defaulting to "normal" if not set.
const SPEED_PIXELS_PER_SECOND: Record<string, number> = {
  slow: 25,
  normal: 45,
  fast: 70,
};
const MIN_DURATION = 6;

// Continuously scrolling ("movable") announcement strip that sits directly
// under the nav bar. Content + speed come from Admin -> Settings ->
// Announcement Bar (up to 5 items, slow/normal/fast). Falls back to sensible
// defaults if admin hasn't set anything yet. Can be fully hidden via
// announcementBarEnabled.
export default function AnnouncementBar() {
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [enabled, setEnabled] = useState(true);
  const [speed, setSpeed] = useState<string>("normal");
  const [duration, setDuration] = useState(14);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s) => {
        if (Array.isArray(s.announcementMessages) && s.announcementMessages.length) {
          setMessages(s.announcementMessages.filter((m: string) => m && m.trim()).slice(0, MAX_ITEMS));
        }
        setEnabled(s.announcementBarEnabled !== false);
        setSpeed(s.announcementSpeed && SPEED_PIXELS_PER_SECOND[s.announcementSpeed] ? s.announcementSpeed : "normal");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!trackRef.current) return;
    // Track renders two copies back-to-back, so a single copy's width is half.
    const singleWidth = trackRef.current.scrollWidth / 2;
    const pixelsPerSecond = SPEED_PIXELS_PER_SECOND[speed] || SPEED_PIXELS_PER_SECOND.normal;
    const computed = singleWidth / pixelsPerSecond;
    setDuration(Math.max(MIN_DURATION, computed));
  }, [messages, speed]);

  if (!enabled || messages.length === 0) return null;

  const track = (
    <div className="flex items-center gap-6 sm:gap-10 shrink-0 px-3">
      {messages.map((m, i) => (
        <span key={i} className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap">
          <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--brand-accent,#000000)] shrink-0" />
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
