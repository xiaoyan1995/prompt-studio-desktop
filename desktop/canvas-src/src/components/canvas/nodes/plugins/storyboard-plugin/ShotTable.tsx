"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Plus, Check, Loader2, X, AlertCircle } from "lucide-react";
import type { ShotRow } from "@/types/storyboard";
import { createEmptyShotRow } from "@/types/storyboard";

type ColDef = {
  key: string;
  labelKey: string;
  weight: number;
  minPct: number;
  align: "left" | "center";
  field: keyof ShotRow | null;
  type: "index" | "text" | "images";
};

const DEFAULT_COLS: ColDef[] = [
  { key: "shotIndex",            labelKey: "storyboardColShotIndex",      weight: 3,   minPct: 2,  align: "center", field: null,                  type: "index" },
  { key: "thumbnailUrls",         labelKey: "storyboardColThumbnail",      weight: 7,   minPct: 4,  align: "center", field: "thumbnailUrls",       type: "images" },
  { key: "durationS",            labelKey: "storyboardColDuration",       weight: 4,   minPct: 3,  align: "center", field: "durationS",           type: "text" },
  { key: "visualDescription",    labelKey: "storyboardColVisual",         weight: 12,  minPct: 6,  align: "left",   field: "visualDescription",   type: "text" },
  { key: "characterName",        labelKey: "storyboardColCharacterName",  weight: 7,   minPct: 4,  align: "center", field: "characterName",       type: "text" },
  { key: "characterDescription", labelKey: "storyboardColCharacterDesc",  weight: 12,  minPct: 6,  align: "left",   field: "characterDescription",type: "text" },
  { key: "characterImageUrls",   labelKey: "storyboardColCharacterImg",   weight: 5,   minPct: 3,  align: "center", field: "characterImageUrls",  type: "images" },
  { key: "referenceImageUrls",   labelKey: "storyboardColReference",      weight: 7,   minPct: 4,  align: "center", field: "referenceImageUrls",  type: "images" },
  { key: "shotSize",             labelKey: "storyboardColShotSize",       weight: 6,   minPct: 3,  align: "left",   field: "shotSize",            type: "text" },
  { key: "characterAction",      labelKey: "storyboardColAction",         weight: 8,   minPct: 4,  align: "left",   field: "characterAction",     type: "text" },
  { key: "emotion",              labelKey: "storyboardColEmotion",        weight: 6,   minPct: 3,  align: "left",   field: "emotion",             type: "text" },
  { key: "sceneTag",             labelKey: "storyboardColScene",          weight: 6,   minPct: 3,  align: "left",   field: "sceneTag",            type: "text" },
  { key: "lightingAtmosphere",   labelKey: "storyboardColLighting",       weight: 6,   minPct: 4,  align: "left",   field: "lightingAtmosphere",  type: "text" },
  { key: "soundEffect",          labelKey: "storyboardColSound",          weight: 6,   minPct: 3,  align: "left",   field: "soundEffect",         type: "text" },
  { key: "dialogue",             labelKey: "storyboardColDialogue",       weight: 6,   minPct: 3,  align: "left",   field: "dialogue",            type: "text" },
  { key: "imagePrompt",          labelKey: "storyboardColImagePrompt",    weight: 12,  minPct: 6,  align: "left",   field: "imagePrompt",         type: "text" },
  { key: "videoMotionPrompt",    labelKey: "storyboardColVideoPrompt",    weight: 12,  minPct: 6,  align: "left",   field: "videoMotionPrompt",   type: "text" },
];

const SINGULAR_FALLBACK: Partial<Record<keyof ShotRow, keyof ShotRow>> = {
  thumbnailUrls: "thumbnailUrl",
  characterImageUrls: "characterImageUrl",
};

const IMAGE_FIELDS = DEFAULT_COLS
  .filter((c) => c.type === "images" && c.field)
  .map((c) => c.field!);

function countRowImages(row: ShotRow): number {
  return IMAGE_FIELDS.reduce((sum, f) => sum + resolveImageUrls(row, f).length, 0);
}

function resolveImageUrls(row: ShotRow, field: keyof ShotRow): string[] {
  const arr = row[field];
  if (Array.isArray(arr) && arr.length > 0) return arr as string[];
  const singular = SINGULAR_FALLBACK[field];
  if (singular) {
    const v = row[singular];
    if (typeof v === "string" && v) return [v];
  }
  return [];
}

function imageFieldPatch(field: keyof ShotRow, urls: string[]): Partial<ShotRow> {
  const patch: Partial<ShotRow> = { [field]: urls.length > 0 ? urls : undefined };
  const singular = SINGULAR_FALLBACK[field as keyof typeof SINGULAR_FALLBACK];
  if (singular) (patch as Record<string, unknown>)[singular] = undefined;
  return patch;
}

interface ShotTableProps {
  rows: ShotRow[];
  onChange: (rows: ShotRow[]) => void;
  preview?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  generatingIds?: Set<string>;
  failedIds?: Set<string>;
}

function toPctWidths(weights: number[]): string[] {
  const total = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => `${((w / total) * 100).toFixed(2)}%`);
}

