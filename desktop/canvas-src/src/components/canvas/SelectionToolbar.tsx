"use client";

import { memo, useState, useCallback, useRef, useMemo, useEffect, type MouseEvent } from "react";
import type { CanvasNode } from "@/types/canvas";
import { useStore, useReactFlow } from "@xyflow/react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignVerticalJustifyCenter,
  CircleEllipsis,
  Group, Ungroup, Trash2, Plus,
  Grid2X2, Loader2, Download,
} from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useMultiDragStore } from "@/stores/multi-drag-store";
import { useHandleProximityStore } from "@/stores/handle-proximity-store";
import {
  getImageOriginalUrl,
  getVideoOriginalUrl,
} from "@/lib/media-url";
import { trackEvent } from "@/lib/analytics";

const GROUP_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
];

const transformSelector = (s: { transform: [number, number, number] }) => s.transform;

function useSelectionBounds() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedIds = useCanvasStore((s) => s.selectedNodeIds);

  return useMemo(() => {
    if (selectedIds.size === 0) return null;
    const selected = nodes.filter((n) => selectedIds.has(n.id));
    if (selected.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selected) {
      const w = Number(n.style?.width ?? n.width ?? 280);
      const h = Number(n.style?.height ?? n.height ?? 200);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }, [nodes, selectedIds]);
}

