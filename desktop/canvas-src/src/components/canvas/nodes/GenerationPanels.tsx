"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUp, MousePointer2, Palette, Settings2,
  Fullscreen, Volume2, VolumeX,
} from "lucide-react";
import type { NodeType } from "@/types/canvas";
import { PromptEditor } from "./PromptEditor";

/* ══════════════════════════════════════════════════════════════════
   Shared sub-components
   ══════════════════════════════════════════════════════════════════ */

/* ── Gemini SVG icon ── */
function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M8.998 2.385c.54 1.521 1.412 2.908 2.558 4.057l.002.001a9.06 9.06 0 003.444 2.323c.2.086.404.163.609.236a9.108 9.108 0 00-4.054 2.56l-.001.001a9.108 9.108 0 00-2.558 4.054 9.108 9.108 0 00-2.559-4.055l-.001-.001-.264-.254a9.11 9.11 0 00-4.057-2.305 9.108 9.108 0 004.057-2.559l.001-.001A9.108 9.108 0 008.998 2.385z"
        stroke="#A3A3A3"
        strokeWidth="1.33"
      />
    </svg>
  );
}

/* ── Credits icon (project logo) ── */
function CreditsIcon() {
  return (
    <img src="/infinite_logo.svg" width="16" height="16" alt="Xins" className="brightness-0 invert opacity-80" />
  );
}

/* ── Aspect ratio visual indicator ── */
function AspectRatioIcon({ w, h }: { w: number; h: number }) {
  const maxSize = 16;
  const ratio = w / h;
  const iconW = ratio >= 1 ? maxSize : Math.round(maxSize * ratio);
  const iconH = ratio >= 1 ? Math.round(maxSize / ratio) : maxSize;
  return (
    <div className="flex items-center justify-center flex-none" style={{ width: 16, height: 16 }}>
      <div className="border-[1.5px] border-current rounded-[2px]" style={{ width: iconW, height: iconH }} />
    </div>
  );
}

/* ── Magic reference button icon (style/cursor) ── */
function MagicRefIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M14 7.33333V3.33333C14 2.97971 13.8595 2.64057 13.6095 2.39052C13.3594 2.14048 13.0203 2 12.6667 2H3.33333C2.97971 2 2.64057 2.14048 2.39052 2.39052C2.14048 2.64057 2 2.97971 2 3.33333V12.6667C2 13.0203 2.14048 13.3594 2.39052 13.6095C2.64057 13.8595 2.97971 14 3.33333 14H7.33333M8.02267 8.454C7.99863 8.39371 7.9928 8.32769 8.00589 8.26412C8.01898 8.20055 8.05041 8.14221 8.09631 8.09631C8.14221 8.05041 8.20055 8.01898 8.26412 8.00589C8.32769 7.9928 8.39371 7.99863 8.454 8.02267L14.454 10.356C14.5183 10.3811 14.5733 10.4256 14.6112 10.4833C14.6491 10.541 14.6682 10.6091 14.6658 10.6781C14.6634 10.7472 14.6396 10.8137 14.5977 10.8686C14.5558 10.9235 14.4979 10.9641 14.432 10.9847L12.136 11.6967C12.0324 11.7287 11.9382 11.7855 11.8615 11.8622C11.7848 11.9389 11.728 12.0331 11.696 12.1367L10.9847 14.432C10.9641 14.4979 10.9235 14.5558 10.8686 14.5977C10.8137 14.6396 10.7472 14.6634 10.6781 14.6658C10.6091 14.6682 10.541 14.6491 10.4833 14.6112C10.4256 14.5733 10.3811 14.5183 10.356 14.454L8.02267 8.454Z"
        stroke="currentColor"
        strokeOpacity="0.88"
        strokeWidth="0.975"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Style icon (image with sparkle) ── */
function StyleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
      <path
        d="M13.379 0.768C13.279 0.344 13.198 0 13 0C12.802 0 12.721 0.345 12.621 0.769C12.515 1.22 12.387 1.762 12.075 2.075C11.762 2.387 11.22 2.515 10.769 2.621C10.345 2.721 10 2.802 10 3C10 3.198 10.344 3.279 10.768 3.379C11.219 3.486 11.762 3.613 12.075 3.927C12.389 4.241 12.517 4.783 12.622 5.234C12.722 5.657 12.802 6 13 6C13.198 6 13.279 5.657 13.379 5.234C13.486 4.783 13.613 4.241 13.927 3.927C14.241 3.614 14.783 3.486 15.234 3.379C15.657 3.279 16 3.198 16 3C16 2.802 15.656 2.721 15.232 2.621C14.781 2.515 14.241 2.387 13.927 2.075C13.613 1.762 13.486 1.219 13.379 0.768Z"
        fill="currentColor"
        fillOpacity="0.88"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.38 1.338C11.093 1.333 10.769 1.333 10.4 1.333H5.6C4.106 1.333 3.36 1.333 2.789 1.624C2.288 1.88 1.88 2.288 1.624 2.789C1.333 3.36 1.333 4.107 1.333 5.6V10.4C1.333 11.894 1.333 12.64 1.624 13.211C1.88 13.712 2.288 14.12 2.789 14.376C3.36 14.667 4.106 14.667 5.6 14.667H10.4C11.893 14.667 12.64 14.667 13.211 14.376C13.712 14.12 14.12 13.712 14.376 13.211C14.667 12.64 14.667 11.894 14.667 10.4V5.6C14.667 5.232 14.667 4.91 14.662 4.624C14.601 4.677 14.562 4.746 14.52 4.859C14.447 5.053 14.399 5.261 14.351 5.469C14.256 5.881 14.161 6.294 13.869 6.612C13.718 6.776 13.532 6.887 13.333 6.945V10.4C13.333 11.169 13.332 11.665 13.301 12.043C13.272 12.405 13.222 12.539 13.188 12.605C13.06 12.856 12.856 13.06 12.605 13.188C12.539 13.222 12.405 13.272 12.043 13.301C12.025 13.303 12.006 13.304 11.988 13.306L7.502 8.821C7.122 8.44 6.81 8.128 6.536 7.896C6.253 7.655 5.97 7.464 5.637 7.356C5.114 7.186 4.552 7.186 4.03 7.356C3.696 7.464 3.414 7.655 3.13 7.896C2.987 8.017 2.834 8.16 2.667 8.323V5.6C2.667 4.831 2.668 4.335 2.698 3.957C2.728 3.595 2.778 3.461 2.812 3.395C2.94 3.144 3.144 2.94 3.395 2.812C3.461 2.778 3.595 2.728 3.957 2.699C4.335 2.668 4.831 2.667 5.6 2.667H9.055C9.113 2.468 9.224 2.281 9.388 2.131C9.707 1.838 10.122 1.743 10.535 1.648C10.743 1.601 10.951 1.553 11.145 1.481C11.258 1.439 11.327 1.4 11.38 1.338ZM6.672 9.687L10.318 13.333H5.6C4.831 13.333 4.335 13.332 3.957 13.301C3.595 13.272 3.461 13.222 3.395 13.188C3.144 13.06 2.94 12.856 2.812 12.605C2.778 12.539 2.728 12.405 2.698 12.043C2.668 11.665 2.667 11.169 2.667 10.4V10.015L2.995 9.687C3.398 9.284 3.675 9.008 3.907 8.811C4.134 8.618 4.278 8.537 4.401 8.497C4.682 8.406 4.985 8.406 5.266 8.497C5.389 8.537 5.533 8.618 5.76 8.811C5.992 9.008 6.269 9.284 6.672 9.687Z"
        fill="currentColor"
        fillOpacity="0.88"
      />
    </svg>
  );
}

/* ── Camera off icon ── */
function CameraOffIcon() {
  return (
    <img
      src="data:image/svg+xml,%3csvg%20width='20'%20height='20'%20viewBox='0%200%2020%2020'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M3.33%208.33h13.33v3.33H3.33z'%20stroke='%23a3a3a3'%20stroke-width='1.5'/%3e%3cpath%20d='M10%205l3.33%203.33H6.67z'%20stroke='%23a3a3a3'%20stroke-width='1.5'/%3e%3c/svg%3e"
      alt="Camera Off"
      className="select-none w-5 h-5"
      draggable={false}
    />
  );
}

