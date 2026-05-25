"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { MiniMap, useReactFlow, useStore } from "@xyflow/react";
import { Focus, HelpCircle, Info, Search, Hand, MousePointer2 } from "lucide-react";
import { useLocalePath } from "@/hooks/use-locale-path";
import { CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM } from "./zoom-config";

function MapLocateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor">
      <path d="M512 659.093c32 0 211.307-224.427 211.307-341.333a211.307 211.307 0 0 0-422.614 0c0 116.907 179.307 341.333 211.307 341.333zm-136.64-341.333a136.64 136.64 0 0 1 273.28 0c0 22.773-17.867 76.64-68.16 153.547a814.827 814.827 0 0 1-68.48 90.666 814.827 814.827 0 0 1-68.48-90.666C393.227 394.667 375.36 340.747 375.36 317.973z" />
      <path d="M512 306.187a53.333 53.333 0 1 0 0 106.666 53.333 53.333 0 0 0 0-106.666z" />
      <path d="M771.467 405.707l33.333 42.933a5.333 5.333 0 0 0 7.573.8l21.6-17.867a5.333 5.333 0 0 1 8.694 4.107v268.96a5.333 5.333 0 0 1-2.4 4.48l-187.254 122.187a5.333 5.333 0 0 1-5.333 0l-281.12-162.134a5.333 5.333 0 0 0-5.333 0L189.6 784.747a5.333 5.333 0 0 1-8.267-4.374V510.72a5.333 5.333 0 0 1 1.867-4.107l69.333-58.186a5.333 5.333 0 0 0 .96-7.04l-33.44-49.654a5.333 5.333 0 0 0-7.466-1.386L108.96 462.72a5.333 5.333 0 0 0-2.293 4.373v440.534a5.333 5.333 0 0 0 8.16 4.48L362.667 753.76a5.333 5.333 0 0 1 5.333 0l280.533 162.133a5.333 5.333 0 0 0 5.334 0l260.533-162.08a5.333 5.333 0 0 0 2.507-4.48V309.333a5.333 5.333 0 0 0-8.32-4.373l-135.947 93.12a5.333 5.333 0 0 0-1.173 7.627z" />
    </svg>
  );
}

function GridDotsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="5" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="19" cy="5" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="19" r="1" />
      <circle cx="12" cy="19" r="1" />
      <circle cx="19" cy="19" r="1" />
    </svg>
  );
}

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

interface CanvasControlsProps {
  showGrid: boolean;
  snapToGrid: boolean;
  showMiniMap: boolean;
  onToggleGrid: () => void;
  onToggleMiniMap: () => void;
  interactionMode: "select" | "pan";
  onToggleInteractionMode: () => void;
  onShowShortcuts: () => void;
}