function ToolbarButton({ icon: Icon, label, onClick, variant = "default" }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger" | "primary";
}) {
  const cls = variant === "danger"
    ? "hover:bg-red-500/15 hover:text-red-400"
    : variant === "primary"
    ? "hover:bg-white/10 hover:text-white"
    : "hover:bg-white/[0.08] hover:text-zinc-200";

  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-zinc-400 transition-colors ${cls}`}
      onClick={onClick}
      title={label}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

function AlignDistributePopover({ t, alignSelected, distributeSelected }: {
  t: (key: string) => string;
  alignSelected: (dir: "left" | "center-h" | "right" | "top" | "center-v" | "bottom") => void;
  distributeSelected: (axis: "horizontal" | "vertical") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const alignItems: { icon: LucideIcon; label: string; dir: "left" | "center-h" | "right" | "top" | "center-v" | "bottom" }[] = [
    { icon: AlignStartVertical, label: t("alignLeft"), dir: "left" },
    { icon: AlignCenterVertical, label: t("alignCenterH"), dir: "center-h" },
    { icon: AlignEndVertical, label: t("alignRight"), dir: "right" },
    { icon: AlignStartHorizontal, label: t("alignTop"), dir: "top" },
    { icon: AlignCenterHorizontal, label: t("alignCenterV"), dir: "center-v" },
    { icon: AlignEndHorizontal, label: t("alignBottom"), dir: "bottom" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
        onClick={() => setOpen(!open)}
        title={t("alignLabel")}
      >
        <CircleEllipsis size={14} />
        <span>{t("alignLabel")}</span>
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 py-1.5 min-w-[180px] rounded-lg bg-[#1c1c1c] border border-zinc-700/60 shadow-xl z-50">
          <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{t("alignSectionLabel")}</div>
          <div className="grid grid-cols-3 gap-0.5 px-2 py-1">
            {alignItems.map(({ icon: Icon, label, dir }) => (
              <button
                key={dir}
                type="button"
                className="flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                onClick={() => { alignSelected(dir); setOpen(false); }}
                title={label}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <div className="mx-2 my-1 h-px bg-zinc-700/50" />
          <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{t("distributeSectionLabel")}</div>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            onClick={() => { distributeSelected("horizontal"); setOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="6" width="4" height="12" rx="1" /><rect x="10" y="4" width="4" height="16" rx="1" /><rect x="19" y="8" width="4" height="8" rx="1" />
            </svg>
            {t("distributeH")}
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            onClick={() => { distributeSelected("vertical"); setOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="1" width="12" height="4" rx="1" /><rect x="4" y="10" width="16" height="4" rx="1" /><rect x="8" y="19" width="8" height="4" rx="1" />
            </svg>
            {t("distributeV")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Collect the best available image URL from a node (prefer original) */
function getImageUrl(node: CanvasNode): string | null {
  const d = node.data;
  // For multi-image nodes, use the primary or first image
  if (d.originalImageUrls?.length) {
    const idx = d.primaryImageIndex ?? 0;
    return d.originalImageUrls[idx] ?? d.originalImageUrls[0] ?? null;
  }
  return (d.originalUrl as string) ?? (d.imageUrl as string) ?? null;
}

function MultiSelectToolbarInner() {
  const t = useTranslations("canvas");
  const groupSelected = useCanvasStore((s) => s.groupSelected);
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const alignSelected = useCanvasStore((s) => s.alignSelected);
  const distributeSelected = useCanvasStore((s) => s.distributeSelected);
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedIds = useCanvasStore((s) => s.selectedNodeIds);
  const [combining, setCombining] = useState(false);

  const selectedNodes = useMemo(() => nodes.filter((n) => selectedIds.has(n.id)), [nodes, selectedIds]);
  const hasImages = useMemo(() => selectedNodes.some((n) => getImageUrl(n) !== null), [selectedNodes]);

  const downloadableUrls = useMemo(() => {
    const urls: string[] = [];
    for (const n of selectedNodes) {
      const videoUrl = getVideoOriginalUrl(n.data) ?? "";
      const imageUrl = getImageOriginalUrl(n.data) ?? "";
      const audioUrl = String(n.data?.audioUrl ?? "");
      const url = videoUrl || imageUrl || audioUrl;
      if (url) urls.push(url);
    }
    return urls;
  }, [selectedNodes]);

  const [downloading, setDownloading] = useState(false);

  const handleBatchDownload = useCallback(async () => {
    if (downloadableUrls.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/files/batch-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: downloadableUrls }),
      });
      if (!res.ok) throw new Error(`Batch download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xinyu-assets-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent("canvas_batch_download", { count: downloadableUrls.length });
    } catch (err) {
      console.error("Batch download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [downloadableUrls, downloading]);

  const handleCombine = useCallback(async () => {
    // Sort nodes spatially: top-to-bottom rows, left-to-right within each row
    const withUrl = selectedNodes
      .map((n) => ({ node: n, url: getImageUrl(n) }))
      .filter((x) => x.url !== null);
    if (withUrl.length < 2) return;

    // Group into visual rows using a Y-threshold (half of average node height)
    const avgH = withUrl.reduce((s, x) => s + Number(x.node.style?.height ?? x.node.height ?? 200), 0) / withUrl.length;
    const rowThreshold = avgH * 0.4;
    const sorted = [...withUrl].sort((a, b) => a.node.position.y - b.node.position.y);
    const rows: typeof withUrl[] = [];
    for (const item of sorted) {
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(item.node.position.y - lastRow[0].node.position.y) < rowThreshold) {
        lastRow.push(item);
      } else {
        rows.push([item]);
      }
    }
    for (const row of rows) row.sort((a, b) => a.node.position.x - b.node.position.x);
    const urls = rows.flat().map((x) => x.url) as string[];
    if (urls.length < 2) return;
    setCombining(true);
    try {
      const res = await fetch("/api/images/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error(`Combine failed: ${res.status}`);
      const result = await res.json();

      const store = useCanvasStore.getState();
      // Position the new node to the right of the selection
      const sel = store.nodes.filter((n) => selectedIds.has(n.id));
      let maxX = -Infinity;
      let avgY = 0;
      for (const n of sel) {
        const w = Number(n.style?.width ?? n.width ?? 280);
        maxX = Math.max(maxX, n.position.x + w);
        avgY += n.position.y;
      }
      avgY = sel.length > 0 ? avgY / sel.length : 0;

      const SHORT = 400;
      const ratio = result.width / result.height;
      const nodeW = ratio >= 1 ? Math.round(SHORT * ratio) : SHORT;
      const nodeH = ratio >= 1 ? SHORT : Math.round(SHORT / ratio);

      store.addNodeWithData(
        "source-image",
        maxX + 60,
        avgY,
        {
          imageUrl: result.url,
          originalUrl: result.originalUrl,
          thumbnailUrl: result.thumbnailUrl,
          thumbnailLevels: result.thumbnailLevels,
          originalImageUrls: [result.originalUrl],
          status: "idle",
          label: `combined-${urls.length}.png`,
        },
        { w: nodeW, h: nodeH },
      );
    } catch (err) {
      console.error("Combine images failed:", err);
    } finally {
      setCombining(false);
    }
  }, [selectedNodes, selectedIds]);

  return (
    <div className="flex items-center gap-0.5">
      <AlignDistributePopover t={t} alignSelected={alignSelected} distributeSelected={distributeSelected} />

      <div className="w-px h-5 bg-white/10 mx-1" />

      {hasImages && (
        <ToolbarButton
          icon={combining ? Loader2 : Grid2X2}
          label={t("combineImages")}
          onClick={handleCombine}
        />
      )}
      {downloadableUrls.length > 0 && (
        <ToolbarButton
          icon={downloading ? Loader2 : Download}
          label={t("batchDownload")}
          onClick={handleBatchDownload}
        />
      )}
      <ToolbarButton icon={Group} label={t("groupNodes")} onClick={groupSelected} variant="primary" />
      <ToolbarButton icon={Trash2} label={t("delete")} onClick={deleteSelected} variant="danger" />
    </div>
  );
}

function GroupToolbarInner({ groupId }: { groupId: string }) {
  const t = useTranslations("canvas");
  const ungroupNode = useCanvasStore((s) => s.ungroupNode);
  const deleteGroup = useCanvasStore((s) => s.deleteGroup);
  const layoutGroupHorizontal = useCanvasStore((s) => s.layoutGroupHorizontal);
  const layoutGroupGrid = useCanvasStore((s) => s.layoutGroupGrid);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [showColors, setShowColors] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const groupColor = useCanvasStore((s) => {
    const node = s.nodes.find((n) => n.id === groupId);
    return String(node?.data?.groupColor ?? "#6b7280");
  });

  const handleColorChange = useCallback((c: string) => {
    updateNodeData(groupId, { groupColor: c });
    setShowColors(false);
  }, [groupId, updateNodeData]);

  return (
    <div className="flex items-center gap-0.5">
      <div className="relative" ref={colorRef}>
        <button
          type="button"
          className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
          onClick={() => setShowColors(!showColors)}
          title={t("groupColor")}
        >
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: groupColor }} />
        </button>
        {showColors && (
          <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg bg-[#1c1c1c] border border-zinc-700/60 shadow-lg flex gap-1 z-50">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => handleColorChange(c)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/10 mx-1" />

      <ToolbarButton icon={AlignVerticalJustifyCenter} label={t("layoutHorizontal")} onClick={() => layoutGroupHorizontal(groupId)} />
      <ToolbarButton icon={Grid2X2} label={t("layoutGrid")} onClick={() => layoutGroupGrid(groupId)} />

      <div className="w-px h-5 bg-white/10 mx-1" />
      <ToolbarButton icon={Ungroup} label={t("ungroupNodes")} onClick={() => ungroupNode(groupId)} />
      <ToolbarButton icon={Trash2} label={t("deleteGroup")} onClick={() => deleteGroup(groupId)} variant="danger" />
    </div>
  );
}

const MULTI_DRAG_PROXIMITY_PX = 60;

/** Convert screen (client) coordinates to flow coordinates by reading DOM transform directly */
function screenToFlow(screenX: number, screenY: number): { x: number; y: number } | null {
  const rfContainer = document.querySelector(".react-flow") as HTMLElement | null;
  const vpEl = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!rfContainer || !vpEl) return null;
  const rect = rfContainer.getBoundingClientRect();
  const transform = vpEl.style.transform;
  const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/);
  if (!match) return null;
  const tx = parseFloat(match[1]);
  const ty = parseFloat(match[2]);
  const scale = parseFloat(match[3]);
  return {
    x: (screenX - rect.left - tx) / scale,
    y: (screenY - rect.top - ty) / scale,
  };
}