/* ── Shared floating panel shell ── */
function PanelShell({
  inverseZoom,
  children,
}: {
  inverseZoom: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute left-1/2 z-20 w-full pointer-events-auto nowheel transition-transform duration-150 ease-out"
      style={{
        bottom: "-8px",
        transform: `translateX(-50%) translateY(100%) scale(${inverseZoom})`,
        transformOrigin: "center top",
        minWidth: 640,
        maxWidth: 650,
      }}
    >
      <div className="bg-[#1e1e1e] rounded-[20px] border border-zinc-700/60 shadow-lg mt-2 w-full relative group">
        {children}
      </div>
    </div>
  );
}

/* ── Credits pill + send button (shared across all panels) ── */
function CreditsPill({
  credits,
  unit,
  disabled,
}: {
  credits: string;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="nodrag flex items-center gap-1 rounded-full p-1 border border-white/10"
      style={{
        backdropFilter: "blur(10px)",
        background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)",
      }}
    >
      <div className="flex items-center text-sm text-zinc-200 font-medium box-border pl-1">
        <CreditsIcon />
        <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">
          {credits}{unit ?? ""}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="nodrag aspect-square w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        aria-label="Generate"
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <ArrowUp size={16} />
      </button>
    </div>
  );
}

/* ── Count button (1×) ── */
function CountButton() {
  return (
    <button
      type="button"
      className="nodrag flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 active:bg-white/[0.1] transition"
      aria-label="Generate 1 variations"
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <span>1×</span>
    </button>
  );
}

/* ── Divider ── */
function Divider() {
  return <div className="w-px h-4 bg-zinc-700" />;
}

/* ══════════════════════════════════════════════════════════════════
   Shared props
   ══════════════════════════════════════════════════════════════════ */

export interface GenerationPanelProps {
  prompt: string;
  modelId: string;
  aspectRatio: string;
  onPromptChange: (v: string) => void;
  onAspectRatioChange: (v: string) => void;
  inverseZoom: number;
}

/* ── Aspect ratio options ── */
const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1", resolution: "1K", w: 1, h: 1 },
  { value: "16:9", label: "16:9", resolution: "2K", w: 16, h: 9 },
  { value: "9:16", label: "9:16", resolution: "2K", w: 9, h: 16 },
  { value: "4:3", label: "4:3", resolution: "1K", w: 4, h: 3 },
  { value: "3:4", label: "3:4", resolution: "1K", w: 3, h: 4 },
];

/* ── Default models ── */
const DEFAULT_MODEL: Record<string, string> = {
  text: "Gemini 3 Flash",
  "image-gen": "Banana 2",
  "video-gen": "Kling 3.0",
};

/* ══════════════════════════════════════════════════════════════════
   1. TextGenerationPanel
   ══════════════════════════════════════════════════════════════════ */

export function TextGenerationPanel({
  prompt,
  modelId,
  onPromptChange,
  inverseZoom,
}: Omit<GenerationPanelProps, "aspectRatio" | "onAspectRatioChange">) {
  const t = useTranslations("canvas");
  const modelLabel = modelId || DEFAULT_MODEL["text"];

  return (
    <PanelShell inverseZoom={inverseZoom}>
      {/* ── Prompt ── */}
      <div className="relative flex justify-between flex-1 pt-1 nodrag nowheel">
        <PromptEditor
          content={prompt}
          onChange={onPromptChange}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: 104, maxHeight: 156 }}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          <button
            className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <GeminiIcon />
            <span className="whitespace-nowrap capitalize">{modelLabel}</span>
          </button>
        </div>

        {/* Right: count + credits */}
        <div className="flex items-center gap-1">
          <CountButton />
          <CreditsPill credits="1" disabled />
        </div>
      </div>
    </PanelShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   2. ImageGenerationPanel
   ══════════════════════════════════════════════════════════════════ */

