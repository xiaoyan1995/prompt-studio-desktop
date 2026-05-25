"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { ChevronDown, Languages, Mic, Settings2 } from "lucide-react";
import { AUDIO_LANGUAGES, COMMON_LANGUAGE_CODES, getLanguageLabel } from "@/lib/audio-languages";
import { ELEVENLABS_VOICES } from "@/lib/kie-audio";
import { usePricingPromo, applyDiscount } from "@/hooks/use-pricing-promo";
import {
  useClickOutside,
  PanelShell,
  CreditsPill,
} from "../panel-shared";
import { PromptEditor } from "../PromptEditor";

const AUDIO_MODEL_ID = "tts-1";

/* ── ElevenLabs icon ── */
function ElevenLabsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="7" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
      <rect x="14" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/* ── Language Picker Dropdown ── */
function LanguagePicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (code: string) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("audioGen");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, true, onClose);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) {
      // Show common languages first, then rest
      const common = COMMON_LANGUAGE_CODES
        .map((code) => AUDIO_LANGUAGES.find((l) => l.code === code))
        .filter(Boolean) as typeof AUDIO_LANGUAGES;
      const rest = AUDIO_LANGUAGES.filter((l) => !COMMON_LANGUAGE_CODES.includes(l.code));
      return { common, rest };
    }
    const all = AUDIO_LANGUAGES.filter(
      (l) => l.en.toLowerCase().includes(q) || l.zh.includes(q) || l.code.includes(q),
    );
    return { common: [], rest: all };
  }, [search]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 left-0 rounded-2xl bg-[#292929] py-1 w-[280px] max-h-[400px] z-50 flex flex-col"
      style={{ scrollbarWidth: "none" }}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
          <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />
        </svg>
        <input
          className="nodrag flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder={t("searchLanguage")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Language list */}
      <div className="rounded-2xl bg-[#323232] py-1 mx-1 overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
        {/* Auto detect */}
        <div className="px-1 pb-0.5">
          <button
            type="button"
            className={`nodrag w-full text-left px-3 py-2 text-sm rounded-xl transition-colors ${
              value === "" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.05]"
            }`}
            onMouseDown={(e) => { e.preventDefault(); onChange(""); onClose(); }}
          >
            {t("autoDetect")}
          </button>
        </div>

        {/* Common languages */}
        {filtered.common.length > 0 && (
          <>
            <div className="px-3 pt-1.5 pb-0.5">
              <span className="text-xs text-zinc-500">{t("commonLanguages")}</span>
            </div>
            <div className="px-1 pb-1">
              {filtered.common.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`nodrag w-full text-left px-3 py-2 text-sm rounded-xl transition-colors flex items-center justify-between ${
                    l.code === value ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.05]"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); onChange(l.code); onClose(); }}
                >
                  <span>{getLanguageLabel(l.code, locale)}</span>
                  <span className="text-zinc-600 text-xs">{l.code}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Rest */}
        {filtered.rest.length > 0 && (
          <div className="px-1 pb-1">
            {filtered.rest.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`nodrag w-full text-left px-3 py-2 text-sm rounded-xl transition-colors flex items-center justify-between ${
                  l.code === value ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.05]"
                }`}
                onMouseDown={(e) => { e.preventDefault(); onChange(l.code); onClose(); }}
              >
                <span>{getLanguageLabel(l.code, locale)}</span>
                <span className="text-zinc-600 text-xs">{l.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Voice Tag ── */
function VoiceTag({ label }: { label: string }) {
  return (
    <span className="h-5 leading-5 text-[11px] text-white/60 bg-white/[0.06] rounded px-[6px] capitalize">
      {label}
    </span>
  );
}

/* ── Deterministic voice avatar color ── */
function voiceHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

function VoiceAvatar({ name, size = 34 }: { name: string; size?: number }) {
  const hue = voiceHue(name);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue}, 45%, 38%)` }}
    >
      <span style={{ fontSize: size * 0.38 }}>{name[0]}</span>
    </div>
  );
}

