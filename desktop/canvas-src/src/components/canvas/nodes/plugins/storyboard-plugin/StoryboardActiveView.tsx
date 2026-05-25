"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { NodeResizeControl, ResizeControlVariant, useStore } from "@xyflow/react";
import { LayoutGrid, Table2, Wand2, CheckSquare, XSquare, X, RotateCcw, Zap } from "lucide-react";
import type { ActiveViewProps } from "../../plugin-types";
import { NODE_TYPE_CONFIGS, type NodeData, type NodeType } from "@/types/canvas";
import {
  getStoryboardState,
  renumberShots,
  type ShotRow,
  type StoryboardViewMode,
} from "@/types/storyboard";
import { useCanvasStore } from "@/stores/canvas-store";
import { fitNodeToRatio } from "../../node-constants";
import { ShotTable } from "./ShotTable";
import { ShotCreativeGrid } from "./ShotCreativeGrid";
import { StoryboardParsePanel } from "./StoryboardParsePanel";
import { StoryboardGenPanel, type StoryboardOutputMode } from "./StoryboardGenPanel";
import { resolveStoryboardParseModelId } from "@/lib/storyboard/parse-models";

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

const GROUP_PAD = 40;
const GROUP_TITLE_H = 50;
const GROUP_GAP = 20;

interface GroupLayoutCtx { groupId: string; childIds: string[]; cols: number }

/**
 * Re-layout all child nodes inside a group using row-based packing that
 * respects each node's actual size, then resize the group to fit.
 */
function relayoutGroupChildren(groupId: string, childIds: string[], cols: number) {
  const store = useCanvasStore.getState();
  const groupNode = store._nodeMap.get(groupId);
  if (!groupNode) return;

  const gx = groupNode.position.x;
  const gy = groupNode.position.y;

  const childNodes = childIds
    .map((cid) => store._nodeMap.get(cid))
    .filter((n): n is NonNullable<typeof n> => !!n);
  if (childNodes.length === 0) return;

  const sizes = childNodes.map((n) => ({
    w: Number(n.style?.width ?? n.width ?? 280),
    h: Number(n.style?.height ?? n.height ?? 280),
  }));

  // Row-based layout: row height = tallest child in that row
  const layoutRows: Array<{ start: number; count: number; maxH: number }> = [];
  for (let i = 0; i < childNodes.length; i += cols) {
    const slice = sizes.slice(i, i + cols);
    layoutRows.push({ start: i, count: slice.length, maxH: Math.max(...slice.map((s) => s.h)) });
  }

  // Column width = widest child in that column
  const colWidths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let maxW = 0;
    for (let r = 0; r < layoutRows.length; r++) {
      const idx = r * cols + c;
      if (idx < sizes.length) maxW = Math.max(maxW, sizes[idx].w);
    }
    colWidths.push(maxW);
  }

  // Build position map: child id → new position
  const posMap = new Map<string, { x: number; y: number }>();
  let yOff = GROUP_PAD + GROUP_TITLE_H;
  for (const row of layoutRows) {
    let xOff = GROUP_PAD;
    for (let c = 0; c < row.count; c++) {
      const idx = row.start + c;
      const sz = sizes[idx];
      const cellW = colWidths[c];
      posMap.set(childNodes[idx].id, {
        x: gx + xOff + (cellW - sz.w) / 2,
        y: gy + yOff + (row.maxH - sz.h) / 2,
      });
      xOff += cellW + GROUP_GAP;
    }
    yOff += row.maxH + GROUP_GAP;
  }

  const totalW = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length - 1) * GROUP_GAP + GROUP_PAD * 2;
  const totalH = yOff - GROUP_GAP + GROUP_PAD;

  // Batch-update all positions + group size in one store write
  useCanvasStore.setState((s) => ({
    nodes: s.nodes.map((n) => {
      if (n.id === groupId) {
        return { ...n, style: { ...n.style, width: totalW, height: totalH }, width: totalW, height: totalH };
      }
      const pos = posMap.get(n.id);
      if (pos) return { ...n, position: pos };
      return n;
    }),
    isDirty: true,
    _mutationVersion: s._mutationVersion + 1,
  }));
}

