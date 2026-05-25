"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

/* ── Asset base URL ── */
const CAM = "/camera";
const BG = `${CAM}/camera-control-bg.png`;

/* ── Data ── */
interface WheelItem {
  id: string;
  label: string;
  img?: string;
  recommended?: boolean;
}

/* ── Row 1: Camera hardware ── */
const CAMERAS: WheelItem[] = [
  { id: "sony-venice", label: "Sony Venice", img: `${CAM}/sony-venice.png`, recommended: true },
  { id: "arri-alexa-35", label: "Arri Alexa 35", img: `${CAM}/arri-alexa-35.png`, recommended: true },
  { id: "arri-alexa-65", label: "Arri Alexa 65", img: `${CAM}/arri-alexa-65.png` },
  { id: "red-v-raptor", label: "Red V-Raptor", img: `${CAM}/red-v-raptor.png`, recommended: true },
  { id: "panavision-dxl2", label: "Panavision DXL2", img: `${CAM}/panavision-dxl2.png` },
  { id: "arricam-lt", label: "Arricam LT", img: `${CAM}/arricam-lt.png` },
  { id: "arriflex-435", label: "ArriFlex 435", img: `${CAM}/arriflex-435.png` },
  { id: "imax-keighley", label: "IMAX Keighley", img: `${CAM}/imax-keighley.png` },
  { id: "imax-film", label: "IMAX Film Camera", img: `${CAM}/imax-film-camera.png` },
];

const LENSES: WheelItem[] = [
  { id: "zeiss-ultra-prime", label: "Zeiss Ultra Prime", img: `${CAM}/zeiss-ultra-prime.png`, recommended: true },
  { id: "arri-signature-prime", label: "Arri Signature Prime", img: `${CAM}/arri-signature-prime.png`, recommended: true },
  { id: "canon-k35", label: "Canon K-35", img: `${CAM}/canon-k35.png` },
  { id: "cooke-s4", label: "Cooke S4", img: `${CAM}/cooke-s4.png`, recommended: true },
  { id: "cooke-panchro", label: "Cooke Panchro", img: `${CAM}/cooke-speed-panchro.png` },
  { id: "cooke-sf-18x", label: "Cooke SF 1.8x", img: `${CAM}/cooke-sf-18x.png` },
  { id: "helios", label: "Helios", img: `${CAM}/helios.png` },
  { id: "panavision-c", label: "Panavision C-series", img: `${CAM}/panavision-c-series.png` },
  { id: "panavision-primo", label: "Panavision Primo", img: `${CAM}/panavision-primo.png` },
  { id: "hawk-class-x", label: "Hawk Class X", img: `${CAM}/hawk-class-x.png` },
];

const FOCALS: WheelItem[] = [
  { id: "8mm", label: "8mm" },
  { id: "14mm", label: "14mm" },
  { id: "24mm", label: "24mm", recommended: true },
  { id: "35mm", label: "35mm", recommended: true },
  { id: "50mm", label: "50mm", recommended: true },
  { id: "75mm", label: "75mm" },
  { id: "125mm", label: "125mm" },
];

const APERTURES: WheelItem[] = [
  { id: "f1.4", label: "ƒ/1.4", img: `${CAM}/f1_4.png`, recommended: true },
  { id: "f4", label: "ƒ/4", img: `${CAM}/f4.png`, recommended: true },
  { id: "f11", label: "ƒ/11", img: `${CAM}/f11.png` },
];

/* ── Row 2: Cinematic look ── */
const FILM_STOCKS: WheelItem[] = [
  { id: "vision3-500t", label: "Vision3 500T", recommended: true },
  { id: "vision3-250d", label: "Vision3 250D", recommended: true },
  { id: "portra-400", label: "Portra 400", recommended: true },
  { id: "eterna-500", label: "Eterna 500" },
  { id: "cinestill-800t", label: "CineStill 800T" },
  { id: "tri-x-400", label: "Tri-X 400 B&W" },
  { id: "hp5", label: "Ilford HP5 B&W" },
  { id: "ektar-100", label: "Ektar 100" },
];

