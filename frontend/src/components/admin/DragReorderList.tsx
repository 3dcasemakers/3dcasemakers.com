import { useRef, useState, ReactNode, useEffect } from "react";
import { GripVertical } from "lucide-react";

/**
 * DragReorderList — a touch + mouse friendly drag-to-reorder list.
 *
 * Uses pointer events (not the HTML5 Drag & Drop API) because HTML5 DnD does
 * not work on mobile touch screens. Pointer events work uniformly across
 * desktop mouse, trackpad, and phone touch — so the same drag handle works
 * everywhere per the "phone and PC both proper" requirement.
 *
 * The component is purely a reordering UI: it calls onReorder(newArray) once
 * a drag completes, and the caller is responsible for persisting the new
 * order (e.g. via API calls) same as it already does for arrow-button moves.
 */

interface DragReorderListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number, dragging: boolean) => ReactNode;
  onReorder: (newItems: T[]) => void;
  disabled?: boolean;
  className?: string;
}

export default function DragReorderList<T>({
  items,
  getKey,
  renderItem,
  onReorder,
  disabled = false,
  className = "",
}: DragReorderListProps<T>) {
  const [order, setOrder] = useState<T[]>(items);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = dragIndex !== null;

  // Keep in sync when parent's items change from outside (e.g. after fetch)
  useEffect(() => {
    if (!dragging) setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const indexFromPointer = (clientY: number) => {
    let closest = 0;
    let closestDist = Infinity;
    order.forEach((item, i) => {
      const key = getKey(item, i);
      const el = rowRefs.current.get(key);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - mid);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragIndex(index);
    setOverIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const newOver = indexFromPointer(e.clientY);
    if (newOver !== overIndex) {
      setOverIndex(newOver);
      setOrder((prev) => {
        if (newOver === dragIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(newOver, 0, moved);
        return next;
      });
      setDragIndex(newOver);
    }
  };

  const endDrag = () => {
    if (dragIndex !== null) {
      onReorder(order);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div ref={containerRef} className={`space-y-2 ${className}`}>
      {order.map((item, i) => {
        const key = getKey(item, i);
        const isDragging = dragIndex === i;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`relative flex items-center gap-2 transition-shadow ${
              isDragging ? "z-10 shadow-lg ring-2 ring-blue-300 rounded-lg bg-white" : ""
            }`}
            style={{ touchAction: dragging ? "none" : "pan-y" }}
          >
            <button
              type="button"
              aria-label="Drag to reorder"
              disabled={disabled}
              onPointerDown={handlePointerDown(i)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-grab active:cursor-grabbing disabled:opacity-30 disabled:cursor-not-allowed touch-none"
            >
              <GripVertical size={16} />
            </button>
            <div className="flex-1 min-w-0">{renderItem(item, i, isDragging)}</div>
          </div>
        );
      })}
    </div>
  );
}
