"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  Minus,
  Plus,
  ArrowDownUp,
  X,
  Loader2,
} from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useReactFlow } from "@xyflow/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { useTranslations } from "next-intl";

/* ── Types ── */

type AssetType = "IMAGE" | "VIDEO" | "AUDIO";

interface Asset {
  id: string;
  type: AssetType;
  thumbnail_url: string | null;
  original_url: string | null;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  created_at: string;
}

/* ── Custom SVG Icons (filled style, matching Tapnow) ── */

function ImageHistoryIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M3.5 2A1.5 1.5 0 002 3.5v13A1.5 1.5 0 003.5 18h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-13zm10.25 4.25a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zM3.5 16.5l4.22-4.22a1 1 0 011.32-.08l1.56 1.25 3.1-3.1a1 1 0 011.42 0l1.38 1.38V16.5h-13z" fill="currentColor" />
    </svg>
  );
}

function VideoHistoryIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 4.5A1.5 1.5 0 013.5 3h13A1.5 1.5 0 0118 4.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15.5v-11zM8 7.2a.5.5 0 01.77-.42l4.5 2.8a.5.5 0 010 .84l-4.5 2.8A.5.5 0 018 12.8V7.2z" fill="currentColor" />
    </svg>
  );
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M5 4.315a.5.5 0 01.5.5v6.37a.5.5 0 01-1 0v-6.37a.5.5 0 01.5-.5z" fill="currentColor" />
      <path d="M8 2.5a.5.5 0 01.5.5v10a.5.5 0 01-1 0V3a.5.5 0 01.5-.5z" fill="currentColor" />
      <path d="M11 4.315a.5.5 0 01.5.5v6.37a.5.5 0 01-1 0v-6.37a.5.5 0 01.5-.5z" fill="currentColor" />
      <path d="M2 6.315a.5.5 0 01.5.5v2.37a.5.5 0 01-1 0v-2.37a.5.5 0 01.5-.5z" fill="currentColor" />
      <path d="M14 6.315a.5.5 0 01.5.5v2.37a.5.5 0 01-1 0v-2.37a.5.5 0 01.5-.5z" fill="currentColor" />
    </svg>
  );
}

type IconComponent = typeof ImageHistoryIcon;

interface TabDef {
  type: AssetType;
  icon: IconComponent;
  key: string;
}

const TAB_TYPES: { type: AssetType; icon: IconComponent; key: string }[] = [
  { type: "IMAGE", icon: ImageHistoryIcon, key: "imageHistory" },
  { type: "VIDEO", icon: VideoHistoryIcon, key: "videoHistory" },
  { type: "AUDIO", icon: AudioIcon, key: "audio" },
];

const PAGE_SIZE = 50;

/* ── Component ── */

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
}