const LIGHTINGS: WheelItem[] = [
  { id: "golden-hour", label: "Golden Hour", recommended: true },
  { id: "blue-hour", label: "Blue Hour" },
  { id: "studio-softbox", label: "Studio Softbox", recommended: true },
  { id: "hard-sidelight", label: "Hard Sidelight" },
  { id: "rembrandt", label: "Rembrandt", recommended: true },
  { id: "neon", label: "Neon / Cyberpunk" },
  { id: "overcast", label: "Natural Overcast" },
  { id: "backlit", label: "Backlit / Silhouette" },
];

const SHOT_TYPES: WheelItem[] = [
  { id: "extreme-cu", label: "Extreme CU" },
  { id: "close-up", label: "Close-up", recommended: true },
  { id: "medium-cu", label: "Medium CU" },
  { id: "medium", label: "Medium Shot", recommended: true },
  { id: "full", label: "Full Shot" },
  { id: "wide", label: "Wide Shot", recommended: true },
  { id: "extreme-wide", label: "Extreme Wide" },
  { id: "birds-eye", label: "Bird's Eye" },
  { id: "low-angle", label: "Low Angle" },
];

const FILTERS: WheelItem[] = [
  { id: "none", label: "None", recommended: true },
  { id: "pro-mist-1/4", label: "Pro Mist 1/4", recommended: true },
  { id: "pro-mist-1/2", label: "Pro Mist 1/2" },
  { id: "black-pro-mist", label: "Black Pro Mist" },
  { id: "polarizer", label: "Polarizer", recommended: true },
  { id: "streak", label: "Streak Filter" },
  { id: "glimmer", label: "Glimmer Glass" },
];

/* ── Triangle arrow SVG ── */
function TriArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={`text-zinc-500 transition-all duration-200 ${direction === "up" ? "rotate-90" : "-rotate-90"}`}
    >
      <path d="M12 1.67a2.914 2.914 0 0 0 -2.492 1.403l-8.11 13.537a2.914 2.914 0 0 0 2.484 4.385h16.225a2.914 2.914 0 0 0 2.503 -4.371l-8.116 -13.546a2.917 2.917 0 0 0 -2.494 -1.408z" />
    </svg>
  );
}

/* ── Single vertical scroll wheel ── */
const ITEM_H = 80;
const VIEW_H = 164;
const CENTER_OFFSET = Math.floor((VIEW_H - ITEM_H) / 2); // 42

