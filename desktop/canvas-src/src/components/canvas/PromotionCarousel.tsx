"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface PromotionItem {
  id: string;
  title: string;
  title_en: string | null;
  subtitle: string | null;
  subtitle_en: string | null;
  image_url: string | null;
  video_url: string | null;
  link_url: string | null;
  link_type: string;
}

const CARD_W = 280;
const CARD_H = 280;
const STACK_OFFSET_Y = 22;
const STACK_SCALE_STEP = 0.06;
const VISIBLE_STACK = 3;
const SWIPE_THRESHOLD = 50;
const AUTO_PLAY_MS = 8000;

export function PromotionCarousel() {
  const locale = useLocale();
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/promotions")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.items?.length) setItems(data.items.slice(0, 5));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const slideNext = useCallback(() => {
    if (isAnimating || items.length <= 1) return;
    setSlideDir("left");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
      setSlideDir(null);
      setIsAnimating(false);
    }, 300);
  }, [isAnimating, items.length]);

  const slidePrev = useCallback(() => {
    if (isAnimating || items.length <= 1) return;
    setSlideDir("right");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
      setSlideDir(null);
      setIsAnimating(false);
    }, 300);
  }, [isAnimating, items.length]);

  // Auto-play
  useEffect(() => {
    if (items.length <= 1 || dismissed) return;
    autoPlayRef.current = setInterval(slideNext, AUTO_PLAY_MS);
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [items.length, dismissed, slideNext]);

  const resetAutoPlay = useCallback(() => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    if (items.length > 1 && !dismissed) {
      autoPlayRef.current = setInterval(slideNext, AUTO_PLAY_MS);
    }
  }, [items.length, dismissed, slideNext]);

  function handleTouchStart(e: React.TouchEvent | React.PointerEvent) {
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    touchStartX.current = x;
  }

  function handleTouchEnd(e: React.TouchEvent | React.PointerEvent) {
    const x = "changedTouches" in e ? e.changedTouches[0].clientX : e.clientX;
    const diff = x - touchStartX.current;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff < 0) slideNext();
      else slidePrev();
      resetAutoPlay();
    }
  }

  function handleCardClick(item: PromotionItem) {
    if (!item.link_url || item.link_type === "none") return;
    if (item.link_type === "external") {
      window.open(item.link_url, "_blank", "noopener");
    } else {
      window.location.href = item.link_url;
    }
  }

  if (!items.length || dismissed) return null;

  const getTitle = (item: PromotionItem) =>
    locale === "en" && item.title_en ? item.title_en : item.title;
  const getSubtitle = (item: PromotionItem) =>
    locale === "en" && item.subtitle_en ? item.subtitle_en : item.subtitle;

  // Build visible stack (up to VISIBLE_STACK items)
  const visibleItems: { item: PromotionItem; stackIndex: number }[] = [];
  for (let i = 0; i < Math.min(VISIBLE_STACK, items.length); i++) {
    const idx = (currentIndex + i) % items.length;
    visibleItems.push({ item: items[idx], stackIndex: i });
  }

  const NAV_H = items.length > 1 ? 28 : 0;

  return (
    <div
      className="z-[60] fixed right-4 bottom-4 select-none"
      style={{ width: CARD_W, height: CARD_H + STACK_OFFSET_Y * (VISIBLE_STACK - 1) + NAV_H }}
    >
      {/* Cards area */}
      <div className="relative" style={{ width: CARD_W, height: CARD_H + STACK_OFFSET_Y * (VISIBLE_STACK - 1) }}>
        {visibleItems.reverse().map(({ item, stackIndex }) => {
          const isFront = stackIndex === 0;
          const baseTranslateY = -stackIndex * STACK_OFFSET_Y;
          const baseScale = 1 - stackIndex * STACK_SCALE_STEP;

          let animTranslateX = 0;
          let animOpacity = 1;
          if (isFront && slideDir) {
            animTranslateX = slideDir === "left" ? -CARD_W - 20 : CARD_W + 20;
            animOpacity = 0;
          }

          const dimOpacity = stackIndex * 0.08;

          return (
            <div
              key={item.id}
              className="absolute bottom-0 right-0 rounded-2xl overflow-hidden border border-zinc-700/50 bg-zinc-800 shadow-xl"
              style={{
                width: CARD_W,
                height: CARD_H,
                zIndex: 100 - stackIndex,
                transform: `translateY(${baseTranslateY}px) translateX(${animTranslateX}px) scale(${baseScale})`,
                opacity: animOpacity,
                transition: isFront && slideDir
                  ? "transform 300ms ease-out, opacity 300ms ease-out"
                  : "transform 300ms ease-out",
                transformOrigin: "bottom right",
                cursor: isFront && item.link_url && item.link_type !== "none" ? "pointer" : "default",
              }}
              onClick={() => isFront && handleCardClick(item)}
              onTouchStart={isFront ? handleTouchStart : undefined}
              onTouchEnd={isFront ? handleTouchEnd : undefined}
              onPointerDown={isFront ? handleTouchStart : undefined}
              onPointerUp={isFront ? handleTouchEnd : undefined}
            >
              {/* Video autoplay or image fallback */}
              {item.video_url ? (
                <video
                  src={item.video_url}
                  poster={item.image_url || undefined}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  loop
                  muted
                  draggable={false}
                />
              ) : item.image_url ? (
                <img
                  src={item.image_url}
                  alt={getTitle(item)}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full bg-zinc-800" />
              )}

              {!isFront && (
                <div
                  className="absolute inset-0 bg-black pointer-events-none"
                  style={{ opacity: dimOpacity }}
                />
              )}

              {isFront && (
                <div className="absolute inset-0 w-full h-full">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
                    className="absolute top-2 right-2 size-7 rounded-full bg-black/30 hover:bg-black/60 flex items-center justify-center transition-colors z-10"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>

                  <div className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-black/70 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
                    <h3 className="text-white text-base font-bold leading-tight line-clamp-2">
                      {getTitle(item)}
                    </h3>
                    {getSubtitle(item) && (
                      <p className="text-zinc-300 text-xs mt-1 line-clamp-2">
                        {getSubtitle(item)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nav bar — outside cards, at the bottom */}
      {items.length > 1 && (
        <div className="flex items-center justify-between px-2 pt-1" style={{ width: CARD_W }}>
          <button
            type="button"
            onClick={() => { slidePrev(); resetAutoPlay(); }}
            className="size-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="h-3 w-3 text-white" />
          </button>
          <div className="flex gap-1">
            {items.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-4 h-1.5 bg-white"
                    : "w-1.5 h-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { slideNext(); resetAutoPlay(); }}
            className="size-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="h-3 w-3 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