export function ImageGenerationPanel({
  prompt,
  modelId,
  aspectRatio,
  onPromptChange,
  onAspectRatioChange,
  inverseZoom,
}: GenerationPanelProps) {
  const t = useTranslations("canvas");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAspectPicker, setShowAspectPicker] = useState(false);
  const modelLabel = modelId || DEFAULT_MODEL["image-gen"];
  const currentRatio = ASPECT_RATIOS.find((r) => r.value === aspectRatio) || ASPECT_RATIOS[1];

  return (
    <PanelShell inverseZoom={inverseZoom}>
      {/* ── Reference images row ── */}
      <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-2 nodrag items-center">
            {/* Magic reference button */}
            <button
              type="button"
              className="nodrag size-[38px] flex items-center justify-center rounded-[10px] border border-white/10 cursor-pointer shrink-0 focus:outline-none bg-white/[0.06] hover:bg-white/[0.12] transition-all"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <MagicRefIcon className="size-4 transition-colors text-zinc-500 hover:text-zinc-300" />
            </button>
            {/* TODO: connected parent image thumbnails will go here */}
          </div>
        </div>
      </div>

      {/* ── Prompt ── */}
      <div className="relative flex justify-between flex-1 nodrag nowheel">
        <PromptEditor
          content={prompt}
          onChange={onPromptChange}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: 104, maxHeight: 156 }}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          {/* Model selector */}
          <button
            className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <GeminiIcon />
            <span className="whitespace-nowrap capitalize">{modelLabel}</span>
          </button>

          <Divider />

          {/* Aspect ratio selector */}
          <div className="relative">
            <button
              className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowAspectPicker(!showAspectPicker); }}
            >
              <AspectRatioIcon w={currentRatio.w} h={currentRatio.h} />
              <span>{currentRatio.label} · {currentRatio.resolution}</span>
            </button>
            {showAspectPicker && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[160px] z-10">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    className={`nodrag w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-white/5 transition ${
                      r.value === aspectRatio ? "text-white" : "text-zinc-400"
                    }`}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAspectRatioChange(r.value);
                      setShowAspectPicker(false);
                    }}
                  >
                    <AspectRatioIcon w={r.w} h={r.h} />
                    <span>{r.label} · {r.resolution}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Divider />

          {/* Style selector */}
          <div className="relative flex items-center h-9 rounded-lg transition-all duration-200 hover:bg-zinc-800 active:bg-white/[0.1] cursor-pointer">
            <div className="flex items-center justify-center w-7 h-7 m-0.5 rounded-md">
              <StyleIcon />
            </div>
            <span className="text-sm font-medium whitespace-nowrap pr-2 text-zinc-300">{t("style")}</span>
          </div>

          <Divider />

          {/* Camera control toggle */}
          <div className="relative flex items-center h-9 rounded-lg transition-all duration-200 hover:bg-zinc-800 active:bg-white/[0.1] cursor-pointer">
            <button
              type="button"
              className="nodrag flex items-center justify-center w-7 h-7 m-0.5 rounded-md text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <CameraOffIcon />
            </button>
            <button
              type="button"
              className="nodrag flex items-center h-8 px-0 pr-2 text-sm font-medium whitespace-nowrap text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <span>{t("cameraControl")}</span>
            </button>
          </div>

          <Divider />

          {/* Advanced settings toggle */}
          <button
            type="button"
            className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-800 active:bg-white/[0.1] transition-colors"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
          >
            <Settings2 size={16} className="text-zinc-300" />
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          <CountButton />
          <CreditsPill credits="14" disabled />
        </div>
      </div>

      {/* ── Advanced settings panel (collapsible) ── */}
      <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? "max-h-40" : "max-h-0"}`}>
        <div className="p-4 bg-zinc-900/30">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">{t("webSearch")}</span>
            <button
              type="button"
              role="switch"
              aria-checked="false"
              className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors bg-zinc-600"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <span className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform translate-x-0" />
            </button>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   3. VideoGenerationPanel
   ══════════════════════════════════════════════════════════════════ */

/* ── Video aspect ratio / duration options ── */
const VIDEO_DURATIONS = ["5s", "8s", "10s"];

