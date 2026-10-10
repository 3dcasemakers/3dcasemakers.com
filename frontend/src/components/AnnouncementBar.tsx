import { useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../utils/siteSettings";

const DEFAULT_MESSAGES = [
  "Secure Online Payments — UPI, Cards & Net Banking",
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
  const settings = useSiteSettings();
  const messages: string[] = Array.isArray(settings.announcementMessages)
    ? settings.announcementMessages.filter((m: unknown): m is string => typeof m === "string" && !!m.trim()).slice(0, MAX_ITEMS)
    : DEFAULT_MESSAGES;
  const enabled = settings.announcementBarEnabled !== false;
  const speed = settings.announcementSpeed && SPEED_PIXELS_PER_SECOND[settings.announcementSpeed] ? settings.announcementSpeed : "normal";
  const [duration, setDuration] = useState(14);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!trackRef.current) return;
    const measure = () => {
      const singleWidth = trackRef.current!.scrollWidth / 2;
      const pixelsPerSecond = SPEED_PIXELS_PER_SECOND[speed] || SPEED_PIXELS_PER_SECOND.normal;
      setDuration(Math.max(MIN_DURATION, singleWidth / pixelsPerSecond));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [settings.announcementMessages, enabled, speed]);

  if (!enabled || messages.length === 0) return null;

  const track = (
    <div className="flex items-center gap-6 sm:gap-10 shrink-0 px-3">
      {messages.map((m, i) => (
        <span key={i} className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap">
          <span className="text-white/90 text-[11px] sm:text-[13px] font-bold">{m}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="site-announcement bg-black overflow-hidden py-2.5">
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