function StoryboardToolbar({
  inverseZoom,
  viewMode,
  onViewModeChange,
  shotCount,
  parsePhaseLabel,
  parseStatus,
  errorMessage,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  genMode,
  onToggleGenMode,
  onGenerateAll,
  chainProgress,
  onCancelParse,
  onRetryParse,
}: {
  inverseZoom: number;
  viewMode: StoryboardViewMode;
  onViewModeChange: (mode: StoryboardViewMode) => void;
  shotCount: number;
  parsePhaseLabel: string | null;
  parseStatus: string | undefined;
  errorMessage: string | undefined;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  genMode: boolean;
  onToggleGenMode: () => void;
  onGenerateAll: () => void;
  chainProgress: { current: number; total: number } | null;
  onCancelParse: () => void;
  onRetryParse: () => void;
}) {
  const t = useTranslations("canvas");

  return (
    <div
      className="absolute left-1/2 z-30 pointer-events-auto nowheel"
      style={{
        top: "-40px",
        transform: `translateX(-50%) translateY(-100%) scale(${inverseZoom})`,
        transformOrigin: "center bottom",
      }}
    >
      <div className="flex items-center gap-0.5 h-10 px-1.5 rounded-full bg-[#1a1a1a]/90 border border-zinc-800 whitespace-nowrap">
        {/* View mode toggle */}
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onMouseDown={(e) => { e.preventDefault(); onViewModeChange("table"); }}
          className={`nodrag w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 ${
            viewMode === "table" ? "text-white bg-zinc-800" : "text-zinc-400 hover:text-white"
          }`}
          title={t("storyboardViewTable")}
        >
          <Table2 size={16} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onMouseDown={(e) => { e.preventDefault(); onViewModeChange("creative"); }}
          className={`nodrag w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 ${
            viewMode === "creative" ? "text-white bg-zinc-800" : "text-zinc-400 hover:text-white"
          }`}
          title={t("storyboardViewCreative")}
        >
          <LayoutGrid size={16} />
        </button>

        {/* Shot count */}
        {shotCount > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <span className="text-xs text-zinc-500 tabular-nums px-1">
              {shotCount}
            </span>
          </>
        )}

        {/* Generate mode toggle + Generate All shortcut */}
        {shotCount > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); onToggleGenMode(); }}
              className={`nodrag flex items-center gap-1 h-8 px-2 rounded-full text-xs transition-colors ${
                genMode ? "text-white bg-zinc-700" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
              title={t("storyboardGenerate")}
            >
              <Wand2 size={14} />
              <span>{t("storyboardGenerate")}</span>
            </button>
            {!genMode && (
              <button
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); onGenerateAll(); }}
                className="nodrag flex items-center gap-1 h-8 px-2 rounded-full text-xs text-[#CCFF00]/80 hover:text-[#CCFF00] hover:bg-zinc-800 transition-colors"
                title={t("storyboardGenerateAll")}
              >
                <Zap size={14} />
                <span>{t("storyboardGenerateAll")}</span>
              </button>
            )}
          </>
        )}

        {/* Selection controls (visible in gen mode) */}
        {genMode && shotCount > 0 && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                if (selectedCount === shotCount) onDeselectAll();
                else onSelectAll();
              }}
              className="nodrag w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
              title={selectedCount === shotCount ? t("storyboardDeselectAll") : t("storyboardSelectAll")}
            >
              {selectedCount === shotCount ? <XSquare size={15} /> : <CheckSquare size={15} />}
            </button>
            {selectedCount > 0 && (
              <span className="text-xs text-zinc-400 tabular-nums px-0.5">
                {selectedCount}
              </span>
            )}
          </>
        )}

        {/* Chain generation progress */}
        {chainProgress && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <span className="text-xs text-zinc-300 tabular-nums px-1 animate-pulse">
              {chainProgress.current}/{chainProgress.total}
            </span>
          </>
        )}

        {/* Parse status + cancel */}
        {parsePhaseLabel && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <span className="text-xs text-zinc-400 animate-pulse px-1">{parsePhaseLabel}</span>
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); onCancelParse(); }}
              className="nodrag w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
              title={t("storyboardCancel")}
            >
              <X size={14} />
            </button>
          </>
        )}
        {parseStatus === "failed" && errorMessage && (
          <>
            <div className="w-px h-5 bg-zinc-700 mx-0.5" />
            <span className="text-xs text-red-400/80 truncate max-w-[120px] px-1" title={errorMessage}>
              {t("storyboardParseFailed")}
            </span>
            <button
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); onRetryParse(); }}
              className="nodrag w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
              title={t("storyboardRetry")}
            >
              <RotateCcw size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function StoryboardActiveView({ id, data, updaters, connectedRefs }: ActiveViewProps) {
  const t = useTranslations("canvas");
  const params = useParams();
  const projectId = typeof params?.projectId === "string" ? params.projectId : null;
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const inverseZoom = 1 / useStore(zoomSelector);

  const {
    rows,
    viewMode,
    parseStatus,
    parseJobId,
    errorMessage,
    directorRules: directorRulesFromData,
  } = getStoryboardState(data);
  const parseModelId = resolveStoryboardParseModelId(
    typeof data.parseModelId === "string" ? data.parseModelId : undefined,
  );
  const maxShots = typeof data.parseMaxShots === "number" ? data.parseMaxShots : null;

  const [scriptText, setScriptText] = useState(() => typeof data.parseScript === "string" ? data.parseScript : "");
  const [scriptJson, setScriptJson] = useState<unknown>(() => data.parseScriptJson ?? undefined);
  const [directorRules, setDirectorRules] = useState<string>(directorRulesFromData ?? "");

  useEffect(() => {
    setDirectorRules(directorRulesFromData ?? "");
  }, [directorRulesFromData]);

  const handleScriptChange = useCallback((text: string) => {
    setScriptText(text);
    updaters.updateData({ parseScript: text } as Partial<NodeData>);
  }, [updaters]);

  const handleScriptJsonChange = useCallback((json: unknown) => {
    setScriptJson(json);
    updaters.updateData({ parseScriptJson: json } as Partial<NodeData>);
  }, [updaters]);
  const handleDirectorRulesChange = useCallback((value: string) => {
    setDirectorRules(value);
    updaters.updateData({ directorRules: value } as Partial<NodeData>);
  }, [updaters]);
  const [parseBusy, setParseBusy] = useState(
    parseStatus === "queued" || parseStatus === "running",
  );
  const [videoProgress, setVideoProgress] = useState<{
    phase?: string;
    current?: number;
    total?: number;
  } | null>(null);

  // ── P4: Selection & generation state ──
  const [genMode, setGenMode] = useState(false);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set());
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [chainProgress, setChainProgress] = useState<{ current: number; total: number } | null>(null);
  const [genModelId, setGenModelIdLocal] = useState(() => typeof data.genModelId === "string" ? data.genModelId : "nano-banana-2");
  const [genAspectRatio, setGenAspectRatioLocal] = useState(() => typeof data.genAspectRatio === "string" ? data.genAspectRatio : "16:9");
  const [genImageSize, setGenImageSizeLocal] = useState(() => typeof data.genImageSize === "string" ? data.genImageSize : "2K");
  const [genOutputMode, setGenOutputModeLocal] = useState<StoryboardOutputMode>(() => (data.genOutputMode === "grid" ? "grid" : "individual"));
  const [genOutputQuality, setGenOutputQualityLocal] = useState<string | null>(() => typeof data.genOutputQuality === "string" ? data.genOutputQuality : null);

  const setGenModelId = useCallback((v: string) => { setGenModelIdLocal(v); updaters.updateData({ genModelId: v } as Partial<NodeData>); }, [updaters]);
  const setGenAspectRatio = useCallback((v: string) => { setGenAspectRatioLocal(v); updaters.updateData({ genAspectRatio: v } as Partial<NodeData>); }, [updaters]);
  const setGenImageSize = useCallback((v: string) => { setGenImageSizeLocal(v); updaters.updateData({ genImageSize: v } as Partial<NodeData>); }, [updaters]);
  const setGenOutputMode = useCallback((v: StoryboardOutputMode) => { setGenOutputModeLocal(v); updaters.updateData({ genOutputMode: v } as Partial<NodeData>); }, [updaters]);
  const setGenOutputQuality = useCallback((v: string) => { setGenOutputQualityLocal(v); updaters.updateData({ genOutputQuality: v } as Partial<NodeData>); }, [updaters]);

  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const setRows = useCallback(
    (next: ShotRow[]) => {
      updaters.updateData({ rows: renumberShots(next) } as Partial<NodeData>);
    },
    [updaters],
  );

  const setViewMode = useCallback(
    (mode: StoryboardViewMode) => {
      updaters.updateData({ viewMode: mode } as Partial<NodeData>);
    },
    [updaters],
  );

  const toggleShotSelection = useCallback((shotId: string) => {
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) next.delete(shotId);
      else next.add(shotId);
      return next;
    });
  }, []);

  const selectAllShots = useCallback(() => {
    setSelectedShotIds(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const deselectAllShots = useCallback(() => {
    setSelectedShotIds(new Set());
  }, []);

  const toggleGenMode = useCallback(() => {
    setGenMode((prev) => {
      if (prev) setSelectedShotIds(new Set());
      return !prev;
    });
  }, []);

  const generateAll = useCallback(() => {
    setGenMode(true);
    setSelectedShotIds(new Set(rows.filter((r) => r.imagePrompt?.trim()).map((r) => r.id)));
  }, [rows]);

  const cancelParse = useCallback(async () => {
    if (!parseJobId) return;
    try {
      await fetch(`/api/jobs/${parseJobId}/cancel`, { method: "POST" });
      updaters.updateData({ parseStatus: "canceled", parseJobId: undefined, errorMessage: undefined } as Partial<NodeData>);
      setParseBusy(false);
      setVideoProgress(null);
    } catch (e) {
      console.error("[storyboard] cancel failed:", e);
    }
  }, [parseJobId, updaters]);

  const retryParse = useCallback(() => {
    updaters.updateData({ parseStatus: "idle", errorMessage: undefined } as Partial<NodeData>);
  }, [updaters]);

  // ── Recover generation state when panel re-opens ──
  useEffect(() => {
    const store = useCanvasStore.getState();
    const sbChildren = store.nodes.filter((n) => n.data?._sbNodeId === id);

    // Sync thumbnails for children that succeeded while panel was closed
    const curRows = (store._nodeMap.get(id)?.data?.rows ?? []) as ShotRow[];
    let rowsUpdated = false;
    let updatedRows = curRows;
    for (const child of sbChildren) {
      if (String(child.data?.status) !== "succeeded") continue;
      const shotId = child.data?._sbShotId as string | undefined;
      const imgUrl = child.data?.imageUrl as string | undefined;
      if (!shotId || !imgUrl) continue;
      const row = updatedRows.find((r) => r.id === shotId);
      if (row && !(row.thumbnailUrls ?? []).includes(imgUrl)) {
        updatedRows = updatedRows.map((r) =>
          r.id === shotId
            ? { ...r, thumbnailUrls: [imgUrl, ...(r.thumbnailUrls ?? []).filter((u) => u !== imgUrl)] }
            : r,
        );
        rowsUpdated = true;
      }
    }
    if (rowsUpdated) {
      setRows(updatedRows);
    }

    const runningChildren = sbChildren.filter(
      (n) => String(n.data?.status) === "running" && n.data?.jobId,
    );
    if (runningChildren.length === 0) return;

    // Restore generatingIds from running child nodes
    const shotIdByChild = new Map<string, string>();
    const restoredShotIds = new Set<string>();
    for (const child of runningChildren) {
      const shotId = child.data?._sbShotId as string | undefined;
      if (shotId) {
        restoredShotIds.add(shotId);
        shotIdByChild.set(child.id, shotId);
      }
    }
    if (restoredShotIds.size > 0) {
      setGeneratingIds(restoredShotIds);
      setGenMode(true);
      setChainProgress({ current: 0, total: restoredShotIds.size });
    }

    // Re-attach SSE for each running child
    const eventSources: EventSource[] = [];
    let completed = 0;

    for (const child of runningChildren) {
      const childId = child.id;
      const jobId = String(child.data!.jobId);
      const shotId = shotIdByChild.get(childId);

      const es = new EventSource(`/api/jobs/${jobId}/sse`);
      eventSources.push(es);

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            status?: string;
            url?: string;
            thumbnailUrl?: string;
            aspect_ratio?: string;
            width?: number;
            height?: number;
            assets?: Array<{ url?: string; thumbnailUrl?: string }>;
            error?: string;
          };
          if (msg.status === "SUCCEEDED" || msg.status === "PARTIAL_SUCCESS") {
            es.close();
            const imgUrl = msg.url || msg.assets?.[0]?.url;
            if (imgUrl && shotId) {
              // Update shot thumbnail in storyboard rows
              const curRows = (useCanvasStore.getState()._nodeMap.get(id)?.data?.rows ?? []) as ShotRow[];
              setRows(curRows.map((r) =>
                r.id === shotId
                  ? { ...r, thumbnailUrls: [imgUrl, ...(r.thumbnailUrls ?? []).filter((u) => u !== imgUrl)] }
                  : r,
              ));
            }
            if (shotId) {
              setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
              setFailedIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
            }
            completed++;
            setChainProgress((prev) =>
              prev ? { ...prev, current: completed } : null,
            );
            if (completed >= runningChildren.length) {
              setChainProgress(null);
            }
          } else if (msg.status === "FAILED") {
            es.close();
            if (shotId) {
              setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
              setFailedIds((prev) => new Set(prev).add(shotId));
            }
            completed++;
            setChainProgress((prev) =>
              prev ? { ...prev, current: completed } : null,
            );
            if (completed >= runningChildren.length) {
              setChainProgress(null);
            }
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        if (shotId) {
          setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
          setFailedIds((prev) => new Set(prev).add(shotId));
        }
        completed++;
        if (completed >= runningChildren.length) {
          setChainProgress(null);
        }
      };
    }

    return () => {
      eventSources.forEach((es) => es.close());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── P4: Group-based generation ──
  const CHAIN_REF_WINDOW = 3;

  const waitForChildJob = useCallback((
    childNodeId: string, jobId: string, shotId: string,
    layoutCtx?: GroupLayoutCtx,
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const es = new EventSource(`/api/jobs/${jobId}/sse`);
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            status?: string;
            url?: string;
            thumbnailUrl?: string;
            aspect_ratio?: string;
            width?: number;
            height?: number;
            assets?: Array<{ url?: string; thumbnailUrl?: string }>;
            error?: string;
          };
          if (msg.status === "SUCCEEDED" || msg.status === "PARTIAL_SUCCESS") {
            const imgUrl = msg.url || msg.assets?.[0]?.url;
            const thumbUrl = msg.thumbnailUrl || msg.assets?.[0]?.thumbnailUrl || imgUrl;
            es.close();
            if (!imgUrl) {
              updateNodeData(childNodeId, { status: "failed", errorMessage: "No image URL in job result" });
              setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
              resolve(null);
              return;
            }

            updateNodeData(childNodeId, { imageUrl: imgUrl, thumbnailUrl: thumbUrl, status: "succeeded" });

            // Update shot thumbnail in storyboard rows
            {
              const curRows = ((useCanvasStore.getState()._nodeMap.get(id)?.data?.rows ?? []) as ShotRow[]);
              setRows(curRows.map((r) =>
                r.id === shotId ? { ...r, thumbnailUrls: [imgUrl, ...(r.thumbnailUrls ?? []).filter((u) => u !== imgUrl)] } : r,
              ));
            }
            setFailedIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });

            let rw: number | undefined, rh: number | undefined;
            if (msg.width && msg.height) { rw = msg.width; rh = msg.height; }
            else if (msg.aspect_ratio && msg.aspect_ratio !== "auto") { [rw, rh] = msg.aspect_ratio.split(":").map(Number); }
            if (rw && rh) {
              const { w, h } = fitNodeToRatio(rw, rh);
              useCanvasStore.getState().updateNodeSize(childNodeId, w, h);
            } else {
              // SSE didn't return dimensions — probe the actual image
              const img = new Image();
              img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  const { w, h } = fitNodeToRatio(img.naturalWidth, img.naturalHeight);
                  useCanvasStore.getState().updateNodeSize(childNodeId, w, h);
                  if (layoutCtx) relayoutGroupChildren(layoutCtx.groupId, layoutCtx.childIds, layoutCtx.cols);
                }
              };
              img.src = imgUrl;
            }

            // Re-layout group after each child resizes
            if (layoutCtx) {
              relayoutGroupChildren(layoutCtx.groupId, layoutCtx.childIds, layoutCtx.cols);
            }

            setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
            resolve(imgUrl);
          }
          if (msg.status === "FAILED") {
            es.close();
            updateNodeData(childNodeId, { status: "failed", errorMessage: msg.error });
            setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
            setFailedIds((prev) => new Set(prev).add(shotId));
            resolve(null);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shotId); return n; });
        setFailedIds((prev) => new Set(prev).add(shotId));
        resolve(null);
      };
    });
  }, [updateNodeData]);

  const handleGenerate = useCallback(async () => {
    if (selectedShotIds.size === 0) return;
    const selected = rows.filter((r) => selectedShotIds.has(r.id) && r.imagePrompt?.trim());
    if (selected.length === 0) return;

    const storeState = useCanvasStore.getState();
    const sbNode = storeState._nodeMap.get(id);
    if (!sbNode) return;

    const sbX = sbNode.position.x;
    const sbY = sbNode.position.y;
    const sbW = Number(sbNode.style?.width ?? sbNode.width ?? 400);

    const config = NODE_TYPE_CONFIGS["image-gen"];
    const nodeW = config.defaultWidth;
    const nodeH = config.defaultHeight;

    const cols = selected.length <= 4 ? 2 : 3;

    const totalCols = Math.min(cols, selected.length);
    const totalRows = Math.ceil(selected.length / cols);
    const groupW = totalCols * nodeW + (totalCols - 1) * GROUP_GAP + GROUP_PAD * 2;
    const groupH = totalRows * nodeH + (totalRows - 1) * GROUP_GAP + GROUP_PAD * 2 + GROUP_TITLE_H;

    const groupX = sbX + sbW + 80;
    const groupY = sbY;

    const groupId = updaters.addNodeWithData(
      "group" as NodeType, groupX, groupY,
      { label: `${data.label || t("storyboardGenerate")}`, groupColor: "#6b7280" },
      { w: groupW, h: groupH },
    );

    const childEntries: Array<{ childId: string; shot: ShotRow }> = [];
    for (let i = 0; i < selected.length; i++) {
      const shot = selected[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = groupX + GROUP_PAD + col * (nodeW + GROUP_GAP);
      const cy = groupY + GROUP_PAD + GROUP_TITLE_H + row * (nodeH + GROUP_GAP);

      const childId = updaters.addNodeWithData("image-gen", cx, cy, {
        label: `${t("storyboardColShotIndex")} ${shot.shotIndex}`,
        prompt: shot.imagePrompt || "",
        model_id: genModelId,
        aspect_ratio: genAspectRatio,
        image_size: genImageSize,
        ...(genOutputQuality && { output_quality: genOutputQuality }),
        status: "idle",
        groupId,
        _sbNodeId: id,
        _sbShotId: shot.id,
      }, { w: nodeW, h: nodeH });
      childEntries.push({ childId, shot });
    }

    updaters.addEdgeById(id, groupId);

    const allChildIds = childEntries.map((e) => e.childId);
    const layoutCtx: GroupLayoutCtx = { groupId, childIds: allChildIds, cols };

    const sourceRefs = connectedRefs.images.filter(Boolean);

    const recentResultUrls: string[] = [];
    setChainProgress({ current: 0, total: childEntries.length });

    for (let i = 0; i < childEntries.length; i++) {
      const { childId, shot } = childEntries[i];
      setChainProgress({ current: i + 1, total: childEntries.length });
      setGeneratingIds((prev) => new Set(prev).add(shot.id));

      try {
        const shotRefs = [...(shot.referenceImageUrls ?? []), ...(shot.thumbnailUrls ?? []), shot.thumbnailUrl].filter(Boolean) as string[];
        const chainRefs = recentResultUrls.slice(-CHAIN_REF_WINDOW);
        const allRefs = [...new Set([...shotRefs, ...chainRefs, ...sourceRefs])];

        const res = await fetch("/api/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: shot.imagePrompt,
            model_id: genModelId,
            aspect_ratio: genAspectRatio,
            image_size: genImageSize,
            ...(genOutputQuality && { output_quality: genOutputQuality }),
            node_id: childId,
            ...(allRefs.length > 0 && { reference_images: allRefs }),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          jobId?: string;
          error?: string | { message?: string };
        };
        if (!res.ok) {
          const errMsg =
            typeof j.error === "string"
              ? j.error
              : j.error?.message ?? `Image generation request failed (${res.status})`;
          throw new Error(errMsg);
        }
        if (!j.jobId) {
          throw new Error("Image generation did not return jobId");
        }

        updateNodeData(childId, { status: "running", jobId: j.jobId, errorMessage: undefined });

        const resultUrl = await waitForChildJob(childId, j.jobId, shot.id, layoutCtx);
        if (resultUrl) recentResultUrls.push(resultUrl);
      } catch (e) {
        console.error(`[storyboard-gen] shot ${shot.shotIndex} failed:`, e);
        updateNodeData(childId, {
          status: "failed",
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        setGeneratingIds((prev) => { const n = new Set(prev); n.delete(shot.id); return n; });
        setFailedIds((prev) => new Set(prev).add(shot.id));
      }
    }
    // Final relayout to ensure everything is aligned after all jobs complete
    relayoutGroupChildren(groupId, allChildIds, cols);
    setChainProgress(null);
    setGenMode(false);
    setSelectedShotIds(new Set());
  }, [selectedShotIds, rows, genModelId, genAspectRatio, genImageSize, genOutputQuality, id, data.label, updaters, updateNodeData, waitForChildJob, connectedRefs.images, t]);

  /**
   * Grid mode: merge all selected shot prompts into ONE combined prompt and
   * call the image generation API exactly ONCE, producing a single grid image.
   * This costs only 1 image credit regardless of how many shots are selected.
   */
  const handleGenerateGrid = useCallback(async () => {
    if (selectedShotIds.size === 0) return;
    const selected = rows.filter((r) => selectedShotIds.has(r.id) && r.imagePrompt?.trim());
    if (selected.length < 2) return;

    const storeState = useCanvasStore.getState();
    const sbNode = storeState._nodeMap.get(id);
    if (!sbNode) return;

    const sbX = sbNode.position.x;
    const sbY = sbNode.position.y;
    const sbW = Number(sbNode.style?.width ?? sbNode.width ?? 400);

    // Mark all selected shots as generating
    const allShotIds = selected.map((s) => s.id);
    setGeneratingIds((prev) => {
      const n = new Set(prev);
      allShotIds.forEach((sid) => n.add(sid));
      return n;
    });
    setChainProgress({ current: 1, total: 1 });

    // Determine grid layout
    const count = selected.length;
    const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const gridRows = Math.ceil(count / cols);

    // Build a single merged prompt that instructs the model to generate a grid image
    const isZh = locale.startsWith("zh");
    const shotLabel = (idx: number) => isZh ? `分镜${idx}` : `Shot ${idx}`;

    const shotDescriptions = selected.map((shot) => {
      const label = shotLabel(shot.shotIndex);
      // Strip any existing shot-label instructions from the individual prompt
      let p = (shot.imagePrompt || "").trim();
      p = p.replace(/'(分镜\d+|Shot \d+)'\s*in the top-left corner\.?\s*/gi, "").trim();
      p = p.replace(/No timecode,?\s*no subtitles\.?\s*/gi, "").trim();
      return `[${label}]: ${p}`;
    }).join("\n\n");

    // Calculate the overall image aspect ratio based on grid layout and cell ratio
    // The user-selected ratio applies to the OVERALL grid image, not individual cells
    const gridApiAspect = genAspectRatio !== "auto" ? genAspectRatio : "16:9";

    const mergedPrompt = isZh
      ? `请生成一张 ${cols}列×${gridRows}行 的均匀宫格合并图，整体比例为 ${gridApiAspect}，包含 ${count} 个分镜画面。所有格子大小完全相同，均匀排列。格子之间用细黑线分隔，整体背景为深色。每个格子左上角用白色小字标注分镜编号（"分镜1"、"分镜2"等）。不要时间码，不要字幕。${count < cols * gridRows ? `最后${cols * gridRows - count}个格子留空为纯黑。` : ""}

各分镜内容如下：

${shotDescriptions}`
      : `Generate a single ${cols}×${gridRows} uniform grid composite image with overall aspect ratio ${gridApiAspect}, containing ${count} storyboard shots. All cells must be exactly the same size, evenly arranged. Separate cells with thin black lines on a dark background. Label each cell in the top-left corner with small white text showing its shot number ("Shot 1", "Shot 2", etc.). No timecode, no subtitles.${count < cols * gridRows ? ` Leave the last ${cols * gridRows - count} cell(s) as solid black.` : ""}

Shot descriptions:

${shotDescriptions}`;

    try {
      const sourceRefs = connectedRefs.images.filter(Boolean);
      const shotRefs = selected.flatMap((shot) =>
        [...(shot.referenceImageUrls ?? []), ...(shot.thumbnailUrls ?? []), shot.thumbnailUrl].filter(Boolean) as string[]
      );
      const allRefs = [...new Set([...shotRefs, ...sourceRefs])];

      // Create the node IMMEDIATELY (like individual mode) with status "idle"
      const config = NODE_TYPE_CONFIGS["image-gen"];
      const nodeX = sbX + sbW + 80;
      const nodeY = sbY;

      const gridNodeId = updaters.addNodeWithData("image-gen", nodeX, nodeY, {
        label: `${data.label || t("storyboardGenerate")} · ${t("storyboardOutputGrid")}`,
        prompt: mergedPrompt,
        model_id: genModelId,
        aspect_ratio: genAspectRatio,
        image_size: genImageSize,
        ...(genOutputQuality && { output_quality: genOutputQuality }),
        status: "idle",
        _sbNodeId: id,
      }, { w: config.defaultWidth, h: config.defaultHeight });

      updaters.addEdgeById(id, gridNodeId);

      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: mergedPrompt,
          model_id: genModelId,
          aspect_ratio: gridApiAspect,
          image_size: genImageSize,
          ...(genOutputQuality && { output_quality: genOutputQuality }),
          node_id: gridNodeId,
          ...(allRefs.length > 0 && { reference_images: allRefs }),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string | { message?: string };
      };
      if (!res.ok || !j.jobId) {
        const errMsg = typeof j.error === "string" ? j.error : (j.error as any)?.message ?? "Grid generation failed";
        updateNodeData(gridNodeId, { status: "failed", errorMessage: errMsg });
        throw new Error(errMsg);
      }

      // Update node to running state — use `jobId` (not `currentJobId`) so the
      // page-level recovery mechanism can re-attach SSE if the user leaves and returns.
      updateNodeData(gridNodeId, { status: "running", jobId: j.jobId, errorMessage: undefined });

      // Wait for the single job result via SSE, then update the existing node
      await new Promise<void>((resolve) => {
        const es = new EventSource(`/api/jobs/${j.jobId}/sse`);
        es.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as {
              status?: string;
              url?: string;
              thumbnailUrl?: string;
              aspect_ratio?: string;
              width?: number;
              height?: number;
              assets?: Array<{ url?: string; thumbnailUrl?: string }>;
              error?: string;
            };
            if (msg.status === "SUCCEEDED" || msg.status === "PARTIAL_SUCCESS") {
              es.close();
              const imgUrl = msg.url || msg.assets?.[0]?.url;
              const thumbUrl = msg.thumbnailUrl || msg.assets?.[0]?.thumbnailUrl || imgUrl;
              if (!imgUrl) {
                updateNodeData(gridNodeId, { status: "failed", errorMessage: "No image URL in result" });
                resolve();
                return;
              }

              updateNodeData(gridNodeId, { imageUrl: imgUrl, thumbnailUrl: thumbUrl, status: "succeeded" });

              // Resize node to match actual image ratio
              let rw: number | undefined, rh: number | undefined;
              if (msg.width && msg.height) { rw = msg.width; rh = msg.height; }
              else if (msg.aspect_ratio && msg.aspect_ratio !== "auto") {
                [rw, rh] = msg.aspect_ratio.split(":").map(Number);
              }

              if (rw && rh) {
                const { w, h } = fitNodeToRatio(rw, rh);
                useCanvasStore.getState().updateNodeSize(gridNodeId, w, h);
              } else {
                // SSE didn't return dimensions — probe the actual image
                const img = new Image();
                img.onload = () => {
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const { w, h } = fitNodeToRatio(img.naturalWidth, img.naturalHeight);
                    useCanvasStore.getState().updateNodeSize(gridNodeId, w, h);
                  }
                };
                img.src = imgUrl;
              }
              resolve();
              resolve();
            }
            if (msg.status === "FAILED") {
              es.close();
              updateNodeData(gridNodeId, { status: "failed", errorMessage: msg.error });
              resolve();
            }
          } catch { /* ignore */ }
        };
        es.onerror = () => {
          es.close();
          updateNodeData(gridNodeId, { status: "failed", errorMessage: "Connection lost" });
          resolve();
        };
      });
    } catch (e) {
      console.error("[storyboard-grid] generation failed:", e);
    }

    // Clear all generating states
    setGeneratingIds((prev) => {
      const n = new Set(prev);
      allShotIds.forEach((sid) => n.delete(sid));
      return n;
    });
    setChainProgress(null);
    setGenMode(false);
    setSelectedShotIds(new Set());
  }, [selectedShotIds, rows, genModelId, genAspectRatio, genImageSize, genOutputQuality, id, data.label, updaters, updateNodeData, connectedRefs.images, locale, t]);

  // ── Parse logic ──
  const syncStoryboardFromServer = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/canvas`);
    if (!res.ok) return;
    const j = (await res.json()) as { canvas_data?: { nodes?: { id: string; data: NodeData }[] } };
    const node = j.canvas_data?.nodes?.find((n) => n.id === id);
    if (node?.data) {
      updateNodeData(id, node.data);
    }
  }, [projectId, id, updateNodeData]);

  const fillFromConnectedText = useCallback(() => {
    const parts = connectedRefs.textNodes.map((n) => n.content?.trim()).filter(Boolean);
    const text = parts.join("\n\n");
    setScriptText(text);
    setScriptJson(undefined);
    updaters.updateData({ parseScript: text, parseScriptJson: undefined } as Partial<NodeData>);
  }, [connectedRefs.textNodes, updaters]);

  const submitParseJob = useCallback(async (body: Record<string, unknown>) => {
    if (!projectId) return;
    const parseLocale = locale.startsWith("zh") ? "zh" : "en";
    setParseBusy(true);
    try {
      const res = await fetch("/api/storyboard/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          project_id: projectId,
          node_id: id,
          locale: parseLocale,
          model: parseModelId,
          ...(directorRules.trim() && { director_rules: directorRules.trim() }),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { jobId?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? res.statusText);
      if (!j.jobId) throw new Error("No jobId");
      updaters.updateData({ parseStatus: "queued", parseJobId: j.jobId } as Partial<NodeData>);
    } catch (e) {
      updaters.updateData({
        parseStatus: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
      } as Partial<NodeData>);
      setParseBusy(false);
    }
  }, [projectId, id, locale, parseModelId, directorRules, updaters]);

  const runParse = useCallback(() => {
    const text = scriptText.trim();
    if (!text) return;
    const refUrls = connectedRefs.images.filter(
      (u) => !!u && (/^https?:\/\//i.test(u) || u.startsWith("/api/files/")),
    );
    void submitParseJob({
      source_type: "text",
      text,
      ...(maxShots !== null && { max_shots: maxShots }),
      ...(refUrls.length > 0 && { reference_image_urls: refUrls }),
    });
  }, [scriptText, maxShots, connectedRefs.images, submitParseJob]);

  const runParseImages = useCallback(() => {
    const urls = connectedRefs.images.filter((u) =>
      !!u && (/^https?:\/\//i.test(u) || u.startsWith("/api/files/")),
    );
    if (urls.length === 0) return;
    void submitParseJob({ source_type: "images", image_urls: urls });
  }, [connectedRefs.images, submitParseJob]);

  const runParseVideo = useCallback(() => {
    const url = connectedRefs.videos[0];
    if (!url) return;
    void submitParseJob({
      source_type: "video",
      video_url: url,
      ...(maxShots !== null && { max_shots: maxShots }),
    });
  }, [connectedRefs.videos, maxShots, submitParseJob]);

  useEffect(() => {
    if (!projectId || !parseJobId) return;
    if (parseStatus !== "queued" && parseStatus !== "running") return;

    setParseBusy(true);
    const es = new EventSource(`/api/jobs/${parseJobId}/sse`);
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          status?: string;
          kind?: string;
          error?: string;
          phase?: string;
          progressCurrent?: number;
          progressTotal?: number;
        };
        if (msg.status === "RUNNING") {
          updaters.updateData({ parseStatus: "running" } as Partial<NodeData>);
          if (msg.phase) {
            setVideoProgress({
              phase: msg.phase,
              current: msg.progressCurrent,
              total: msg.progressTotal,
            });
          }
        }
        if (msg.status === "SUCCEEDED" && msg.kind === "storyboard.parse") {
          es.close();
          setParseBusy(false);
          setVideoProgress(null);
          void syncStoryboardFromServer();
        }
        if (msg.status === "FAILED") {
          es.close();
          setParseBusy(false);
          setVideoProgress(null);
          void syncStoryboardFromServer();
        }
        if (msg.status === "CANCELED") {
          es.close();
          setParseBusy(false);
          setVideoProgress(null);
          updaters.updateData({ parseStatus: "idle", parseJobId: undefined } as Partial<NodeData>);
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      setParseBusy(false);
    };
    return () => es.close();
  }, [projectId, parseJobId, parseStatus, updaters, syncStoryboardFromServer]);

  const parsePhaseLabel = useMemo(() => {
    if (parseStatus === "queued") return t("storyboardParseQueued");
    if (parseStatus === "running") {
      if (videoProgress?.phase === "extracting" && videoProgress.current != null && videoProgress.total != null) {
        return t("storyboardVideoExtracting", { current: videoProgress.current, total: videoProgress.total });
      }
      if (videoProgress?.phase === "director_planning") return t("storyboardDirectorPlanning");
      if (videoProgress?.phase === "director_planning_fallback") return t("storyboardDirectorPlanningFallback");
      if (videoProgress?.phase === "composing") return t("storyboardComposing");
      if (videoProgress?.phase === "analyzing") return t("storyboardVideoAnalyzing");
      if (videoProgress?.phase === "probing") return t("storyboardVideoProbing");
      return t("storyboardParseRunning");
    }
    return null;
  }, [parseStatus, videoProgress, t]);

  return (
    <>
      {/* Toolbar above node */}
      <StoryboardToolbar
        inverseZoom={inverseZoom}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        shotCount={rows.length}
        parsePhaseLabel={parsePhaseLabel}
        parseStatus={parseStatus}
        errorMessage={errorMessage}
        selectedCount={selectedShotIds.size}
        onSelectAll={selectAllShots}
        onDeselectAll={deselectAllShots}
        genMode={genMode}
        onToggleGenMode={toggleGenMode}
        onGenerateAll={generateAll}
        chainProgress={chainProgress}
        onCancelParse={cancelParse}
        onRetryParse={retryParse}
      />

      {/* Node content overlay */}
      <div className="absolute inset-0 z-20 flex flex-col rounded-[12px] bg-[#141414]/98 border border-zinc-700/50 pointer-events-auto">
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={280}
          minHeight={160}
          onResizeEnd={(_event, params) => {
            updaters.updateSize(params.width, params.height);
          }}
          className="xinyu-text-resize-control"
          style={{
            ["--xinyu-arc-color" as string]: "rgba(255, 255, 255, 0.9)",
            width: 24,
            height: 24,
            background: "transparent",
            border: "none",
            borderRadius: 0,
            overflow: "visible",
            zIndex: 1001,
          }}
        >
          <div className="xinyu-text-resize-arc" />
        </NodeResizeControl>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-auto nowheel">
          {viewMode === "table" ? (
            <ShotTable
              rows={rows}
              onChange={setRows}
              selectedIds={genMode ? selectedShotIds : undefined}
              onToggleSelect={genMode ? toggleShotSelection : undefined}
              generatingIds={generatingIds.size > 0 ? generatingIds : undefined}
              failedIds={failedIds.size > 0 ? failedIds : undefined}
            />
          ) : (
            <ShotCreativeGrid
              rows={rows}
              onChange={setRows}
              selectedIds={genMode ? selectedShotIds : undefined}
              onToggleSelect={genMode ? toggleShotSelection : undefined}
              generatingIds={generatingIds.size > 0 ? generatingIds : undefined}
              failedIds={failedIds.size > 0 ? failedIds : undefined}
            />
          )}
        </div>
      </div>

      {/* Generation panel (shown in gen mode with selections, or while generating) */}
      {(genMode && selectedShotIds.size > 0) || generatingIds.size > 0 ? (
        <StoryboardGenPanel
          selectedCount={selectedShotIds.size}
          modelId={genModelId}
          onModelChange={setGenModelId}
          aspectRatio={genAspectRatio}
          onAspectRatioChange={setGenAspectRatio}
          imageSize={genImageSize}
          onImageSizeChange={setGenImageSize}
          outputQuality={genOutputQuality}
          onOutputQualityChange={setGenOutputQuality}
          onGenerate={genOutputMode === "grid" ? handleGenerateGrid : handleGenerate}
          isGenerating={generatingIds.size > 0}
          inverseZoom={inverseZoom}
          outputMode={genOutputMode}
          onOutputModeChange={setGenOutputMode}
        />
      ) : (
        <StoryboardParsePanel
          scriptText={scriptText}
          onScriptChange={handleScriptChange}
          scriptJson={scriptJson}
          onScriptJsonChange={handleScriptJsonChange}
          modelId={parseModelId}
          onModelChange={(v) => updaters.updateData({ parseModelId: v } as Partial<NodeData>)}
          directorRules={directorRules}
          onDirectorRulesChange={handleDirectorRulesChange}
          maxShots={maxShots}
          onMaxShotsChange={(v) => updaters.updateData({ parseMaxShots: v ?? undefined } as Partial<NodeData>)}
          onParse={runParse}
          onParseImages={runParseImages}
          onParseVideo={runParseVideo}
          onFillFromEdges={fillFromConnectedText}
          isParsing={parseBusy}
          hasConnectedText={connectedRefs.textNodes.length > 0}
          connectedImageCount={connectedRefs.images.length}
          connectedVideoCount={connectedRefs.videos.length}
          inverseZoom={inverseZoom}
          connectedRefs={connectedRefs}
        />
      )}
    </>
  );
}
