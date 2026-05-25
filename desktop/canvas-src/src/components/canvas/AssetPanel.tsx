"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { Image, Video, Music, X, Download, LocateFixed } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  getImageOriginalUrl,
  getVideoOriginalUrl,
  resolveDownloadSource,
  downloadFile,
  type DownloadSourceKind,
} from "@/lib/media-url";
import { trackEvent } from "@/lib/analytics";

interface AssetPanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

type AssetFilter = "all" | "image" | "video" | "audio";

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi)($|\?)/i.test(url);
}

export function AssetPanel({ open, onClose, projectId }: AssetPanelProps) {
  const t = useTranslations("assets");
  const nodes = useCanvasStore((s) => s.nodes);
  const { fitView, setNodes } = useReactFlow();
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [projectMaterials, setProjectMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/materials?folder_id=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProjectMaterials(data.materials || []);
        }
      } catch (err) {
        console.error("Failed to fetch project materials for AssetPanel:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const assets = useMemo(() => {
    const items: {
      id: string;
      label: string;
      imageUrl: string;
      thumbUrl: string;
      type: "image" | "video" | "audio";
      nodeType: string;
      nodeData: Record<string, unknown>;
      generatedAt: string;
    }[] = [];

    const seenUrls = new Set<string>();

    // 1. Gather assets currently placed as nodes on the canvas
    for (const n of nodes) {
      const videoUrl = getVideoOriginalUrl(n.data) ?? "";
      const imageUrl = getImageOriginalUrl(n.data) ?? "";
      const audioUrl = String(n.data?.audioUrl ?? "");
      const url = videoUrl || imageUrl || audioUrl;
      if (!url) continue;

      const cleanUrl = url.split("?")[0].trim();
      seenUrls.add(cleanUrl);

      const thumb = n.data?.thumbnailUrl ? String(n.data.thumbnailUrl) : (n.data?.imageUrl ? String(n.data.imageUrl) : url);
      const nt = String(n.data?.nodeType ?? "");
      const isAudio = audioUrl.length > 0 && !videoUrl && !imageUrl;
      const isVideo = videoUrl.length > 0;
      items.push({
        id: n.id,
        label: String(n.data?.label ?? n.data?.title ?? ""),
        imageUrl: url,
        thumbUrl: thumb,
        type: isAudio ? "audio" : isVideo ? "video" : "image",
        nodeType: nt,
        nodeData: n.data as Record<string, unknown>,
        generatedAt: String(n.data?.generatedAt ?? ""),
      });
    }

    // 2. Gather materials & historical generations that belong to the project (even if not placed as canvas nodes)
    for (const m of projectMaterials) {
      const url = m.storage_key || m.url;
      if (!url) continue;

      const cleanUrl = url.split("?")[0].trim();
      if (seenUrls.has(cleanUrl)) continue; // Deduplicate already placed nodes
      seenUrls.add(cleanUrl);

      const isAudio = m.type === "AUDIO";
      const isVideo = m.type === "VIDEO";
      items.push({
        id: m.id,
        label: m.name || "生成素材",
        imageUrl: url,
        thumbUrl: m.thumbnail_url || url,
        type: isAudio ? "audio" : isVideo ? "video" : "image",
        nodeType: "material",
        nodeData: m as Record<string, unknown>,
        generatedAt: m.created_at || "",
      });
    }

    items.reverse();
    items.sort((a, b) => {
      if (a.generatedAt && b.generatedAt) return b.generatedAt.localeCompare(a.generatedAt);
      if (a.generatedAt) return -1;
      if (b.generatedAt) return 1;
      return 0;
    });
    return items;
  }, [nodes, projectMaterials]);

  const filtered = useMemo(() => {
    if (filter === "all") return assets;
    return assets.filter((a) => a.type === filter);
  }, [assets, filter]);

  const handleLocate = useCallback((nodeId: string) => {
    onClose();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
    fitView({ nodes: [{ id: nodeId }], duration: 400, padding: 0.5 });
  }, [setNodes, fitView, onClose]);

  const handleDownload = useCallback(async (asset: { imageUrl: string; type: "image" | "video" | "audio"; nodeData: Record<string, unknown> }) => {
    if (asset.type === "audio") {
      const url = asset.imageUrl;
      if (!url) return;
      const ext = url.split(".").pop()?.split("?")[0] || "mp3";
      const ok = await downloadFile(url, `xinyu-${Date.now()}.${ext}`);
      trackEvent("canvas_original_download", { entrypoint: "asset_panel", mediaType: "audio", source: "original", success: ok, originalHit: true });
      return;
    }
    const resolved = await resolveDownloadSource({
      kind: asset.type,
      data: asset.nodeData,
      displayUrl: asset.imageUrl,
    });
    const url = resolved.url;
    const source: DownloadSourceKind = resolved.source;
    if (!url) {
      trackEvent("canvas_original_download", {
        entrypoint: "asset_panel",
        mediaType: asset.type,
        source,
        success: false,
        originalHit: source === "original" || source === "derived-original",
      });
      return;
    }
    const ext = url.split(".").pop()?.split("?")[0] || "png";
    const ok = await downloadFile(url, `xinyu-${Date.now()}.${ext}`);
    trackEvent("canvas_original_download", {
      entrypoint: "asset_panel",
      mediaType: asset.type,
      source,
      success: ok,
      originalHit: source === "original" || source === "derived-original",
    });
  }, []);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col w-[90vw] max-w-[1100px] h-[85vh] rounded-[20px] overflow-hidden border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-[#1e1e1e] text-zinc-800 dark:text-white shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("projectAssets")}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">{filtered.length} {t("items")}</span>
          </div>
          <div className="flex items-center gap-1">
            {(["all", "image", "video", "audio"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  filter === tab
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {t(tab === "all" ? "all" : tab)}
              </button>
            ))}
          </div>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500">
              <Image size={40} className="mb-3 opacity-20" />
              <p className="text-sm">{t("noAssets")}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">{t("noAssetsDesc")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 p-5 sm:grid-cols-5 lg:grid-cols-6">
              {filtered.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/5 overflow-hidden hover:border-zinc-300 dark:hover:border-white/15 transition-all shadow-sm"
                >
                  <div className="aspect-square relative bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center">
                    {asset.type === "audio" ? (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-900">
                        <Music size={28} className="text-sky-600 dark:text-sky-400 opacity-60" />
                      </div>
                    ) : isVideoUrl(asset.thumbUrl) ? (
                      <video
                        src={asset.thumbUrl}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                        draggable={false}
                        onLoadedData={(e) => {
                          const v = e.currentTarget;
                          if (v.duration > 0.5) v.currentTime = 0.5;
                        }}
                      />
                    ) : (
                      <img
                        src={asset.thumbUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    )}
                    {asset.type === "video" && (
                      <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/50 backdrop-blur-sm">
                        <Video size={10} className="text-white" />
                      </div>
                    )}
                    {asset.type === "audio" && (
                      <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/50 backdrop-blur-sm">
                        <Music size={10} className="text-white" />
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      {asset.nodeType !== "material" && (
                        <button
                          onClick={() => handleLocate(asset.id)}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
                          title={t("locate")}
                        >
                          <LocateFixed size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(asset)}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
                        title={t("download")}
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