export function ShotTable({ rows, onChange, preview = false, selectedIds, onToggleSelect, generatingIds, failedIds }: ShotTableProps) {
  const t = useTranslations("canvas");
  const selectable = !!onToggleSelect;
  const [weights, setWeights] = useState<number[]>(() => DEFAULT_COLS.map((c) => c.weight));
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const pctWidths = toPctWidths(weights);

  const tableRef = useRef<HTMLTableElement>(null);
  const resizingRef = useRef<{ idx: number; startX: number; startW: number; nextW: number; totalPx: number } | null>(null);
  const rowResRef = useRef<{ rowId: string; startY: number; startH: number } | null>(null);

  const handleRowResizeStart = useCallback((rowId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tr = (e.target as HTMLElement).closest("tr");
    if (!tr) return;
    rowResRef.current = { rowId, startY: e.clientY, startH: tr.offsetHeight };

    const onMove = (ev: PointerEvent) => {
      const r = rowResRef.current;
      if (!r) return;
      setRowHeights((prev) => ({
        ...prev,
        [r.rowId]: Math.max(28, r.startH + (ev.clientY - r.startY)),
      }));
    };
    const onUp = () => {
      rowResRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  const handleResizeStart = useCallback((colIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const table = tableRef.current;
    if (!table) return;
    const totalPx = table.clientWidth;
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const startW = weights[colIdx];
    const nextW = colIdx < weights.length - 1 ? weights[colIdx + 1] : 0;
    resizingRef.current = { idx: colIdx, startX: e.clientX, startW, nextW, totalPx };

    const onMove = (ev: PointerEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const deltaPx = ev.clientX - r.startX;
      const deltaWeight = (deltaPx / r.totalPx) * totalWeight;
      const minThis = DEFAULT_COLS[r.idx].minPct / 100 * totalWeight;
      const minNext = r.idx < weights.length - 1 ? DEFAULT_COLS[r.idx + 1].minPct / 100 * totalWeight : 0;
      const newW = Math.max(minThis, r.startW + deltaWeight);
      const newNext = Math.max(minNext, r.nextW - deltaWeight);
      setWeights((prev) => {
        const next = [...prev];
        next[r.idx] = newW;
        if (r.idx < prev.length - 1) next[r.idx + 1] = newNext;
        return next;
      });
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [weights]);

  const updateCell = useCallback((rowIdx: number, field: keyof ShotRow, value: string) => {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [field]: value } : r));
    onChange(next);
  }, [rows, onChange]);

  const addRow = useCallback(() => {
    onChange([...rows, createEmptyShotRow(rows.length + 1)]);
  }, [rows, onChange]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
        <span className="text-xs">{t("storyboardEmpty")}</span>
        {!preview && (
          <button
            type="button"
            className="nodrag flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 transition-colors"
            onClick={addRow}
          >
            <Plus size={14} />
            {t("storyboardAddRow")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`h-full w-full ${preview ? "" : "nowheel"}`}
      style={{
        overflow: "auto",
      }}
    >
      <table
        ref={tableRef}
        className="border-collapse"
        style={{ tableLayout: "fixed", width: "100%", minWidth: 1400 }}
      >
        <thead className="sticky top-0 z-10">
          <tr>
            {DEFAULT_COLS.map((col, ci) => (
              <th
                key={col.key}
                className="relative select-none border border-white/10 px-1 py-1 text-[10px] font-medium text-white/50 overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ width: pctWidths[ci], background: "rgb(31, 31, 31)", textAlign: col.align }}
              >
                {t(col.labelKey)}
                {!preview && ci > 0 && (
                  <div
                    className="nodrag absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent hover:bg-white/20"
                    onPointerDown={(e) => handleResizeStart(ci, e)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const rh = preview ? undefined : rowHeights[row.id];
            const rowImageTotal = countRowImages(row);
            return (
              <tr key={row.id} className={preview ? "" : "hover:bg-white/[0.03]"}>
                {DEFAULT_COLS.map((col, ci) => (
                  <td
                    key={col.key}
                    className="border border-white/10 relative"
                    style={{ width: pctWidths[ci], padding: 0, verticalAlign: rh ? "top" : (col.type === "index" ? "middle" : "top") }}
                  >
                    <div style={rh ? { height: rh, overflow: "auto", scrollbarWidth: "none" } : undefined}>
                      {col.type === "index" && (
                        <div className="p-1 text-center text-xs text-white/60 relative">
                          {selectable ? (
                            <button
                              type="button"
                              className="nodrag flex items-center justify-center w-full"
                              onClick={() => onToggleSelect(row.id)}
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                selectedIds?.has(row.id) ? "bg-white border-white" : "bg-transparent border-white/30 hover:border-white/50"
                              }`}>
                                {selectedIds?.has(row.id) && <Check size={12} className="text-black" strokeWidth={3} />}
                              </div>
                            </button>
                          ) : (
                            <span>{row.shotIndex}</span>
                          )}
                          {generatingIds?.has(row.id) && (
                            <Loader2 size={12} className="absolute top-0.5 right-0.5 text-white/60 animate-spin" />
                          )}
                          {failedIds?.has(row.id) && !generatingIds?.has(row.id) && (
                            <AlertCircle size={12} className="absolute top-0.5 right-0.5 text-red-400" />
                          )}
                        </div>
                      )}
                      {col.type === "text" && col.field && (
                        preview ? (
                          <div
                            className={`p-1 text-xs text-white/80 break-words whitespace-pre-wrap ${col.align === "center" ? "text-center" : ""}`}
                          >
                            {String(row[col.field] ?? "") || "-"}
                          </div>
                        ) : (
                          <AutoTextarea
                            value={String(row[col.field] ?? "")}
                            align={col.align}
                            onChange={(v) => updateCell(ri, col.field!, v)}
                          />
                        )
                      )}
                      {col.type === "images" && col.field && (() => {
                        const urls = resolveImageUrls(row, col.field);
                        return (
                          <RefImagesCell
                            urls={urls}
                            preview={preview}
                            rowImageTotal={rowImageTotal}
                            onRemove={(idx) => {
                              const next = urls.filter((_, i) => i !== idx);
                              const patch = imageFieldPatch(col.field!, next);
                              const updated = rows.map((r, i) => i === ri ? { ...r, ...patch } : r);
                              onChange(updated);
                            }}
                            onAdd={(newUrls) => {
                              const globalRemaining = Math.max(0, MAX_REF_IMAGES - rowImageTotal);
                              const merged = [...urls, ...newUrls.slice(0, globalRemaining)];
                              const patch = imageFieldPatch(col.field!, merged);
                              const updated = rows.map((r, i) => i === ri ? { ...r, ...patch } : r);
                              onChange(updated);
                            }}
                          />
                        );
                      })()}
                    </div>
                    {!preview && ci === 0 && (
                      <div
                        className="nodrag absolute bottom-0 left-0 h-[3px] cursor-row-resize touch-none select-none z-10 bg-transparent hover:bg-white/20"
                        style={{ width: tableRef.current?.scrollWidth ?? "100%" }}
                        onPointerDown={(e) => handleRowResizeStart(row.id, e)}
                        onDoubleClick={() => setRowHeights((prev) => { const next = { ...prev }; delete next[row.id]; return next; })}
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {!preview && (
        <div className="flex items-center justify-center py-3">
          <button
            type="button"
            className="nodrag flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 transition-colors"
            onClick={addRow}
          >
            <Plus size={14} />
            {t("storyboardAddRow")}
          </button>
        </div>
      )}
    </div>
  );
}

function AutoTextarea({ value, align, onChange }: { value: string; align: "left" | "center"; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resize(); }, [value, resize]);

  return (
    <textarea
      ref={ref}
      className={`nodrag nowheel w-full resize-none break-words border-none bg-transparent p-1 text-xs text-white/80 outline-none placeholder:text-white/30 ${align === "center" ? "text-center" : ""}`}
      style={{ overflow: "hidden", minHeight: 28 }}
      placeholder="-"
      value={value}
      title={value}
      onChange={(e) => { onChange(e.target.value); resize(); }}
    />
  );
}

const MAX_REF_IMAGES = 14;

function RefImagesCell({
  urls,
  preview,
  rowImageTotal,
  onRemove,
  onAdd,
}: {
  urls: string[];
  preview: boolean;
  rowImageTotal: number;
  onRemove: (idx: number) => void;
  onAdd?: (newUrls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canAdd = !preview && rowImageTotal < MAX_REF_IMAGES;

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !onAdd) return;
    const remaining = Math.max(0, MAX_REF_IMAGES - rowImageTotal);
    if (remaining <= 0) { if (inputRef.current) inputRef.current.value = ""; return; }
    const batch = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of batch) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });
        if (!res.ok) continue;
        const { url } = await res.json();
        if (url) uploaded.push(url);
      }
      if (uploaded.length > 0) onAdd(uploaded);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setUploading(false);
    }
  }, [rowImageTotal, onAdd]);

  if (urls.length === 0 && !canAdd) return null;

  return (
    <div className="flex flex-wrap gap-1 p-1">
      {urls.map((url, i) => (
        <RefImageThumb
          key={`${url}-${i}`}
          url={url}
          preview={preview}
          onRemove={() => onRemove(i)}
        />
      ))}
      {canAdd && (
        <>
          <button
            type="button"
            className="nodrag shrink-0 w-10 h-10 rounded border border-dashed border-white/15 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-white/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
        </>
      )}
    </div>
  );
}

function RefImageThumb({ url, preview, onRemove }: { url: string; preview: boolean; onRemove: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleEnter = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setHover(true);
  }, []);

  return (
    <>
      <div
        ref={ref}
        className="relative group shrink-0"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHover(false)}
      >
        <img
          src={url}
          alt=""
          className="w-10 h-10 rounded object-cover"
          draggable={false}
          loading="lazy"
        />
        {!preview && (
          <button
            type="button"
            className="nodrag absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <X size={10} className="text-white" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {hover && pos && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
        >
          <div className="mb-2 rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            <img src={url} alt="" className="w-[200px] h-auto" draggable={false} loading="lazy" decoding="async" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

