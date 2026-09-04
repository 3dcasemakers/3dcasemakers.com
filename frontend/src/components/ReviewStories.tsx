import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { api } from "../utils/api";

interface Story {
  id: string;
  image: string;
  video?: string | null;
  media_type?: "image" | "video";
  name: string;
  caption?: string;
  created_at: string;
}

const STORY_DURATION_MS = 5000;

function StoryViewer({ stories, startIndex, onClose }: { stories: Story[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const story = stories[index];
  const isVideo = !!(story?.media_type === "video" && story?.video);

  const goNext = () => {
    setIndex((i) => {
      if (i >= stories.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  // Image stories: fixed-duration progress bar (unchanged behaviour).
  useEffect(() => {
    if (isVideo) return;
    setProgress(0);
    startRef.current = performance.now();
    const tick = (now: number) => {
      const pct = Math.min(1, (now - startRef.current) / STORY_DURATION_MS);
      setProgress(pct);
      if (pct >= 1) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isVideo]);

  // Video stories: progress bar follows actual playback, plays with sound
  // (falls back to muted autoplay + a tap-to-unmute button if the browser
  // blocks unmuted autoplay), and advances to the next story when it ends.
  useEffect(() => {
    if (!isVideo) return;
    const vid = videoRef.current;
    if (!vid) return;
    setProgress(0);
    vid.currentTime = 0;
    vid.muted = muted;
    const playAttempt = vid.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        // Autoplay-with-sound blocked by the browser — retry muted so the
        // story still plays, and let the visitor tap the speaker to unmute.
        vid.muted = true;
        setMuted(true);
        vid.play().catch(() => {});
      });
    }
    const onTimeUpdate = () => {
      if (vid.duration) setProgress(Math.min(1, vid.currentTime / vid.duration));
    };
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("ended", goNext);
    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("ended", goNext);
      vid.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isVideo]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-3 sm:p-6" style={{ height: "100dvh" }} onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden" style={{ height: "min(80dvh, 720px)" }} onClick={(e) => e.stopPropagation()}>
        {/* progress bars */}
        <div className="absolute top-2 left-2 right-2 z-10 flex gap-1">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white"
                style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-6 right-3 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-black transition-colors"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        <div className="absolute top-8 left-3 z-10 flex items-center gap-2">
          <img src={api.imageUrl(story.image)} alt={story.name} className="w-7 h-7 rounded-full object-cover border border-white/60" />
          <span className="text-white text-xs font-bold drop-shadow">{story.name}</span>
        </div>

        {isVideo ? (
          <video
            ref={videoRef}
            src={api.imageUrl(story.video!)}
            className="w-full h-full object-contain bg-black"
            playsInline
            autoPlay
            muted={muted}
          />
        ) : (
          <img src={api.imageUrl(story.image)} alt={story.caption || story.name} className="w-full h-full object-contain bg-black" />
        )}

        {isVideo && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="absolute bottom-4 right-3 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-black transition-colors"
          >
            {muted ? <VolumeX size={16} strokeWidth={2.5} /> : <Volume2 size={16} strokeWidth={2.5} />}
          </button>
        )}

        {story.caption && (
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <p className="text-white text-sm font-medium">{story.caption}</p>
          </div>
        )}

        {/* tap zones for prev/next (large invisible tap targets) + always-visible highlighted buttons */}
        <button type="button" onClick={goPrev} aria-label="Previous story" className="absolute left-0 top-0 h-full w-1/3 flex items-center justify-start pl-3 z-10">
          <span className="w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-black transition-colors">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </span>
        </button>
        <button type="button" onClick={goNext} aria-label="Next story" className="absolute right-0 top-0 h-full w-1/3 flex items-center justify-end pr-3 z-10">
          <span className="w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center text-black transition-colors">
            <ChevronRight size={20} strokeWidth={2.5} />
          </span>
        </button>
      </div>
    </div>
  );
}

export default function ReviewStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    api.get("/api/review-stories").then(setStories).catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 mb-8 px-1 -mx-1 max-w-3xl mx-auto scrollbar-hide">
        {stories.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <span className="p-[2.5px] rounded-full bg-gradient-to-tr from-blue-400 via-pink-500 to-purple-600 inline-block">
              <span className="block p-[2px] rounded-full bg-white">
                <img
                  src={api.imageUrl(s.image)}
                  alt={s.name}
                  className="rounded-full object-cover aspect-square block"
                  style={{ width: 56, height: 56 }}
                />
              </span>
            </span>
            <span className="text-[10px] text-zinc-500 font-medium max-w-[64px] truncate">
              {s.name}
            </span>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <StoryViewer stories={stories} startIndex={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </>
  );
}