function CameraWheel({ items, selectedIndex, onSelect }: {
  items: WheelItem[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartIndex = useRef(0);
  const translateY = CENTER_OFFSET - selectedIndex * ITEM_H;

  const clamp = useCallback((idx: number) => Math.max(0, Math.min(items.length - 1, idx)), [items.length]);

  const prev = useCallback(() => { onSelect(clamp(selectedIndex - 1)); }, [selectedIndex, onSelect, clamp]);
  const next = useCallback(() => { onSelect(clamp(selectedIndex + 1)); }, [selectedIndex, onSelect, clamp]);

  /* ── Drag handling ── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartIndex.current = selectedIndex;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [selectedIndex]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dy = dragStartY.current - e.clientY;
    const steps = Math.round(dy / (ITEM_H * 0.6));
    const newIdx = clamp(dragStartIndex.current + steps);
    if (newIdx !== selectedIndex) onSelect(newIdx);
  }, [selectedIndex, onSelect, clamp]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* ── Mouse wheel handling (passive: false to prevent page scroll) ── */
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
      {/* Up arrow */}
      <button
        type="button"
        className="flex items-center justify-center transition-colors duration-200 hover:text-zinc-300"
        onMouseDown={(e) => { e.preventDefault(); prev(); }}
      >
        <TriArrow direction="up" />
      </button>

      {/* Wheel viewport */}
      <div
        ref={viewportRef}
        className="relative select-none"
        style={{ width: 80, height: VIEW_H, cursor: "grab", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
                  {item.img ? (
                    <div className="relative flex items-center justify-center h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.img}
                        alt={item.label}
                        className={`object-contain transition-all ${isSelected ? "w-16 h-16 opacity-100" : "w-12 h-12 opacity-50"}`}
                        draggable={false}
                        style={{ transitionDuration: "200ms" }}
                      />
                      {isSelected && (
                        <span
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 text-zinc-400 text-[10px] font-bold uppercase px-2 pt-0.5 rounded-t-[4px] bg-zinc-900/80"
                          style={{ boxShadow: "rgba(156,163,175,0.15) 0px 0px 8px 2px inset" }}
                        >
                          {item.label.split(" ").pop()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`font-semibold transition-all select-none whitespace-nowrap ${
                        isSelected ? "text-white text-sm" : "text-zinc-500 text-xs"
                      }`}
                      style={{ transitionDuration: "200ms" }}
                    >
                      {item.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Down arrow */}
      <button
        type="button"
        className="flex items-center justify-center transition-colors duration-200 hover:text-zinc-300"
        onMouseDown={(e) => { e.preventDefault(); next(); }}
      >
        <TriArrow direction="down" />
      </button>
    </div>
  );
}

/* ── Divider between wheels ── */
function WheelDivider() {
  return <div className="w-0.5 bg-white/10 h-20 mb-9" />;
}

/* ── Wheel column with category title ── */
function WheelColumn({ title, items, selectedIndex, onSelect }: {
  title: string;
  items: WheelItem[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{title}</span>
      <CameraWheel items={items} selectedIndex={selectedIndex} onSelect={onSelect} />
      <span className="text-white text-xs font-medium mt-2 max-w-[110px] text-center truncate">
        {items[selectedIndex]?.label ?? ""}
      </span>
    </div>
  );
}

/* ── Tab filter types ── */
type FilterTab = "all" | "recommended";

/* ── Exported: Camera Control Popover ── */
export interface CameraSettings {
  camera: number;
  lens: number;
  focal: number;
  aperture: number;
  filmStock: number;
  lighting: number;
  shotType: number;
  filter: number;
}

const DEFAULT_SETTINGS: CameraSettings = {
  camera: 0, lens: 0, focal: 2, aperture: 1,
  filmStock: 0, lighting: 0, shotType: 3, filter: 0,
};

/* ── All wheel configs in order ── */
interface WheelConfig {
  key: keyof CameraSettings;
  title: string;
  items: WheelItem[];
}

const ROW1: WheelConfig[] = [
  { key: "camera", title: "CAMERA", items: CAMERAS },
  { key: "lens", title: "LENS", items: LENSES },
  { key: "focal", title: "FOCAL", items: FOCALS },
  { key: "aperture", title: "APERTURE", items: APERTURES },
];

/* ── Recommended presets: curated camera+lens+focal+aperture combos ── */
interface CameraPreset {
  name: string;
  descKey: string;
  camera: number;
  lens: number;
  focal: number;
  aperture: number;
}

const PRESETS: CameraPreset[] = [
  { name: "Cinematic Standard",  descKey: "presetCinematic", camera: 0, lens: 0, focal: 3, aperture: 0 },
  { name: "Arri Signature",      descKey: "presetArri", camera: 1, lens: 1, focal: 4, aperture: 0 },
  { name: "Vintage Film",        descKey: "presetVintage", camera: 6, lens: 2, focal: 3, aperture: 0 },
  { name: "Portrait Dreamy",     descKey: "presetPortrait", camera: 0, lens: 4, focal: 5, aperture: 0 },
  { name: "Wide Epic",           descKey: "presetWideEpic", camera: 2, lens: 0, focal: 1, aperture: 1 },
];

/* ── Build per-wheel item arrays from presets ── */
const PRESET_CAMERAS: WheelItem[] = PRESETS.map((p) => CAMERAS[p.camera]);
const PRESET_LENSES: WheelItem[] = PRESETS.map((p) => LENSES[p.lens]);
const PRESET_FOCALS: WheelItem[] = PRESETS.map((p) => FOCALS[p.focal]);
const PRESET_APERTURES: WheelItem[] = PRESETS.map((p) => APERTURES[p.aperture]);

const PRESET_WHEELS: { title: string; items: WheelItem[] }[] = [
  { title: "CAMERA", items: PRESET_CAMERAS },
  { title: "LENS", items: PRESET_LENSES },
  { title: "FOCAL", items: PRESET_FOCALS },
  { title: "APERTURE", items: PRESET_APERTURES },
];

export function CameraControlPopover({
  settings,
  onChange,
  onClose,
  flipUp,
  popoverRef,
}: {
  settings?: CameraSettings;
  onChange: (s: CameraSettings) => void;
  onClose: () => void;
  flipUp?: boolean;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("camera");
  const [local, setLocal] = useState<CameraSettings>(settings ?? DEFAULT_SETTINGS);
  const [tab, setTab] = useState<FilterTab>("all");
  const [presetIndex, setPresetIndex] = useState(0);

  const update = useCallback((key: keyof CameraSettings, val: number) => {
    setLocal((prev) => {
      const next = { ...prev, [key]: val };
      queueMicrotask(() => onChange(next));
      return next;
    });
  }, [onChange]);

  const applyPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    if (!p) return;
    setPresetIndex(idx);
    setLocal((prev) => {
      const next = { ...prev, camera: p.camera, lens: p.lens, focal: p.focal, aperture: p.aperture };
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
      {/* Header: title + tabs + save */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-white text-sm font-medium">{t("title")}</span>

        {/* Tab pills */}
        <div className="flex items-center gap-1 mx-3">
          {(["all", "recommended"] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors duration-200 ${
                tab === tabKey ? "bg-white text-black" : "text-zinc-400 hover:text-zinc-200"
              }`}
              onMouseDown={(e) => { e.preventDefault(); setTab(tabKey); }}
            >
              {tabKey === "all" ? t("all") : t("recommended")}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
        >
          {t("save")}
        </button>
      </div>

      {/* Wheels */}
      {tab === "all" ? (
        /* ── 全部: each wheel scrolls independently ── */
        <div className="flex items-start justify-center gap-3">
          {ROW1.map((cfg, i) => (
            <React.Fragment key={cfg.key}>
              {i > 0 && <WheelDivider />}
              <WheelColumn
                title={cfg.title}
                items={cfg.items}
                selectedIndex={local[cfg.key]}
                onSelect={(idx) => update(cfg.key, idx)}
              />
            </React.Fragment>
          ))}
        </div>
      ) : (
        /* ── 推荐: all wheels scroll together (preset combos) ── */
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-start justify-center gap-3">
            {PRESET_WHEELS.map((pw, i) => (
              <React.Fragment key={pw.title}>
                {i > 0 && <WheelDivider />}
                <WheelColumn
                  title={pw.title}
                  items={pw.items}
                  selectedIndex={presetIndex}
                  onSelect={applyPreset}
                />
              </React.Fragment>
            ))}
          </div>
          {/* Preset name + description */}
          <div className="text-center bg-zinc-800/60 px-3 py-1.5 rounded-lg max-w-full">
            <span className="text-xs font-medium text-white">{PRESETS[presetIndex]?.name ?? ""}</span>
            <span className="text-[10px] text-zinc-500 ml-1.5">{t(PRESETS[presetIndex]?.descKey ?? "presetCinematic")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper: short display label for the action bar button ── */
export function cameraDisplayLabel(s: CameraSettings): string {
  return CAMERAS[s.camera]?.label ?? "Camera Control";
}

/* ── Helper: build camera prompt suffix ── */
export function cameraSettingsToPrompt(s: CameraSettings): string {
  const parts: string[] = [];
  const camera = CAMERAS[s.camera]?.label;
  const lens = LENSES[s.lens]?.label;
  const focal = FOCALS[s.focal]?.label;
  const aperture = APERTURES[s.aperture]?.label;
  const film = FILM_STOCKS[s.filmStock]?.label;
  const light = LIGHTINGS[s.lighting]?.label;
  const shot = SHOT_TYPES[s.shotType]?.label;
  const filter = FILTERS[s.filter]?.label;

  if (camera) parts.push(`Shot on ${camera}`);
  if (lens) parts.push(`${lens} lens`);
  if (focal) parts.push(focal);
  if (aperture) parts.push(aperture);
  if (film) parts.push(`${film} film stock`);
  if (light) parts.push(`${light} lighting`);
  if (shot) parts.push(`${shot} framing`);
  if (filter && filter !== "None") parts.push(`${filter} filter`);
  return parts.join(", ");
}