/** Detect proximity to a node's LEFT handle (input side), same mechanism as single connection snap */
function findNearestLeftHandle(
  screenX: number,
  screenY: number,
  excludeIds: Set<string>,
): string | null {
  const flow = screenToFlow(screenX, screenY);
  if (!flow) return null;
  const allNodes = useCanvasStore.getState().nodes;
  const zoomMatch = (document.querySelector(".react-flow__viewport") as HTMLElement)
    ?.style.transform?.match(/scale\(([^)]+)\)/)?.[1];
  const z = zoomMatch ? parseFloat(zoomMatch) : 1;
  const threshold = MULTI_DRAG_PROXIMITY_PX / Math.max(z, 0.15);

  let nearest: string | null = null;
  let bestDist = Infinity;
  for (const node of allNodes) {
    if (excludeIds.has(node.id)) continue;
    if (node.data.nodeType === "group" || node.data.nodeType === "comment") continue;
    const nx = node.position.x;
    const ny = node.position.y;
    const nh = node.measured?.height ?? (node.height as number | undefined) ?? 200;
    if (flow.y < ny - threshold || flow.y > ny + nh + threshold) continue;
    const distLeft = Math.abs(flow.x - nx);
    if (distLeft <= threshold && distLeft < bestDist) {
      bestDist = distLeft;
      nearest = node.id;
    }
  }
  return nearest;
}

