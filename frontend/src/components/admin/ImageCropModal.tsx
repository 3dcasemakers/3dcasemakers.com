import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

// Generic image cropper used everywhere an admin uploads a product,
// collection, or review-story photo. Opens with the image centered in the
// crop frame by default (the most common case needs zero adjustment — just
// hit "Use Photo"), but the admin can drag to reposition and use the zoom
// slider / buttons to crop tighter before confirming.
//
// Supports any crop aspect ratio via aspectW/aspectH (defaults to 1:1
// square, e.g. products). Pass aspectW={9} aspectH={16} for the portrait
// frame used by review Stories, so what the admin crops here is pixel-exact
// to the portrait story viewer the customer sees on the storefront — no
// surprise re-cropping/letterboxing later.
//
// No external cropping library is used (keeps package.json untouched) —
// everything here is plain canvas + pointer events.

interface ImageCropModalProps {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
  /** Crop aspect ratio (width:height). Defaults to 1:1 (square). */
  aspectW?: number;
  aspectH?: number;
  /** Output long-edge size in pixels (the file is downscaled/upscaled to this, keeping aspectW:aspectH). */
  outputSize?: number;
}

// On-screen crop viewport: longest edge is VIEWPORT_MAX px, the other edge
// is derived from the aspect ratio so the frame itself is never distorted.
const VIEWPORT_MAX = 320;

export default function ImageCropModal({ file, onCancel, onConfirm, aspectW = 1, aspectH = 1, outputSize = 1200 }: ImageCropModalProps) {
  const [imgSrc, setImgSrc] = useState<string>("");
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // offset is the pan position of the image center relative to the viewport
  // center, in on-screen (viewport) pixels.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offX: 0, offY: 0 });
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const isSquare = aspectW === aspectH;
  const viewportW = aspectW >= aspectH ? VIEWPORT_MAX : Math.round((VIEWPORT_MAX * aspectW) / aspectH);
  const viewportH = aspectH >= aspectW ? VIEWPORT_MAX : Math.round((VIEWPORT_MAX * aspectH) / aspectW);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ w: img.width, h: img.height });
      // Default: fit the image so its short side (relative to the crop
      // frame's own aspect ratio) fills the viewport — i.e. a centered
      // crop matching the target frame exactly, no cropping surprises, no
      // letterboxing.
      //
      // BUG FIX: when the source photo's aspect ratio doesn't match the
      // crop frame's aspect ratio (e.g. a square photo being cropped to a
      // tall portrait story frame), fitting bare-minimum left zero slack on
      // one axis (maxX or maxY = 0 in clampOffset below), so dragging in
      // that direction visually did nothing until the admin manually raised
      // the zoom slider first — it read as "only vertical zoom works" /
      // "horizontal zoom doesn't work" (or vice-versa). Starting a hair
      // above the bare-minimum fit gives both axes a little pan room
      // immediately, so dragging works right away in every direction, in
      // both the initial view and while zooming.
      const scale = Math.max(viewportW / img.width, viewportH / img.height) * 1.05;
      setMinZoom(scale);
      setZoom(scale);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, viewportW, viewportH]);

  const clampOffset = (off: { x: number; y: number }, z: number) => {
    // Keep the image covering the full viewport crop frame at all times.
    const dispW = naturalSize.w * z;
    const dispH = naturalSize.h * z;
    const maxX = Math.max(0, (dispW - viewportW) / 2);
    const maxY = Math.max(0, (dispH - viewportH) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, off.x)),
      y: Math.min(maxY, Math.max(-maxY, off.y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offX: offset.x, offY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(clampOffset({ x: dragStart.current.offX + dx, y: dragStart.current.offY + dy }, zoom));
  };
  const onPointerUp = () => setDragging(false);

  const changeZoom = (z: number) => {
    const next = Math.max(minZoom, Math.min(minZoom * 4, z));
    setZoom(next);
    setOffset((o) => clampOffset(o, next));
  };

  const confirm = async () => {
    setProcessing(true);
    try {
      const outW = aspectW >= aspectH ? outputSize : Math.round((outputSize * aspectW) / aspectH);
      const outH = aspectH >= aspectW ? outputSize : Math.round((outputSize * aspectH) / aspectW);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx || !imgRef.current) throw new Error("Canvas unavailable");

      const outScale = outW / viewportW;
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      if (rotation) ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(offset.x * outScale, offset.y * outScale);
      const dispW = naturalSize.w * zoom * outScale;
      const dispH = naturalSize.h * zoom * outScale;
      ctx.drawImage(imgRef.current, -dispW / 2, -dispH / 2, dispW, dispH);
      ctx.restore();

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), "image/jpeg", 0.92)
      );
      const ext = "jpg";
      const base = file.name.replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${base}-cropped.${ext}`, { type: "image/jpeg" });
      onConfirm(cropped);
    } catch {
      // Fall back to the original file if canvas cropping ever fails, so the
      // admin is never blocked from uploading.
      onConfirm(file);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="admin-modal-solid bg-white rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-[#202223]">
            Crop Photo ({isSquare ? "1:1 Square" : `${aspectW}:${aspectH} Portrait`})
          </h3>
          <button onClick={onCancel} className="text-[#8c9196] hover:text-[#202223]">
            <X size={18} />
          </button>
        </div>

        <div
          className="relative mx-auto overflow-hidden rounded-lg border border-[#e1e3e5] bg-[#f0f0f0] touch-none select-none cursor-move"
          style={{ width: viewportW, height: viewportH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              draggable={false}
              className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
              style={{
                width: naturalSize.w * zoom,
                height: naturalSize.h * zoom,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
              }}
            />
          )}
          {/* Grid overlay to help with framing */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: `${viewportW / 3}px ${viewportH / 3}px`,
          }} />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <ZoomOut size={16} className="text-[#8c9196] shrink-0" />
          <input
            type="range"
            min={minZoom}
            max={minZoom * 4}
            step={(minZoom * 4 - minZoom) / 100 || 0.001}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="w-full"
          />
          <ZoomIn size={16} className="text-[#8c9196] shrink-0" />
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-[#e1e3e5] text-[#6d7175] hover:bg-[#f6f6f7]"
            title="Rotate 90°"
          >
            <RotateCw size={14} />
          </button>
        </div>

        <p className="text-[10px] text-[#8c9196] mt-2">Drag the photo to reposition. Defaults to a centered crop — adjust zoom/position if needed.</p>

        <div className="flex gap-3 pt-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-semibold text-[#6d7175] border border-[#c9cccf] hover:bg-[#f6f6f7]">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={processing || !naturalSize.w}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-[#202223] text-white hover:opacity-90 disabled:opacity-50"
          >
            {processing ? "Processing..." : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