/* ── Play / Pause / Loading icons ── */
function PlayIcon() {
  return (
    <svg width="8" height="10" viewBox="-3 0 13 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
      <path d="M4.76e-08 1.11c0-.2.05-.39.15-.55A1 1 0 011.09 0c.19 0 .37.05.54.15l6.5 3.89a1 1 0 010 1.72l-6.5 3.89A1 1 0 010 8.89V1.11z" fill="currentColor"/>
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
      <rect width="2.5" height="10" rx="0.75" fill="currentColor"/>
      <rect x="5.5" width="2.5" height="10" rx="0.75" fill="currentColor"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="animate-spin text-white">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Voice Picker Dropdown (Tapnow style) ── */
function VoicePicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (voiceId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("audioGen");
  const [search, setSearch] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, true, () => { audioRef.current?.pause(); onClose(); });

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return ELEVENLABS_VOICES;
    return ELEVENLABS_VOICES.filter(
      (v) => v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q) || v.accent.includes(q) || v.gender.includes(q) || v.age.includes(q),
    );
  }, [search]);

  const handlePreview = useCallback((voiceId: string) => {
    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingVoice(null);

    const voice = ELEVENLABS_VOICES.find((v) => v.id === voiceId);
    const url = voice?.previewUrl ?? "";
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => setPlayingVoice(null);
    audio.play().catch(() => setPlayingVoice(null));
    setPlayingVoice(voiceId);
  }, [playingVoice]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 left-0 rounded-2xl bg-[#292929] py-1 w-[320px] max-h-[400px] z-50 flex flex-col"
      style={{ scrollbarWidth: "none" }}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
          <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />
        </svg>
        <input
          className="nodrag flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
          placeholder={t("searchVoice")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Voice list */}
      <div className="rounded-2xl bg-[#323232] py-1 mx-1 overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
        <div className="px-2 pt-1 pb-0.5">
          <span className="text-xs text-zinc-500">{t("systemVoices")}</span>
        </div>
        <div className="px-1 pb-1">
          {filtered.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`nodrag flex items-center w-full gap-2.5 rounded-xl cursor-pointer px-2 py-2 transition-colors text-left ${
                v.id === value ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
              }`}
              onMouseDown={(e) => { e.preventDefault(); onChange(v.id); onClose(); }}
            >
              {/* Avatar + preview overlay */}
              <div
                className="relative shrink-0 group/avatar"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePreview(v.id);
                }}
              >
                <VoiceAvatar name={v.name} />
                <div className={`absolute inset-0 z-10 flex items-center justify-center rounded-full transition-opacity ${
                  playingVoice === v.id ? "opacity-100" : "opacity-0 group-hover/avatar:opacity-100"
                }`}>
                  <div className="flex items-center justify-center rounded-full bg-black/60 w-4 h-4">
                    {playingVoice === v.id ? <PauseIcon /> : <PlayIcon />}
                  </div>
                </div>
              </div>

              {/* Name + tags */}
              <div className="flex flex-col justify-center gap-1 min-w-0 flex-1">
                <div className="truncate text-sm text-white">{v.name}</div>
                <div className="truncate text-[10px] text-zinc-400 leading-tight">{v.desc}</div>
                <div className="flex gap-1 flex-wrap">
                  <VoiceTag label={v.accent} />
                  <VoiceTag label={v.gender} />
                  <VoiceTag label={v.age} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Divider ── */
function Divider() {
  return <div className="w-px h-4 bg-zinc-700" />;
}

/* ══════════════════════════════════════════════════════════════════
   AudioGenPanel
   ══════════════════════════════════════════════════════════════════ */

export interface AudioGenPanelProps {
  prompt: string;
  voice: string;
  languageCode: string;
  speed: number;
  stability: number;
  onPromptChange: (v: string) => void;
  onVoiceChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onSpeedChange: (v: number) => void;
  onStabilityChange: (v: number) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  inverseZoom: number;
}