export function CanvasControls({
  showGrid,
  snapToGrid,
  showMiniMap,
  onToggleGrid,
  onToggleMiniMap,
  interactionMode,
  onToggleInteractionMode,
  onShowShortcuts,
}: CanvasControlsProps) {
  const t = useTranslations("controls");
  const lp = useLocalePath();
  const { fitView, zoomTo } = useReactFlow();
  const zoom = useStore(zoomSelector);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const helpMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark") || document.body.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const minZoom = CANVAS_MIN_ZOOM;
  const maxZoom = CANVAS_MAX_ZOOM;
  const sliderValueRaw = ((zoom - minZoom) / (maxZoom - minZoom)) * 100;
  const sliderValue = Math.max(0, Math.min(100, sliderValueRaw));

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value) / 100;
    const newZoom = minZoom + pct * (maxZoom - minZoom);
    zoomTo(newZoom);
  };

  useEffect(() => {
    if (!showHelpMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target as Node)) {
        setShowHelpMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showHelpMenu]);

  return (
    <div className="absolute bottom-3 left-3 z-50 flex flex-col gap-y-2">
      {showMiniMap && (
        <div className="relative w-[200px] h-[150px] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700/50 shadow-lg">
          <MiniMap
            className="xinyu-minimap"
            pannable
            zoomable
            maskColor={isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}
            maskStrokeColor={isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.5)"}
            maskStrokeWidth={1.5}
            nodeColor={isDark ? "rgba(90,90,99,0.5)" : "rgba(180,180,180,0.5)"}
            nodeStrokeColor={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.2)"}
            nodeStrokeWidth={1}
            nodeBorderRadius={4}
            bgColor={isDark ? "rgba(24,24,27,0.92)" : "rgba(255,255,255,0.92)"}
          />
        </div>
      )}

      <div className="flex items-center gap-x-2">
        {/* Main pill */}
        <div className="flex h-8 px-1 bg-white dark:bg-[#1a1a1a] border border-zinc-200/80 dark:border-transparent items-center rounded-full shadow-lg">
          {/* Interaction mode toggle */}
          <button
            className={`size-6 mx-px rounded-full flex items-center justify-center transition-colors duration-300 cursor-pointer ${
              interactionMode === "select" ? "text-black bg-[#CCFF00]" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
            }`}
            onClick={onToggleInteractionMode}
            title={interactionMode === "select" ? t("selectMode") : t("panMode")}
          >
            {interactionMode === "select" ? <MousePointer2 size={14} /> : <Hand size={14} />}
          </button>

          {/* Toggle MiniMap */}
          <button
            className={`size-6 mx-px rounded-full flex items-center justify-center transition-colors duration-300 cursor-pointer ${
              showMiniMap ? "text-black bg-[#CCFF00]" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
            }`}
            onClick={onToggleMiniMap}
            title={showMiniMap ? t("hideMinimap") : t("showMinimap")}
          >
            <MapLocateIcon size={14} />
          </button>

          {/* Grid dots toggle */}
          <button
            className={`size-6 mx-px rounded-full flex items-center justify-center cursor-pointer transition-colors duration-300 ${
              showGrid && snapToGrid ? "text-black bg-[#CCFF00]" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
            }`}
            onClick={onToggleGrid}
            title={snapToGrid ? t("disableSnap") : t("enableSnap")}
          >
            <GridDotsIcon size={14} />
          </button>

          {/* Fit view / center */}
          <button
            className="rounded-full aspect-square px-1.5 mr-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
            onClick={() => fitView({ padding: 0.2 })}
            title={t("fitView")}
          >
            <Focus size={18} />
          </button>

          {/* Zoom slider */}
          <div className="flex w-[70px] items-center rounded-full pr-2">
            <input
              type="range"
              min={0}
              max={100}
              value={sliderValue}
              onChange={handleSliderChange}
              className="w-full h-1.5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-200 [&::-webkit-slider-thumb]:shadow-md"
              title={`${Math.round(zoom * 100)}%`}
            />
          </div>
        </div>

        {/* Help button + popover */}
        <div className="relative" ref={helpMenuRef}>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-[#1a1a1a] border border-zinc-200/80 dark:border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-white shadow-lg cursor-pointer"
            title={t("help")}
            onClick={() => setShowHelpMenu((v) => !v)}
          >
            <HelpCircle size={20} />
          </button>

          {showHelpMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white/85 dark:bg-[#1a1a1a]/85 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700/60 rounded-2xl p-1 min-w-[160px] shadow-2xl z-50">
              <Link
                href={lp("/tutorial")}
                className="w-full flex items-center gap-2 p-3 text-sm text-zinc-700 dark:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                onClick={() => setShowHelpMenu(false)}
                target="_blank"
              >
                <Info size={20} />
                {t("tutorial")}
              </Link>
              <button
                className="w-full flex items-center gap-2 p-3 text-sm text-zinc-700 dark:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                onClick={() => {
                  setShowHelpMenu(false);
                  onShowShortcuts();
                }}
              >
                <Search size={20} />
                {t("shortcuts")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
