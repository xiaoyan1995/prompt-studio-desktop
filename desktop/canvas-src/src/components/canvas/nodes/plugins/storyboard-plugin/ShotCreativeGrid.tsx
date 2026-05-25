"use client";

import { useTranslations } from "next-intl";
import { Clapperboard, Check, Loader2, AlertCircle, Camera, Move, Smile, Sun } from "lucide-react";
import type { ShotRow } from "@/types/storyboard";

/* ─── Colored tag pills for cinematic metadata ─── */
const TAG_STYLES: Record<string, { bg: string; text: string; icon: typeof Camera }> = {
  shotSize:    { bg: "bg-blue-500/15",   text: "text-blue-400",   icon: Camera },
  cameraNote:  { bg: "bg-purple-500/15", text: "text-purple-400", icon: Move },
  emotion:     { bg: "bg-amber-500/15",  text: "text-amber-400",  icon: Smile },
  lighting:    { bg: "bg-cyan-500/15",   text: "text-cyan-400",   icon: Sun },
};

interface ShotCreativeGridProps {
  rows: ShotRow[];
  onChange: (rows: ShotRow[]) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  generatingIds?: Set<string>;
  failedIds?: Set<string>;
}

export function ShotCreativeGrid({ rows, selectedIds, onToggleSelect, generatingIds, failedIds }: ShotCreativeGridProps) {
  const t = useTranslations("canvas");
  const selectable = !!onToggleSelect;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
        <Clapperboard size={32} strokeWidth={1.25} />
        <span className="text-xs">{t("storyboardEmpty")}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 pb-2">
      {rows.map((row) => {
        const thumbSrc = row.referenceImageUrls?.[0] || row.thumbnailUrls?.[0] || row.thumbnailUrl;
        const isSelected = selectedIds?.has(row.id) ?? false;
        const isGenerating = generatingIds?.has(row.id) ?? false;
        const isFailed = failedIds?.has(row.id) ?? false;
        return (
          <div
            key={row.id}
            className={`flex flex-col rounded-xl border overflow-hidden transition-colors cursor-default ${
              isSelected ? "border-white/40 ring-1 ring-white/20" : "border-zinc-700 hover:border-zinc-600"
            } ${isGenerating ? "bg-zinc-800/60" : "bg-zinc-800"}`}
            onClick={selectable ? () => onToggleSelect(row.id) : undefined}
          >
            {/* Thumbnail */}
            <div className="relative flex-shrink-0">
              <div className="relative w-full overflow-hidden">
                <div style={{ paddingBottom: "56.25%" }} />
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt={`Shot ${row.shotIndex}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                    <Clapperboard size={24} className="text-zinc-700" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-[#141414]/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-medium backdrop-blur-sm">
                  {row.shotIndex}
                </div>
                {row.durationS != null && (
                  <div className="absolute top-2 right-2 bg-[#141414]/80 text-white rounded-full px-2.5 py-0.5 text-xs backdrop-blur-sm">
                    {row.durationS}s
                  </div>
                )}
                {/* Selection checkbox */}
                {selectable && (
                  <div className={`absolute bottom-2 right-2 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? "bg-white border-white" : "bg-black/40 border-white/30 backdrop-blur-sm"
                  }`}>
                    {isSelected && <Check size={14} className="text-black" strokeWidth={3} />}
                  </div>
                )}
                {/* Generating spinner overlay */}
                {isGenerating && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                    <Loader2 size={20} className="text-white animate-spin" />
                  </div>
                )}
                {/* Failed overlay */}
                {isFailed && !isGenerating && (
                  <div className="absolute inset-0 bg-red-900/30 flex items-center justify-center backdrop-blur-[1px]">
                    <AlertCircle size={20} className="text-red-400" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="px-2.5 py-2 flex flex-col gap-1 flex-1 min-w-0">
              <p className="text-sm text-zinc-200 line-clamp-2 leading-snug">
                {row.visualDescription || <span className="text-zinc-600 italic">{t("storyboardVisualPh")}</span>}
              </p>

              {row.characterName && (
                <div className="flex items-center gap-1.5">
                  {(row.characterImageUrls?.[0] || row.characterImageUrl) && (
                    <img src={row.characterImageUrls?.[0] || row.characterImageUrl!} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  )}
                  <span className="text-xs text-zinc-400 truncate">{row.characterName}</span>
                </div>
              )}

              {/* Colored tag pills for cinematic metadata */}
              {(row.shotSize || row.cameraNote || row.emotion || row.lightingAtmosphere) && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {row.shotSize && (() => { const s = TAG_STYLES.shotSize; const Icon = s.icon; return (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[10px] leading-none`}>
                      <Icon size={10} />{row.shotSize}
                    </span>
                  ); })()}
                  {row.cameraNote && (() => { const s = TAG_STYLES.cameraNote; const Icon = s.icon; return (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[10px] leading-none`}>
                      <Icon size={10} />{row.cameraNote}
                    </span>
                  ); })()}
                  {row.emotion && (() => { const s = TAG_STYLES.emotion; const Icon = s.icon; return (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[10px] leading-none`}>
                      <Icon size={10} />{row.emotion}
                    </span>
                  ); })()}
                  {row.lightingAtmosphere && (() => { const s = TAG_STYLES.lighting; const Icon = s.icon; return (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${s.bg} ${s.text} text-[10px] leading-none`}>
                      <Icon size={10} />{row.lightingAtmosphere}
                    </span>
                  ); })()}
                </div>
              )}

              {row.dialogue && (
                <p className="text-xs text-zinc-500 line-clamp-1 italic">
                  「{row.dialogue}」
                </p>
              )}

              {row.sceneTag && (
                <span className="inline-block self-start mt-auto px-2.5 py-0.5 rounded-full bg-[#141414]/60 text-zinc-400 text-xs">
                  {row.sceneTag}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
