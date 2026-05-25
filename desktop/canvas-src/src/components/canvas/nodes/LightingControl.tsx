"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";

/* ── Asset base URL ── */
const BG = "/camera/camera-control-bg.png";

/* ── Data ── */

interface LightingOption {
  id: string;
  zh: string;
  en: string;
  prompt: string;
  img: string;
}

type Locale = "zh" | "en";
const label = (item: LightingOption, locale: Locale) => locale === "zh" ? item.zh : item.en;

const P = "/lighting/pattern";
const D = "/lighting/direction";
const C = "/lighting/color";

/* ── Axis 1: Light Pattern (光型) ── */
const LIGHT_PATTERNS: LightingOption[] = [
  { id: "rembrandt",  zh: "伦勃朗光",   en: "Rembrandt",     prompt: "Rembrandt lighting",                              img: `${P}/rembrandt.jpg` },
  { id: "butterfly",  zh: "蝴蝶光",     en: "Butterfly",     prompt: "butterfly lighting, Paramount lighting",          img: `${P}/butterfly.jpg` },
  { id: "split",      zh: "分割光",     en: "Split",         prompt: "split lighting",                                  img: `${P}/split.jpg` },
  { id: "tyndall",    zh: "丁达尔光",   en: "Tyndall",       prompt: "Tyndall effect, god rays through atmosphere",     img: `${P}/tyndall.jpg` },
  { id: "3point",     zh: "电影三点光", en: "3-Point",       prompt: "cinematic three-point lighting",                   img: `${P}/3point.jpg` },
  { id: "ring",       zh: "环形光",     en: "Ring",          prompt: "ring light, circular catchlight",                 img: `${P}/ring.jpg` },
  { id: "highkey",    zh: "高调光",     en: "High Key",      prompt: "high-key lighting, bright and even",              img: `${P}/highkey.jpg` },
  { id: "silhouette", zh: "剪影",       en: "Silhouette",    prompt: "silhouette lighting, backlit dark subject",       img: `${P}/silhouette.jpg` },
  { id: "neon",       zh: "霓虹光",     en: "Neon",          prompt: "neon light glow",                                 img: `${P}/neon.jpg` },
  { id: "specular",   zh: "镜面光",     en: "Specular",      prompt: "specular hard lighting, sharp highlights",        img: `${P}/specular.jpg` },
  { id: "none",       zh: "无",         en: "None",          prompt: "",                                                img: `${P}/none.jpg` },
];

/* ── Axis 2: Light Direction (光源方向) ── */
const LIGHT_DIRECTIONS: LightingOption[] = [
  { id: "front",     zh: "正面光",     en: "Front",         prompt: "front light",                          img: `${D}/front.jpg` },
  { id: "side45",    zh: "45°侧光",   en: "45° Side",      prompt: "45-degree side light",                 img: `${D}/side45.jpg` },
  { id: "back",      zh: "逆光",       en: "Backlight",     prompt: "backlight, rim light",                 img: `${D}/back.jpg` },
  { id: "top",       zh: "顶光",       en: "Top",           prompt: "top-down overhead light",              img: `${D}/top.jpg` },
  { id: "bottom",    zh: "底光",       en: "Bottom",        prompt: "bottom light, under lighting",         img: `${D}/bottom.jpg` },
  { id: "rembrandt", zh: "伦勃朗",     en: "Rembrandt",     prompt: "Rembrandt 45-degree high side light",  img: `${D}/rembrandt.jpg` },
  { id: "wrap",      zh: "环绕柔光",   en: "Wrap Soft",     prompt: "wrap-around soft light",               img: `${D}/wrap.jpg` },
];

/* ── Axis 3: Color Atmosphere (色温/氛围) ── */
const LIGHT_COLORS: LightingOption[] = [
  { id: "bluehour",     zh: "蓝调时刻",   en: "Blue Hour",     prompt: "blue hour cool color temperature",         img: `${C}/bluehour.jpg` },
  { id: "goldenhour",   zh: "黄金时刻",   en: "Golden Hour",   prompt: "golden hour warm sunlight",                img: `${C}/goldenhour.jpg` },
  { id: "neonMagenta",  zh: "霓虹洋红",   en: "Neon Magenta",  prompt: "neon magenta color cast",                  img: `${C}/neon-magenta.jpg` },
  { id: "neonCyan",     zh: "霓虹青蓝",   en: "Neon Cyan",     prompt: "neon cyan color cast",                     img: `${C}/neon-cyan.jpg` },
  { id: "dramaGreen",   zh: "戏剧绿光",   en: "Drama Green",   prompt: "dramatic green light",                     img: `${C}/drama-green.jpg` },
  { id: "dramaRed",     zh: "戏剧红光",   en: "Drama Red",     prompt: "dramatic red light",                       img: `${C}/drama-red.jpg` },
  { id: "dramaBlue",    zh: "戏剧蓝光",   en: "Drama Blue",    prompt: "dramatic blue light",                      img: `${C}/drama-blue.jpg` },
  { id: "natural",      zh: "自然混合",   en: "Natural Mix",   prompt: "natural mixed lighting",                   img: `${C}/natural.jpg` },
  { id: "pureBlack",    zh: "纯黑场",     en: "Pure Black",    prompt: "pure black background, studio lighting",   img: `${C}/pure-black.jpg` },
  { id: "brandGold",    zh: "品牌金",     en: "Brand Gold",    prompt: "luxury brand golden warm tone",            img: `${C}/brand-gold.jpg` },
  { id: "softFog",      zh: "柔雾灰",     en: "Soft Fog",      prompt: "soft fog grey diffused atmosphere",        img: `${C}/soft-fog.jpg` },
  { id: "clubPurple",   zh: "夜店紫光",   en: "Club Purple",   prompt: "nightclub purple ambient light",           img: `${C}/club-purple.jpg` },
  { id: "forestGreen",  zh: "森林绿光",   en: "Forest Green",  prompt: "forest green filtered light",              img: `${C}/forest-green.jpg` },
  { id: "none",         zh: "无",         en: "None",          prompt: "",                                         img: `${C}/none.jpg` },
];

