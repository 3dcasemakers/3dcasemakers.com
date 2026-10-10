import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../utils/api";
import { Banner } from "../types";
import { useSiteSettings, ui } from "../utils/siteSettings";

// Single banner box used for both mobile and desktop — same image, same 3548x1774 ratio.
const BANNER_RATIO = "3548 / 1774";

// Minimum horizontal drag distance (px) before a released swipe counts as a
// deliberate slide-change rather than snapping back to where it was.
const SWIPE_THRESHOLD = 50;

export default function HeroBanner() {
  const settings = useSiteSettings();
  // Admin -> Customize -> Banners
  const autoplayMs = Math.max(0, Number(ui(settings, "uiBannerAutoplaySec")) || 0) * 1000;
  const showDots = ui(settings, "uiBannerShowDots") !== false;
  const showArrows = !!ui(settings, "uiBannerShowArrows");
  const fullWidth = !!ui(settings, "uiBannerFullWidth");
  const [banners, setBanners] = useState<Banner[]>([]);
  const [active, setActive] = useState(0);
  // Bumped on every manual swipe/dot click so the autoplay effect resets its
  // timer instead of jumping again right after the user just moved it.
  const [resumeKey, setResumeKey] = useState(0);

  const [dragOffset, setDragOffset] = useState(0); // live px offset while dragging
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swipingHorizontally = useRef(false);

  useEffect(() => {
    api.get("/api/banners").then((all: Banner[]) =>
      setBanners((all || []).filter((b) => b.active).sort((a, b) => a.order - b.order))
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (banners.length < 2 || isDragging || !autoplayMs) return;
    const t = setInterval(() => setActive((i) => (i + 1) % banners.length), autoplayMs);
    return () => clearInterval(t);
  }, [banners.length, resumeKey, isDragging, autoplayMs]);

  const goTo = (i: number) => {
    const next = ((i % banners.length) + banners.length) % banners.length;
    setActive(next);
    setResumeKey((k) => k + 1);
  };
  const goNext = () => goTo(active + 1);
  const goPrev = () => goTo(active - 1);

  const beginDrag = (x: number, y: number) => {
    startX.current = x;
    startY.current = y;
    swipingHorizontally.current = false;
    setIsDragging(true);
  };
  const moveDrag = (x: number, y: number, e?: { preventDefault: () => void }) => {
    if (startX.current === null || startY.current === null) return;
    const dx = x - startX.current;
    const dy = y - startY.current;
    // Only claim the gesture (and block page scroll) once it's clearly
    // horizontal, so vertical page-scrolling over the banner still works.
    if (!swipingHorizontally.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      swipingHorizontally.current = true;
    }
    if (swipingHorizontally.current) {
      e?.preventDefault();
      setDragOffset(dx);
    }
  };
  const endDrag = () => {
    if (swipingHorizontally.current && Math.abs(dragOffset) > SWIPE_THRESHOLD) {
      if (dragOffset < 0) goNext();
      else goPrev();
    }
    setDragOffset(0);
    setIsDragging(false);
    startX.current = null;
    startY.current = null;
    swipingHorizontally.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => beginDrag(e.touches[0].clientX, e.touches[0].clientY);
  const handleTouchMove = (e: React.TouchEvent) => moveDrag(e.touches[0].clientX, e.touches[0].clientY, e);
  const handleTouchEnd = () => endDrag();

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    beginDrag(e.clientX, e.clientY);
  };
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY);
    const onUp = () => endDrag();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dragOffset]);

  if (banners.length === 0) return null;

  // Slide position: a % of the track's own width (the track is N x the frame
  // width, so one slide = 100/N %) plus the live drag in px. Previously this
  // used a px width measured once on mount, but the frame doesn't exist until
  // the banners have loaded, so the measurement stayed 0 and the track never
  // moved off banner 1.
  const slidePct = -(active * 100) / banners.length;

  return (
    <section className={fullWidth ? "w-full mt-0" : "max-w-[1600px] mx-auto mt-0 sm:mt-6 sm:px-10 lg:px-20"}>
      <div
        className="banner-frame relative w-full overflow-hidden border-0 bg-zinc-100 touch-pan-y select-none cursor-grab active:cursor-grabbing"
        style={{ aspectRatio: BANNER_RATIO }}
        onTouchStart={banners.length > 1 ? handleTouchStart : undefined}
        onTouchMove={banners.length > 1 ? handleTouchMove : undefined}
        onTouchEnd={banners.length > 1 ? handleTouchEnd : undefined}
        onMouseDown={banners.length > 1 ? handleMouseDown : undefined}
      >
        {/* Sliding track — one full-width slide per banner, dragged/animated
            horizontally instead of cross-fading. */}
        <div
          className="flex h-full"
          style={{
            width: `${banners.length * 100}%`,
            transform: `translateX(calc(${slidePct}% + ${dragOffset}px))`,
            transition: isDragging ? "none" : "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {banners.map((b, i) => {
            const CardTag: any = b.link ? Link : "div";
            const cardProps = b.link ? { to: b.link } : {};
            return (
              <CardTag
                key={b.id}
                {...cardProps}
                className="relative h-full shrink-0"
                style={{ width: `${100 / banners.length}%` }}
                draggable={false}
                onClickCapture={(e: React.MouseEvent) => {
                  // A drag that moved past the threshold shouldn't also fire
                  // the slide's own link navigation.
                  if (swipingHorizontally.current) e.preventDefault();
                }}
              >
                {b.mediaType === "video" && b.videoUrl ? (
                  <video
                    src={api.imageUrl(b.videoUrl)}
                    className="block w-full h-full object-cover pointer-events-none"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload={i === 0 ? "auto" : "none"}
                  />
                ) : (
                  // Mobile image (if the admin uploaded one) on phones, desktop
                  // image everywhere else. Previously mobileImageUrl was saved
                  // from the admin panel but never actually used.
                  // display:block — an inline <picture> left a thin white gap
                  // under the image (the "white border" around the banner).
                  <picture className="block w-full h-full">
                    {b.mobileImageUrl && b.imageUrl && (
                      <source media="(max-width: 639px)" srcSet={api.resizedUrl(b.mobileImageUrl, 1000)} />
                    )}
                    <img
                      src={api.resizedUrl(b.imageUrl || b.mobileImageUrl, 1600)}
                      alt={b.title || "3DCaseMakers custom acrylic and gold phone cases banner"}
                      className="block w-full h-full object-cover pointer-events-none"
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : "auto"}
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                )}
                {(b.subtitle || b.badge) && (
                  <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8 bg-gradient-to-t from-black/40 via-black/0 to-black/0 pointer-events-none">
                    {b.badge && (
                      <span className="inline-block w-fit px-3 py-1 bg-white/90 text-zinc-900 text-[10px] tracking-[0.2em] uppercase mb-2 font-bold">
                        {b.badge}
                      </span>
                    )}
                    {b.subtitle && <p className="text-white text-sm sm:text-lg font-semibold max-w-md drop-shadow">{b.subtitle}</p>}
                  </div>
                )}
              </CardTag>
            );
          })}
        </div>

        {banners.length > 1 && showArrows && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous banner"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-zinc-900 flex items-center justify-center shadow"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next banner"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-zinc-900 flex items-center justify-center shadow"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        {banners.length > 1 && showDots && (
          <div className="absolute bottom-3 right-3 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Show banner ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
