"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";
const ACCENT = "#CCFF00";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-8 h-8 px-2 text-center place-content-center border border-zinc-700 rounded-[6px] text-sm tabular-nums">
      {children}
    </span>
  );
}

/* ── Zoom: Mouse scroll wheel ── */
function MouseScrollIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 30" fill="none" className="size-8">
      <style>{`@keyframes scrollw{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px)}}`}</style>
      {/* Mouse body */}
      <rect x="3" y="3" width="18" height="24" rx="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* Center divider */}
      <line x1="12" y1="3" x2="12" y2="13" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      {/* Scroll wheel — animated */}
      <g style={{ animation: "scrollw 1.5s ease-in-out infinite" }}>
        <rect x="10.5" y="7" width="3" height="5" rx="1.5" fill={ACCENT} fillOpacity="0.3" stroke={ACCENT} strokeWidth="1" />
      </g>
      {/* Scroll arrows */}
      <path d="M12 4.5V2" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
      <path d="M11 2.5L12 1.5l1 1" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Zoom: Trackpad pinch ── */
function TrackpadPinchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none" className="size-8">
      <style>{`@keyframes tpinch{0%,100%{transform:translate(0,0)}50%{transform:translate(var(--px),var(--py))}}`}</style>
      {/* Trackpad body */}
      <rect x="2" y="2" width="32" height="32" rx="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.2" />
      <g style={{ "--px": "-3px", "--py": "-3px", animation: "tpinch 1.8s ease-in-out infinite" } as React.CSSProperties}>
        <circle cx="14" cy="14" r="3.5" fill={ACCENT} fillOpacity="0.12" stroke={ACCENT} strokeWidth="1.2" />
        <circle cx="14" cy="14" r="1.2" fill={ACCENT} />
      </g>
      <g style={{ "--px": "3px", "--py": "3px", animation: "tpinch 1.8s ease-in-out infinite" } as React.CSSProperties}>
        <circle cx="22" cy="22" r="3.5" fill={ACCENT} fillOpacity="0.12" stroke={ACCENT} strokeWidth="1.2" />
        <circle cx="22" cy="22" r="1.2" fill={ACCENT} />
      </g>
      <path d="M11.5 11.5L9 9" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      <path d="M24.5 24.5L27 27" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      <path d="M8 10l1-1 1 1" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 26l1 1 1-1" stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Move Canvas: Mouse left-click drag ── */
function MouseDragIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 30" fill="none" className="size-8">
      <style>{`@keyframes mdrag{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,-2px)}}`}</style>
      <g style={{ animation: "mdrag 2s ease-in-out infinite" }}>
        {/* Mouse body */}
        <rect x="3" y="3" width="18" height="24" rx="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
        {/* Left button highlighted */}
        <path d="M3.6 12H12V3.3A8.7 8.7 0 003.6 12z" fill={ACCENT} fillOpacity="0.25" stroke={ACCENT} strokeWidth="1" />
        {/* Center divider */}
        <line x1="12" y1="3" x2="12" y2="13" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        {/* Scroll wheel (dim) */}
        <rect x="10.5" y="7" width="3" height="5" rx="1.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.8" />
      </g>
      {/* Move arrows */}
      <path d="M22 6l-3-3M22 6l-3 3" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="22" y1="6" x2="17" y2="6" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/* ── Move Canvas: Trackpad single-finger click-drag ── */
function TrackpadDragIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none" className="size-8">
      <style>{`@keyframes tfdrag{0%,100%{transform:translate(0,0)}50%{transform:translate(2.5px,-2.5px)}}`}</style>
      {/* Trackpad body */}
      <rect x="2" y="2" width="32" height="32" rx="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.2" />
      <g style={{ animation: "tfdrag 2s ease-in-out infinite" }}>
        <circle cx="18" cy="18" r="3.5" fill={ACCENT} fillOpacity="0.12" stroke={ACCENT} strokeWidth="1.2" />
        <circle cx="18" cy="18" r="1.3" fill={ACCENT} />
      </g>
      {/* Direction arrow */}
      <path d="M28 8l-3.5 3.5" stroke={ACCENT} strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round" />
      <path d="M25.5 8H28v2.5" stroke={ACCENT} strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: React.ReactNode[] }) {
  return (
    <div className="flex justify-between items-center flex-nowrap text-zinc-200">
      <div className="flex items-center gap-2 flex-nowrap text-nowrap text-sm">{label}</div>
      <div className="flex items-center gap-2 flex-nowrap">{keys}</div>
    </div>
  );
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const t = useTranslations("shortcuts");

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="react-flow__panel bottom center !pointer-events-auto" style={{ bottom: 52 }}>
      <div className="w-[640px] bg-[#1a1a1a] border border-zinc-700/60 rounded-2xl px-10 py-6 grid grid-cols-2 gap-14 shadow-2xl relative">
        {/* Close */}
        <button
          type="button"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        {/* ── Left column ── */}
        <div className="col-span-1 flex flex-col justify-between gap-5">
          {/* Zoom */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-normal text-zinc-500">{t("zoomSection")}</h2>
            <div className="flex flex-col gap-2.5">
              <ShortcutRow label={t("mouse")} keys={[<MouseScrollIcon key="s" />]} />
              <ShortcutRow label={t("trackpad")} keys={[<TrackpadPinchIcon key="t" />]} />
            </div>
          </div>

          {/* Move Canvas */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-normal text-zinc-500">{t("moveSection")}</h2>
            <div className="flex flex-col gap-2.5">
              <ShortcutRow label={t("mouse")} keys={[<MouseDragIcon key="d" />]} />
              <ShortcutRow label={t("trackpad")} keys={[<TrackpadDragIcon key="t" />]} />
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="col-span-1 flex flex-col gap-3">
          <h2 className="text-lg font-normal text-zinc-500">{t("otherSection")}</h2>
          <div className="flex flex-col gap-2.5">
            <ShortcutRow label={t("delete")} keys={[<Kbd key="b">⌫</Kbd>]} />
            <ShortcutRow label={t("undo")} keys={[<Kbd key="m">{MOD}</Kbd>, <Kbd key="z">Z</Kbd>]} />
            <ShortcutRow label={t("redo")} keys={[<Kbd key="s">⇧</Kbd>, <Kbd key="m">{MOD}</Kbd>, <Kbd key="z">Z</Kbd>]} />
            <ShortcutRow label={t("copy")} keys={[<Kbd key="m">{MOD}</Kbd>, <Kbd key="c">C</Kbd>]} />
            <ShortcutRow label={t("paste")} keys={[<Kbd key="m">{MOD}</Kbd>, <Kbd key="v">V</Kbd>]} />
            <ShortcutRow label={t("duplicate")} keys={[<Kbd key="s">⇧</Kbd>, <Kbd key="m">{MOD}</Kbd>, <Kbd key="v">V</Kbd>]} />
          </div>
        </div>
      </div>
    </div>
  );
}
