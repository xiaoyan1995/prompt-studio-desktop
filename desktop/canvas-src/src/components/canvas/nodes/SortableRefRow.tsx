"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

/* ── Single sortable thumbnail item ── */
function SortableThumb({
  id,
  src,
  label,
  isVideo,
  isAudio,
  onRemove,
  onClick,
}: {
  id: string;
  src: string;
  label?: string;
  isVideo?: boolean;
  isAudio?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto" as number | string,
  };

  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const thumbRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
    },
    [setNodeRef],
  );

  const handleEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setHover(true);
  }, []);

  return (
    <>
      <div
        ref={thumbRef}
        style={style}
        className="relative group/ref shrink-0 cursor-grab active:cursor-grabbing nodrag"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHover(false)}
        {...attributes}
        {...listeners}
      >
        {isAudio ? (
          <div className="size-[38px] rounded-[10px] border border-pink-500/30 bg-gradient-to-b from-pink-500/15 to-pink-500/5 flex items-end justify-center gap-[2px] pb-[7px] pt-[7px]">
            {[0.55, 0.85, 0.45, 0.95, 0.6, 0.75, 0.5].map((h, i) => (
              <div
                key={i}
                className="w-[2.5px] rounded-full bg-pink-400/80"
                style={{ height: `${h * 24}px`, animation: `audioBar 1.2s ease-in-out ${i * 0.1}s infinite alternate` }}
              />
            ))}
          </div>
        ) : isVideo ? (
          <video src={src} className="size-[38px] object-cover rounded-[10px] border border-green-500/30" muted preload="metadata" />
        ) : (
          <img
            src={src}
            alt={label ?? ""}
            className="size-[38px] object-cover rounded-[10px] border border-white/10"
            draggable={false}
            loading="lazy"
            decoding="async"
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
          />
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3 h-3 bg-green-500/80 rounded-full flex items-center justify-center">
              <div className="w-0 h-0 border-l-[5px] border-l-white border-y-[3px] border-y-transparent ml-0.5" />
            </div>
          </div>
        )}
        {onRemove && (
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-black/80 border border-white/15 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity nodrag"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
          >
            <X size={8} className="text-white/80" />
          </button>
        )}
      </div>
      {hover && pos && !isDragging && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
        >
          <div className="mb-2 rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            {label && <div className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-white/[0.04]">{label}</div>}
            {isAudio ? (
              <div className="px-3 py-2 text-xs text-zinc-400">Audio</div>
            ) : isVideo ? (
              <video src={src} className="w-[200px] h-auto" muted autoPlay loop playsInline draggable={false} />
            ) : (
              <img src={src} alt={label ?? ""} className="w-[200px] h-auto" draggable={false} loading="lazy" decoding="async" />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Sortable row container ── */
export interface SortableRefItem {
  id: string;
  src: string;
  label?: string;
  isVideo?: boolean;
  isAudio?: boolean;
  originalIndex: number;
}

interface SortableRefRowProps {
  items: SortableRefItem[];
  onReorder: (newOrder: number[]) => void;
  onRemove?: (src: string, type: "image" | "video" | "audio") => void;
  onThumbClick?: (item: SortableRefItem) => void;
}

export function SortableRefRow({ items, onReorder, onRemove, onThumbClick }: SortableRefRowProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const itemIds = useMemo(() => items.map((it) => it.id), [items]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = items.findIndex((it) => it.id === active.id);
      const newIdx = items.findIndex((it) => it.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(items, oldIdx, newIdx);
      onReorder(reordered.map((it) => it.originalIndex));
    },
    [items, onReorder],
  );

  if (items.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
        {items.map((item) => (
          <SortableThumb
            key={item.id}
            id={item.id}
            src={item.src}
            label={item.label}
            isVideo={item.isVideo}
            isAudio={item.isAudio}
            onRemove={
              onRemove
                ? () => onRemove(item.src, item.isVideo ? "video" : item.isAudio ? "audio" : "image")
                : undefined
            }
            onClick={onThumbClick ? () => onThumbClick(item) : undefined}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