export function HistoryModal({ open, onClose }: HistoryModalProps) {
  const t = useTranslations("history");
  const [activeTab, setActiveTab] = useState<AssetType>("IMAGE");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [counts, setCounts] = useState<Record<AssetType, number>>({ IMAGE: 0, VIDEO: 0, AUDIO: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const thumbSizeRef = useRef(120);
  const [sortAsc, setSortAsc] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const updateThumbSize = useCallback((val: number) => {
    thumbSizeRef.current = val;
    if (gridRef.current) {
      gridRef.current.style.setProperty("--thumb-size", `${val}px`);
    }
  }, []);
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const { screenToFlowPosition } = useReactFlow();

  /* ── Fetch counts for all tabs (single efficient groupBy query) ── */
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/assets/counts");
      if (res.ok) {
        const data = await res.json();
        setCounts({ IMAGE: 0, VIDEO: 0, AUDIO: 0, ...data.counts });
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Fetch assets page ── */
  const fetchAssets = useCallback(
    async (type: AssetType, pg: number, append = false) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/assets?type=${type}&page=${pg}&limit=${PAGE_SIZE}`);
        if (res.ok) {
          const data = await res.json();
          setAssets((prev) => (append ? [...prev, ...data.assets] : data.assets));
          setTotalPages(data.pagination.totalPages);
        }
      } catch {}
      setLoading(false);
    },
    [],
  );

  /* ── On open ── */
  useEffect(() => {
    if (open) {
      fetchCounts();
      setPage(1);
      fetchAssets(activeTab, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── Tab switch ── */
  useEffect(() => {
    if (!open) return;
    setPage(1);
    setAssets([]);
    fetchAssets(activeTab, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ── Escape ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* ── Infinite scroll ── */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || page >= totalPages) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      const next = page + 1;
      setPage(next);
      fetchAssets(activeTab, next, true);
    }
  }, [loading, page, totalPages, activeTab, fetchAssets]);

  /* ── Group by date ── */
  const grouped = useMemo(() => {
    const sorted = [...assets].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortAsc ? da - db : db - da;
    });
    const groups: { date: string; items: Asset[] }[] = [];
    for (const asset of sorted) {
      const date = new Date(asset.created_at).toISOString().slice(0, 10);
      const last = groups[groups.length - 1];
      if (last?.date === date) {
        last.items.push(asset);
      } else {
        groups.push({ date, items: [asset] });
      }
    }
    return groups;
  }, [assets, sortAsc]);

  /* ── Delete ── */
  const handleDelete = useCallback(
    async (assetId: string) => {
      const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        setCounts((prev) => ({ ...prev, [activeTab]: Math.max(0, prev[activeTab] - 1) }));
      }
    },
    [activeTab],
  );

  /* ── Apply to canvas ── */
  const handleApply = useCallback(
    (asset: Asset) => {
      const flow = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const MAX_DIM = 480;
      const fitSize = (w: number, h: number) => {
        if (w <= 0 || h <= 0) return { w: 280, h: 280 };
        const s = Math.min(MAX_DIM / w, MAX_DIM / h, 1);
        return { w: Math.round(w * s), h: Math.round(h * s) };
      };

      if (asset.type === "IMAGE") {
        const url = asset.original_url || asset.thumbnail_url || "";
        const thumbUrl = asset.thumbnail_url || url;
        if (asset.width && asset.height) {
          const { w, h } = fitSize(asset.width, asset.height);
          addNodeWithData("image-gen", flow.x - w / 2, flow.y - h / 2, {
            imageUrl: url,
            originalUrl: url,
            thumbnailUrl: thumbUrl,
            status: "succeeded",
            label: asset.original_filename || "Image",
          }, { w, h });
        } else {
          const img = new Image();
          img.onload = () => {
            const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
            addNodeWithData("image-gen", flow.x - w / 2, flow.y - h / 2, {
              imageUrl: url,
              originalUrl: url,
              thumbnailUrl: thumbUrl,
              status: "succeeded",
              label: asset.original_filename || "Image",
            }, { w, h });
          };
          img.onerror = () => {
            addNodeWithData("image-gen", flow.x - 140, flow.y - 140, {
              imageUrl: url,
              originalUrl: url,
              thumbnailUrl: thumbUrl,
              status: "succeeded",
            }, { w: 280, h: 280 });
          };
          img.src = thumbUrl;
        }
      } else if (asset.type === "VIDEO") {
        const url = asset.original_url || asset.thumbnail_url || "";
        const thumbUrl = asset.thumbnail_url || url;
        if (asset.width && asset.height) {
          const { w, h } = fitSize(asset.width, asset.height);
          addNodeWithData("video-gen", flow.x - w / 2, flow.y - h / 2, {
            videoUrl: url,
            originalVideoUrl: url,
            thumbnailUrl: thumbUrl,
            status: "succeeded",
            label: asset.original_filename || "Video",
          }, { w, h });
        } else {
          addNodeWithData("video-gen", flow.x - 240, flow.y - 135, {
            videoUrl: url,
            originalVideoUrl: url,
            thumbnailUrl: thumbUrl,
            status: "succeeded",
          }, { w: 480, h: 270 });
        }
      } else if (asset.type === "AUDIO") {
        const url = asset.original_url || "";
        addNodeWithData("source-audio", flow.x - 160, flow.y - 130, {
          audioUrl: url,
          status: "succeeded",
          label: asset.original_filename || "Audio",
        }, { w: 320, h: 260 });
      }
      onClose();
    },
    [addNodeWithData, screenToFlowPosition, onClose],
  );

  if (!open) return null;

  const activeTabDef = TAB_TYPES.find((td) => td.type === activeTab)!;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 flex w-full max-w-[1100px] h-[700px] rounded-2xl border border-white/10 bg-[#111] shadow-2xl overflow-hidden mx-4">
        {/* ── Sidebar ── */}
        <div className="w-[210px] shrink-0 border-r border-white/[0.06] flex flex-col p-6">
          <div className="mb-3 text-sm text-white/50">{t("my")}</div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {TAB_TYPES.map((tab) => (
              <button
                key={tab.type}
                onClick={() => setActiveTab(tab.type)}
                className={`w-full px-3 py-2.5 flex items-center gap-2 text-sm rounded-md transition-colors ${
                  activeTab === tab.type
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:bg-white/5"
                }`}
              >
                <tab.icon className="shrink-0" />
                <span className="text-left truncate">{t(tab.key)}</span>
                <span className="text-xs text-white/40 ml-auto bg-white/[0.06] rounded-[5px] px-1.5 tabular-nums">
                  {counts[tab.type]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center h-[60px] gap-2 border-b border-white/[0.06] pl-6 pr-10 bg-white/[0.02]">
            <activeTabDef.icon className="shrink-0 text-white/70" />
            <span className="font-semibold text-lg text-white/90">{t(activeTabDef.key)}</span>

            <div className="ml-auto flex items-center gap-4">
              {/* Size slider */}
              <div className="flex items-center gap-2 w-44">
                <button
                  onClick={() => updateThumbSize(Math.max(80, thumbSizeRef.current - 10))}
                  className="p-1.5 rounded-md hover:bg-white/10 text-white/50 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <Slider
                  defaultValue={[120]}
                  min={80}
                  max={175}
                  step={1}
                  onValueChange={([val]) => updateThumbSize(val)}
                  className="flex-1"
                />
                <button
                  onClick={() => updateThumbSize(Math.min(175, thumbSizeRef.current + 10))}
                  className="p-1.5 rounded-md hover:bg-white/10 text-white/50 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Sort toggle */}
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="p-1.5 rounded-md hover:bg-white/10 text-white/50 transition-colors"
                title={sortAsc ? t("oldestFirst") : t("newestFirst")}
              >
                <ArrowDownUp size={16} />
              </button>
            </div>
          </div>

          {/* Grid */}
          <ScrollArea className="flex-1" viewportRef={scrollRef} viewportClassName="px-6 pb-6 pt-6" onViewportScroll={handleScroll}>
            {loading && assets.length === 0 ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 size={20} className="animate-spin text-white/20" />
              </div>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-white/25">
                <activeTabDef.icon className="mb-2 opacity-50" />
                <p className="text-sm">{t("noRecords")}</p>
              </div>
            ) : (
              <div ref={gridRef} className="space-y-6" style={{ "--thumb-size": `${thumbSizeRef.current}px` } as React.CSSProperties}>
                {grouped.map((group) => (
                  <div key={group.date}>
                    <div className="mb-3 text-sm font-medium text-white/50">{group.date}</div>
                    <div className="flex flex-wrap items-start gap-2">
                      {group.items.map((asset) => (
                        <div
                          key={asset.id}
                          className="group relative hover:scale-105 hover:shadow-lg transition-[transform,box-shadow,width,height] duration-150 ease-out cursor-pointer rounded-md overflow-hidden bg-white/[0.04] thumb-item"
                          style={{ width: "var(--thumb-size)", height: "var(--thumb-size)" } as React.CSSProperties}
                          onClick={() => handleApply(asset)}
                        >
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(asset.id);
                            }}
                            className="absolute top-1.5 right-1.5 z-10 inline-flex size-7 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-sm backdrop-blur-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-red-500 hover:border-red-500 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>

                          {/* Thumbnail */}
                          {asset.type === "VIDEO" ? (
                            <>
                              <video
                                src={asset.original_url || ""}
                                poster={asset.thumbnail_url || undefined}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                loop
                                preload="none"
                                onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                              />
                              <span className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="drop-shadow-lg opacity-80">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </span>
                            </>
                          ) : asset.thumbnail_url ? (
                            <img
                              src={asset.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : asset.type === "AUDIO" ? (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                              <AudioIcon className="text-pink-400/60" />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <ImageHistoryIcon />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Load more spinner */}
                {loading && assets.length > 0 && (
                  <div className="flex justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-white/20" />
                  </div>
                )}

                <div className="h-3 w-full" />
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-md hover:bg-white/10 text-white/50 transition-colors z-10"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