export function AudioGenPanel({
  prompt,
  voice,
  languageCode,
  speed,
  stability,
  onPromptChange,
  onVoiceChange,
  onLanguageChange,
  onSpeedChange,
  onStabilityChange,
  onGenerate,
  isGenerating,
  inverseZoom,
}: AudioGenPanelProps) {
  const t = useTranslations("audioGen");
  const locale = useLocale();
  const { discountPct: audioDiscountPct } = usePricingPromo(AUDIO_MODEL_ID);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  useClickOutside(speedRef, showSpeedPicker, () => setShowSpeedPicker(false));

  const langLabel = languageCode
    ? getLanguageLabel(languageCode, locale)
    : t("autoDetect");

  const currentVoice = ELEVENLABS_VOICES.find((v) => v.id === voice) ?? ELEVENLABS_VOICES[0];

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <PanelShell inverseZoom={inverseZoom}>
      {/* ── Prompt ── */}
      <div className="relative flex flex-col flex-1 pt-1 nodrag nowheel">
        <PromptEditor
          content={prompt}
          onChange={onPromptChange}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: 104, maxHeight: 156 }}
        />
        <div className={`text-[10px] text-right px-3 pb-1 ${prompt.trim().length > 5000 ? "text-red-400" : "text-zinc-500"}`}>
          {prompt.trim().length} / 5000
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          {/* Model label */}
          <button
            className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <ElevenLabsIcon />
            <span className="whitespace-nowrap">ElevenLabs V3</span>
          </button>

          <Divider />

          {/* Voice selector */}
          <div className="relative">
            <button
              className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowVoicePicker(!showVoicePicker); setShowLangPicker(false); setShowSpeedPicker(false); }}
            >
              <Mic size={14} />
              <span>{currentVoice.name}</span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            {showVoicePicker && (
              <VoicePicker
                value={voice}
                onChange={(v) => { onVoiceChange(v); }}
                onClose={() => setShowVoicePicker(false)}
              />
            )}
          </div>

          <Divider />

          {/* Language selector */}
          <div className="relative">
            <button
              className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowLangPicker(!showLangPicker); setShowVoicePicker(false); setShowSpeedPicker(false); }}
            >
              <Languages size={14} />
              <span>{langLabel}</span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            {showLangPicker && (
              <LanguagePicker
                value={languageCode}
                onChange={onLanguageChange}
                onClose={() => setShowLangPicker(false)}
              />
            )}
          </div>

          <Divider />

          {/* Speed selector */}
          <div className="relative" ref={speedRef}>
            <button
              className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowSpeedPicker(!showSpeedPicker); setShowLangPicker(false); setShowVoicePicker(false); }}
            >
              <span>{speed}x</span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            {showSpeedPicker && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[100px] z-10">
                <div className="px-3 py-1 text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{t("speed")}</div>
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`nodrag w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition ${
                      s === speed ? "text-white" : "text-zinc-400"
                    }`}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSpeedChange(s);
                      setShowSpeedPicker(false);
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <Divider />

          {/* Advanced toggle */}
          <button
            className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-800 active:bg-white/[0.1] transition-colors"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
          >
            <Settings2 size={16} className="text-zinc-300" />
          </button>
        </div>

        {/* Right: credits + send */}
        <div className="flex items-center gap-1">
          <CreditsPill
            credits={String(applyDiscount(Math.max(1, Math.ceil((prompt.trim().length / 1000) * 10)), audioDiscountPct))}
            originalCredits={audioDiscountPct > 0 ? String(Math.max(1, Math.ceil((prompt.trim().length / 1000) * 10))) : undefined}
            onSend={onGenerate}
            disabled={isGenerating || !prompt.trim() || prompt.trim().length > 5000}
            loading={isGenerating}
          />
        </div>
      </div>

      {/* ── Advanced settings (stability slider) ── */}
      <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? "max-h-24" : "max-h-0"}`}>
        <div className="px-4 py-3 bg-white/[0.02]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center justify-center px-1 shrink-0">
              <span className="text-[13px] font-medium text-white whitespace-nowrap">{t("stability")}</span>
            </div>
            <div className="flex items-center gap-2 px-2 shrink-0">
              <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">{t("creative")}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={stability}
                onChange={(e) => onStabilityChange(parseFloat(e.target.value))}
                onPointerDownCapture={(e) => e.stopPropagation()}
                className="nodrag w-[200px] h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.18] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
              />
              <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">{t("stable")}</span>
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