function SelectionToolbarComponent() {
  const { flowToScreenPosition } = useReactFlow();
  const transform = useStore(transformSelector);
  void transform;
  const selectedIds = useCanvasStore((s) => s.selectedNodeIds);
  const nodes = useCanvasStore((s) => s.nodes);
  const bounds = useSelectionBounds();

  const selectedNodes = useMemo(() =>
    nodes.filter((n) => selectedIds.has(n.id)),
    [nodes, selectedIds]
  );

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const handlePlusPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      didDragRef.current = false;

      const onMove = (ev: PointerEvent) => {
        if (!dragStartRef.current) return;
        const dist = Math.hypot(ev.clientX - dragStartRef.current.x, ev.clientY - dragStartRef.current.y);
        if (dist > 4 && !didDragRef.current) {
          didDragRef.current = true;
          useMultiDragStore.getState().startDrag(Array.from(selectedIdsRef.current), ev.clientX, ev.clientY);
        }
        if (didDragRef.current) {
          const store = useMultiDragStore.getState();
          store.updateCursor(ev.clientX, ev.clientY);
          const hit = findNearestLeftHandle(ev.clientX, ev.clientY, selectedIdsRef.current);
          if (hit !== store.hoveredNodeId) {
            store.setHoveredNode(hit);
            useHandleProximityStore.getState().setNear(hit);
          }
        }
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const wasDragging = didDragRef.current;
        dragStartRef.current = null;
        didDragRef.current = false;

        if (wasDragging) {
          let hit = useMultiDragStore.getState().hoveredNodeId;
          if (!hit) {
            hit = findNearestLeftHandle(ev.clientX, ev.clientY, selectedIdsRef.current);
          }
          if (hit) {
            useMultiDragStore.getState().endDrag();
            useHandleProximityStore.getState().setNear(null);
            window.dispatchEvent(
              new CustomEvent("xinyu:multiselect-plus-click", {
                detail: { screenX: ev.clientX, screenY: ev.clientY, nodeIds: Array.from(selectedIdsRef.current), targetNodeId: hit },
              }),
            );
          } else {
            useMultiDragStore.getState().pinDrag();
            useHandleProximityStore.getState().setNear(null);
            window.dispatchEvent(
              new CustomEvent("xinyu:multiselect-plus-click", {
                detail: { screenX: ev.clientX, screenY: ev.clientY, nodeIds: Array.from(selectedIdsRef.current) },
              }),
            );
          }
        } else {
          window.dispatchEvent(
            new CustomEvent("xinyu:multiselect-plus-click", {
              detail: { screenX: ev.clientX, screenY: ev.clientY, nodeIds: Array.from(selectedIdsRef.current) },
            }),
          );
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    },
    [],
  );

  const isMultiDragging = useMultiDragStore((s) => s.isDragging);
  const isMultiPinned = useMultiDragStore((s) => s.isPinned);

  if (!bounds || selectedIds.size < 1) return null;

  const isSingleGroup = selectedNodes.length === 1 && selectedNodes[0].data.nodeType === "group";
  const isMultiSelect = selectedIds.size >= 2 && !selectedNodes.every((n) => n.data.nodeType === "group");
  const isSingleNonGroup = selectedNodes.length === 1 && selectedNodes[0].data.nodeType !== "group";

  if (isSingleNonGroup) return null;
  if (!isSingleGroup && !isMultiSelect) return null;

  const screenPos = flowToScreenPosition({ x: bounds.cx, y: bounds.minY });

  const rightCenterScreen = isMultiSelect
    ? flowToScreenPosition({ x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 })
    : null;

  return (
    <>
      <div
        className="fixed z-50 pointer-events-auto"
        style={{
          left: screenPos.x,
          top: screenPos.y,
          transform: "translate(-50%, -100%) translateY(-12px)",
        }}
      >
        <div className="h-10 px-1.5 rounded-full flex items-center bg-[#1a1a1a]/90 backdrop-blur-lg border border-white/10 shadow-lg">
          {isSingleGroup ? (
            <GroupToolbarInner groupId={selectedNodes[0].id} />
          ) : (
            <MultiSelectToolbarInner />
          )}
        </div>
      </div>

      {isMultiSelect && rightCenterScreen && (
        <div
          className={`fixed z-50 pointer-events-auto cursor-grab active:cursor-grabbing ${isMultiDragging || isMultiPinned ? "opacity-0 pointer-events-none" : ""}`}
          style={{
            left: rightCenterScreen.x,
            top: rightCenterScreen.y,
            transform: "translate(12px, -50%)",
          }}
          onPointerDown={handlePlusPointerDown}
        >
          <div className="size-8 rounded-full bg-zinc-500/80 backdrop-blur flex items-center justify-center hover:bg-zinc-400 transition-colors shadow-lg">
            <Plus size={18} className="text-white stroke-[2.5]" />
          </div>
        </div>
      )}
    </>
  );
}

export const SelectionToolbar = memo(SelectionToolbarComponent);