export function VideoGenerationPanel({
  prompt,
  modelId,
  aspectRatio,
  onPromptChange,
  onAspectRatioChange,
  inverseZoom,
}: GenerationPanelProps) {
  const t = useTranslations("canvas");
  const [activeTab, setActiveTab] = useState<"img2video" | "imgRef">("img2video");
  const [showAspectPicker, setShowAspectPicker] = useState(false);
  const [duration, setDuration] = useState("8s");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const modelLabel = modelId || DEFAULT_MODEL["video-gen"];

  return (
    <PanelShell inverseZoom={inverseZoom}>
      {/* ── Tabs + Reference images row ── */}
      <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
        <div className="flex flex-col gap-2">
          {/* Tab buttons */}
          <div className="flex items-center">
            <button
              className={`nodrag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-8 rounded-md px-3 text-xs ${
                activeTab === "img2video"
                  ? "border border-zinc-600 bg-zinc-800 shadow-sm text-zinc-200"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setActiveTab("img2video"); }}
            >
              <span>{t("img2video")}</span>
            </button>
            <button
              className={`nodrag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-8 rounded-md px-3 text-xs ${
                activeTab === "imgRef"
                  ? "border border-zinc-600 bg-zinc-800 shadow-sm text-zinc-200"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setActiveTab("imgRef"); }}
            >
              <span>{t("imgReference")}</span>
            </button>
          </div>

          {/* Reference images */}
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-2 nodrag items-center">
              <button
                type="button"
                className="nodrag size-[38px] flex items-center justify-center rounded-[10px] border border-white/10 cursor-pointer shrink-0 focus:outline-none bg-white/[0.06] hover:bg-white/[0.12] transition-all"
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                <MagicRefIcon className="size-4 transition-colors text-zinc-500 hover:text-zinc-300" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              {/* TODO: connected parent image thumbnails */}
            </div>
          </div>
        </div>
      </div>

      {/* ── Prompt ── */}
      <div className="relative flex justify-between flex-1 nodrag nowheel">
        <PromptEditor
          content={prompt}
          onChange={onPromptChange}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: 104, maxHeight: 156 }}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          {/* Model selector */}
          <button
            className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <GeminiIcon />
            <span className="whitespace-nowrap capitalize">{modelLabel}</span>
          </button>

          <Divider />

          {/* Aspect ratio + duration + audio */}
          <div className="relative">
            <button
              className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowAspectPicker(!showAspectPicker); }}
            >
              <Fullscreen size={16} />
              <span>{t("adaptive")} · {duration}</span>
              <span className="opacity-50">·</span>
              {audioEnabled ? (
                <Volume2 size={16} className="text-zinc-300" />
              ) : (
                <VolumeX size={16} className="text-zinc-400" />
              )}
            </button>
            {showAspectPicker && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[200px] z-10">
                {/* Duration options */}
                <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium">{t("duration")}</div>
                {VIDEO_DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`nodrag w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition ${
                      d === duration ? "text-white" : "text-zinc-400"
                    }`}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDuration(d);
                      setShowAspectPicker(false);
                    }}
                  >
                    {d}
                  </button>
                ))}
                {/* Audio toggle */}
                <div className="border-t border-zinc-700 mx-2 my-1" />
                <button
                  className="nodrag w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5 transition flex items-center justify-between"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setAudioEnabled(!audioEnabled);
                  }}
                >
                  <span>{t("audioToggle")}</span>
                  <span className={audioEnabled ? "text-white" : "text-zinc-500"}>
                    {audioEnabled ? t("on") : t("off")}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          <CountButton />
          <CreditsPill credits="18" unit="/s" disabled />
        </div>
      </div>
    </PanelShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Dispatcher: picks the right panel based on nodeType
   ══════════════════════════════════════════════════════════════════ */

export function GenerationPanel({
  nodeType,
  ...props
}: GenerationPanelProps & { nodeType: NodeType }) {
  switch (nodeType) {
    case "text":
      return <TextGenerationPanel {...props} />;
    case "image-gen":
      return <ImageGenerationPanel {...props} />;
    case "video-gen":
      return <VideoGenerationPanel {...props} />;
    default:
      return null;
  }
}