/* ── Public types ── */
export interface LightingSettings {
  pattern: number;
  direction: number;
  color: number;
}

const DEFAULT_SETTINGS: LightingSettings = { pattern: 0, direction: 0, color: 0 };

/* ── Triangle arrow SVG (identical to CameraControl) ── */
function TriArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24"
      fill="currentColor" stroke="none"
      className={`text-zinc-500 transition-all duration-200 ${direction === "up" ? "rotate-90" : "-rotate-90"}`}
    >
      <path d="M12 1.67a2.914 2.914 0 0 0 -2.492 1.403l-8.11 13.537a2.914 2.914 0 0 0 2.484 4.385h16.225a2.914 2.914 0 0 0 2.503 -4.371l-8.116 -13.546a2.917 2.917 0 0 0 -2.494 -1.408z" />
    </svg>
  );
}

/* ── Single vertical scroll wheel (identical sizing to CameraControl) ── */
const ITEM_H = 80;
const VIEW_H = 164;
const CENTER_OFFSET = Math.floor((VIEW_H - ITEM_H) / 2);

function LightingWheel({ items, selectedIndex, onSelect, locale }: {
  items: LightingOption[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  locale: Locale;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartIndex = useRef(0);
  const translateY = CENTER_OFFSET - selectedIndex * ITEM_H;
  const [hover, setHover] = useState<{ img: string; label: string; x: number; y: number } | null>(null);

  const clamp = useCallback((idx: number) => Math.max(0, Math.min(items.length - 1, idx)), [items.length]);
  const prev = useCallback(() => { onSelect(clamp(selectedIndex - 1)); }, [selectedIndex, onSelect, clamp]);
  const next = useCallback(() => { onSelect(clamp(selectedIndex + 1)); }, [selectedIndex, onSelect, clamp]);

  const getHoveredIndex = useCallback((clientY: number) => {
    const el = viewportRef.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const relY = clientY - rect.top;
    const virtualY = relY - (CENTER_OFFSET - selectedIndex * ITEM_H);
    return clamp(Math.floor(virtualY / ITEM_H));
  }, [selectedIndex, clamp]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartIndex.current = selectedIndex;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setHover(null);
  }, [selectedIndex]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) {
      const dy = dragStartY.current - e.clientY;
      const steps = Math.round(dy / (ITEM_H * 0.6));
      const newIdx = clamp(dragStartIndex.current + steps);
      if (newIdx !== selectedIndex) onSelect(newIdx);
      return;
    }
    const idx = getHoveredIndex(e.clientY);
    const item = items[idx];
    if (item) setHover({ img: item.img, label: label(item, locale), x: e.clientX, y: e.clientY });
  }, [selectedIndex, onSelect, clamp, items, getHoveredIndex, locale]);

  const handlePointerUp = useCallback(() => { isDragging.current = false; }, []);
  const handlePointerLeave = useCallback(() => { setHover(null); }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let accumulated = 0;
    const threshold = 40;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      accumulated += e.deltaY;
      if (Math.abs(accumulated) >= threshold) {
        const steps = Math.sign(accumulated);
        accumulated = 0;
        onSelect(clamp(selectedIndex + steps));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selectedIndex, onSelect, clamp]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex items-center justify-center transition-colors duration-200 hover:text-zinc-300"
        onMouseDown={(e) => { e.preventDefault(); prev(); }}
      >
        <TriArrow direction="up" />
      </button>

      <div
        ref={viewportRef}
        className="relative select-none"
        style={{ width: 80, height: VIEW_H, cursor: "grab", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Highlight bg */}
        <div
          className="absolute left-0 right-0 rounded-2xl pointer-events-none bg-cover bg-center"
          style={{
            top: CENTER_OFFSET,
            height: ITEM_H,
            backgroundImage: `url(${BG})`,
            opacity: 0.5,
          }}
        />

        {/* Items column */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: 16 }}>
          <div
            className="flex flex-col items-center ease-out"
            style={{
              transform: `translateY(${translateY}px)`,
              transitionDuration: "200ms",
              transitionProperty: "transform",
              gap: 0,
            }}
          >
            {items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${idx}-${item.id}`}
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 80, height: ITEM_H }}
                >
                  <div className="relative flex items-center justify-center h-full w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.img}
                      alt={label(item, locale)}
                      className={`object-cover rounded-lg transition-all ${isSelected ? "w-16 h-16 opacity-100" : "w-11 h-11 opacity-50"}`}
                      draggable={false}
                      style={{ transitionDuration: "200ms" }}
                    />
                    {isSelected && (
                      <span
                        className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-zinc-400 text-[9px] font-bold px-1.5 pt-0.5 rounded-t-[4px] bg-zinc-900/80 whitespace-nowrap"
                        style={{ boxShadow: "rgba(156,163,175,0.15) 0px 0px 8px 2px inset" }}
                      >
                        {label(item, locale)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="flex items-center justify-center transition-colors duration-200 hover:text-zinc-300"
        onMouseDown={(e) => { e.preventDefault(); next(); }}
      >
        <TriArrow direction="down" />
      </button>

      {hover && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{ left: hover.x + 16, top: hover.y - 80 }}
        >
          <div className="rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hover.img}
              alt={hover.label}
              className="block"
              width={160}
              height={160}
              draggable={false}
            />
            <div className="text-center text-[11px] text-zinc-300 py-1 bg-zinc-900">
              {hover.label}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Divider between wheels (identical to CameraControl) ── */
function WheelDivider() {
  return <div className="w-0.5 bg-white/10 h-20 mb-9" />;
}

/* ── Wheel column with category title ── */
function WheelColumn({ title, items, selectedIndex, onSelect, locale }: {
  title: string;
  items: LightingOption[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  locale: Locale;
}) {
  const item = items[selectedIndex];
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{title}</span>
      <LightingWheel items={items} selectedIndex={selectedIndex} onSelect={onSelect} locale={locale} />
      <span className="text-white text-xs font-medium mt-2 max-w-[110px] text-center truncate">
        {item ? label(item, locale) : ""}
      </span>
    </div>
  );
}

/* ── Exported: Lighting Popover ── */
export function LightingPopover({
  settings,
  onChange,
  onClose,
  flipUp,
  popoverRef,
}: {
  settings?: LightingSettings;
  onChange: (s: LightingSettings) => void;
  onClose: () => void;
  flipUp?: boolean;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("lighting");
  const loc = useLocale() as Locale;
  const [local, setLocal] = useState<LightingSettings>(settings ?? DEFAULT_SETTINGS);

  const update = useCallback((key: keyof LightingSettings, val: number) => {
    setLocal((prev) => {
      const next = { ...prev, [key]: val };
      queueMicrotask(() => onChange(next));
      return next;
    });
  }, [onChange]);

  const handleSave = useCallback(() => {
    onChange(local);
    onClose();
  }, [local, onChange, onClose]);

  return (
    <div
      ref={popoverRef}
      className={`absolute ${flipUp ? "bottom-full mb-2" : "top-full mt-2"} left-1/2 -translate-x-1/2 rounded-xl border border-zinc-700/60 p-4 z-30 nodrag nowheel`}
      style={{ background: "#1c1c1c" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-sm font-medium">{t("title")}</span>
        <button
          type="button"
          className="px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
        >
          {t("save")}
        </button>
      </div>

      {/* 3 wheels */}
      <div className="flex items-start justify-center gap-3">
        <WheelColumn title={t("pattern")} items={LIGHT_PATTERNS} selectedIndex={local.pattern} onSelect={(idx) => update("pattern", idx)} locale={loc} />
        <WheelDivider />
        <WheelColumn title={t("direction")} items={LIGHT_DIRECTIONS} selectedIndex={local.direction} onSelect={(idx) => update("direction", idx)} locale={loc} />
        <WheelDivider />
        <WheelColumn title={t("color")} items={LIGHT_COLORS} selectedIndex={local.color} onSelect={(idx) => update("color", idx)} locale={loc} />
      </div>
    </div>
  );
}

/* ── Helper: short display label ── */
export function lightingDisplayLabel(s: LightingSettings, locale: string = "zh"): string {
  const loc = (locale === "zh" ? "zh" : "en") as Locale;
  const parts: string[] = [];
  const p = LIGHT_PATTERNS[s.pattern];
  const d = LIGHT_DIRECTIONS[s.direction];
  const c = LIGHT_COLORS[s.color];
  if (p && p.id !== "none") parts.push(label(p, loc));
  if (d) parts.push(label(d, loc));
  if (c && c.id !== "none") parts.push(label(c, loc));
  return parts.slice(0, 2).join(" · ") || "Lighting";
}

/* ── Helper: build lighting prompt suffix ── */
export function lightingSettingsToPrompt(s: LightingSettings): string {
  const parts: string[] = [];
  const p = LIGHT_PATTERNS[s.pattern];
  const d = LIGHT_DIRECTIONS[s.direction];
  const c = LIGHT_COLORS[s.color];
  if (p?.prompt) parts.push(p.prompt);
  if (d?.prompt) parts.push(d.prompt);
  if (c?.prompt) parts.push(c.prompt);
  return parts.join(", ");
}
