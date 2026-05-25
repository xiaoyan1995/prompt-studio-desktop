"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Plus, Loader2 } from "lucide-react";
import { invalidateMaterialCache } from "@/hooks/use-materials";
import { showToast } from "@/components/ui/GlobalToast";

interface FolderNode {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  material_count: number;
  created_at: string;
  children?: FolderNode[];
}

interface SaveToMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeData: {
    nodeType: string;
    imageUrl?: string;
    originalUrl?: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    originalVideoUrl?: string;
    audioUrl?: string;
    imageUrls?: string[];
    originalImageUrls?: string[];
    thumbnailUrls?: string[];
    label?: string;
    width?: number;
    height?: number;
    duration_s?: number;
    audioDuration?: number;
  };
}

/* ── Build tree from flat list ── */
function buildFolderTree(flat: FolderNode[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const f of flat) map.set(f.id, { ...f, children: [] });
  const roots: FolderNode[] = [];
  for (const f of map.values()) {
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children!.push(f);
    } else {
      roots.push(f);
    }
  }
  return roots;
}

/* ── 3D Animated Folder Icon (brand neon green — matches MaterialPanel) ── */
function FolderIcon({ hasContent = false }: { hasContent?: boolean }) {
  const uid = useRef(`sf-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <div className="group/asset-folder relative w-6 h-6 shrink-0 select-none">
      <svg className="absolute left-0 w-6" viewBox="0 0 24 16" fill="none" style={{ top: 3, height: "15.25px" }}>
        <defs>
          <linearGradient id={`${uid}-back`} x1="12" y1="0" x2="12" y2="5.25" gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#7a9900" />
            <stop offset="1" stopColor="#4d6600" />
          </linearGradient>
        </defs>
        <path d="M1.90714 0C0.853857 0 0 0.853857 0 1.90714V15.25H24V3.83571C24 2.77059 23.1366 1.90714 22.0714 1.90714H11.1L10.4306 1.86058C10.0631 1.83501 9.71068 1.70474 9.4149 1.48517L8.09689 0.506737C7.65362 0.177671 7.11621 0 6.56415 0H1.90714Z" fill={`url(#${uid}-back)`} />
      </svg>
      {hasContent && (
        <div
          className="absolute z-[1] left-1 bottom-0 w-5 h-5 transition-transform duration-200 ease-out -rotate-[10deg] -translate-y-[8px] group-hover/asset-folder:-translate-y-[12px]"
          style={{ transformOrigin: "right bottom" }}
        >
          <svg className="h-full w-full" viewBox="-1 -0.5 22 17" fill="none">
            <defs>
              <linearGradient id={`${uid}-ib`} x1="10" y1="0" x2="10" y2="5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8fb300" />
                <stop offset="1" stopColor="#5c7a00" />
              </linearGradient>
              <radialGradient id={`${uid}-if`} cx="0.5" cy="0.5" r="0.6" gradientUnits="objectBoundingBox">
                <stop stopColor="#d4f04c" />
                <stop offset="1" stopColor="#8fb300" />
              </radialGradient>
            </defs>
            <path d="M1.5 0C.67 0 0 .67 0 1.5V14.5c0 .83.67 1.5 1.5 1.5h17c.83 0 1.5-.67 1.5-1.5V3.5c0-.83-.67-1.5-1.5-1.5H9.2l-.5-.04a2.4 2.4 0 0 1-.9-.46L6.7.6A1.8 1.8 0 0 0 5.6.1H1.5Z" fill={`url(#${uid}-ib)`} />
            <rect y="4" width="20" height="12" rx="1.5" fill={`url(#${uid}-if)`} />
          </svg>
        </div>
      )}
      <div
        className="absolute z-[2] bottom-0 left-0 w-6 rounded-[2px] overflow-hidden transition-[transform] duration-200 ease-out [transform:perspective(60px)_rotateX(0deg)] group-hover/asset-folder:[transform:perspective(60px)_rotateX(-30deg)]"
        style={{
          height: 16,
          transformOrigin: "center bottom",
          boxShadow: "rgba(17,26,0,0.07) 0px -0.104px 1.166px 0px, rgba(17,26,0,0.25) 0px 0.207px 0.207px 0px, rgba(204,255,0,0.15) 0px 0.104px 0.207px 0px inset",
        }}
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 16" fill="none">
          <defs>
            <radialGradient id={`${uid}-fr`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 8) scale(12 16.41)">
              <stop stopColor="#CCFF00" />
              <stop offset="1" stopColor="#6b8c00" />
            </radialGradient>
          </defs>
          <rect width="24" height="16" rx="2" fill={`url(#${uid}-fr)`} />
        </svg>
      </div>
    </div>
  );
}

/* ── Recursive folder row for picker (matches MaterialPanel style) ── */
function PickerFolderRow({
  folder,
  depth,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const isExpanded = expanded.has(folder.id);
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const isSelected = selectedId === folder.id;

  return (
    <div>
      <div
        className={`group/picker-folder group/asset-folder flex w-full min-w-0 items-center gap-2 rounded-sm py-1 pr-1 cursor-pointer transition-colors ${
          isSelected ? "bg-[#CCFF00]/[0.10] ring-1 ring-[#CCFF00]/30" : "hover:bg-white/10"
        }`}
        style={{ paddingLeft: depth * 24 + 6 }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Chevron + Folder icon: click to expand/collapse */}
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center"
            onClick={() => onToggle(folder.id)}
          >
            <ChevronRight
              size={16}
              className={`-ml-0.5 transition-transform ${
                hasChildren
                  ? isExpanded ? "rotate-90 text-white/90" : "text-white/40"
                  : "text-transparent"
              }`}
            />
          </button>
          <div className="shrink-0 cursor-pointer" onClick={() => onToggle(folder.id)}>
            <FolderIcon hasContent={folder.material_count > 0} />
          </div>
          {/* Name: click to select */}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(folder.id)}
          >
            <span className={`truncate text-sm leading-snug font-semibold block ${
              isSelected ? "text-[#CCFF00]" : folder.material_count > 0 ? "text-white/90" : "text-white/60"
            }`}>
              {folder.name}
            </span>
          </button>
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div className="relative mt-0.5 space-y-0.5" style={{ marginLeft: depth * 24 + 17, paddingLeft: 11 }}>
          <span className="absolute left-0 top-0 bottom-0 w-px bg-[#CCFF00]/[0.15]" aria-hidden="true" />
          {folder.children!.map((child) => (
            <PickerFolderRow
              key={child.id}
              folder={child}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SaveToMaterialDialog({ open, onClose, nodeId, nodeData }: SaveToMaterialDialogProps) {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/materials/folders");
      if (res.ok) {
        const data = await res.json();
        const flat: FolderNode[] = data.folders ?? [];
        setFolderTree(buildFolderTree(flat));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) fetchFolders();
  }, [open, fetchFolders]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedFolderId(null);
      setExpandedFolders(new Set());
      setCreatingFolder(false);
      setNewFolderName("");
    }
  }, [open]);

  // Auto-focus new folder input
  useEffect(() => {
    if (creatingFolder) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50);
    }
  }, [creatingFolder]);

  const toggleFolder = useCallback((key: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/materials/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatingFolder(false);
        setNewFolderName("");
        await fetchFolders();
        if (data.folder?.id) setSelectedFolderId(data.folder.id);
      }
    } catch (err) {
      console.error("Create folder failed:", err);
    }
  }, [newFolderName, fetchFolders]);

  // Determine asset URL and type from node data
  const getAssetInfo = useCallback(() => {
    const d = nodeData;
    if (d.videoUrl || d.originalVideoUrl) {
      return {
        type: "VIDEO" as const,
        storageKey: d.originalVideoUrl || d.videoUrl!,
        thumbnailUrl: d.thumbnailUrl || d.imageUrl,
        mimeType: "video/mp4",
      };
    }
    if (d.audioUrl) {
      return {
        type: "AUDIO" as const,
        storageKey: d.audioUrl,
        thumbnailUrl: undefined,
        mimeType: "audio/mpeg",
      };
    }
    const imgUrl = d.originalUrl || d.imageUrl || d.originalImageUrls?.[0] || d.imageUrls?.[0];
    if (imgUrl) {
      return {
        type: "IMAGE" as const,
        storageKey: imgUrl,
        thumbnailUrl: d.thumbnailUrl || d.imageUrl || d.thumbnailUrls?.[0],
        mimeType: "image/png",
      };
    }
    return null;
  }, [nodeData]);

  const handleSave = useCallback(async () => {
    if (!selectedFolderId) return;
    const asset = getAssetInfo();
    if (!asset) return;

    setSaving(true);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "OTHERS",
          folder_id: selectedFolderId,
          name: nodeData.label || "节点素材",
          type: asset.type,
          storage_key: asset.storageKey,
          storage_bucket: "local",
          mime_type: asset.mimeType,
          file_size_bytes: 0,
          width: nodeData.width,
          height: nodeData.height,
          duration_s: nodeData.duration_s || nodeData.audioDuration,
          thumbnail_url: asset.thumbnailUrl,
        }),
      });
      if (res.ok) {
        const { duplicate } = await res.json().catch(() => ({ duplicate: false }));
        invalidateMaterialCache();
        window.dispatchEvent(new CustomEvent("material-saved", { detail: { folderId: selectedFolderId } }));
        onClose();
        showToast(duplicate ? "素材已存在于该文件夹" : "素材已保存", duplicate ? "info" : "success");
      } else {
        const errBody = await res.json().catch(() => null);
        console.error("Save to material failed:", res.status, errBody);
        showToast("保存失败，请重试", "warning");
      }
    } catch (err) {
      console.error("Save to material failed:", err);
    }
    setSaving(false);
  }, [selectedFolderId, getAssetInfo, nodeData, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const hasAsset = !!getAssetInfo();

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div
        className="relative min-w-[300px] w-[360px] rounded-2xl border border-white/10 bg-[rgba(38,38,38,0.95)] p-0 shadow-xl backdrop-blur-xl"
        style={{ boxShadow: "rgba(0,0,0,0.4) 0px 24px 48px" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="save-to-material-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <FolderIcon hasContent />
            <span className="truncate text-base font-semibold leading-6 text-white/90">
              保存到素材库
            </span>
          </div>
          <button
            type="button"
            onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-white/10 text-white/88 transition-colors hover:bg-white/[0.14]"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Folder tree */}
        <div className="h-[320px] overflow-auto px-5">
          <div className="min-w-max space-y-0.5 py-1">
            {/* New folder inline input */}
            {creatingFolder && (
              <div className="flex items-center gap-2 rounded-sm py-1 px-1.5 bg-white/[0.06]" style={{ paddingLeft: 6 }}>
                <div className="flex size-6 shrink-0 items-center justify-center">
                  <ChevronRight size={16} className="text-transparent" />
                </div>
                <div className="shrink-0">
                  <FolderIcon hasContent={false} />
                </div>
                <input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleCreateFolder(); }
                    if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                  }}
                  onBlur={() => {
                    if (newFolderName.trim()) handleCreateFolder();
                    else { setCreatingFolder(false); setNewFolderName(""); }
                  }}
                  placeholder="文件夹名称"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white/90 placeholder:text-white/30 outline-none border-none"
                />
              </div>
            )}

            {folderTree.length === 0 && !creatingFolder ? (
              <div className="flex flex-col items-center justify-center h-60 text-zinc-500">
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>暂无文件夹</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>点击右上角「新建文件夹」</p>
              </div>
            ) : (
              folderTree.map((f) => (
                <PickerFolderRow
                  key={f.id}
                  folder={f}
                  depth={0}
                  expanded={expandedFolders}
                  onToggle={toggleFolder}
                  selectedId={selectedFolderId}
                  onSelect={setSelectedFolderId}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 cursor-pointer rounded-sm border-[0.5px] border-black/[0.12] bg-white/10 px-3 py-1.5 text-[14px] font-medium leading-[20px] text-white/60 hover:bg-white/[0.14] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedFolderId || !hasAsset || saving}
            className="inline-flex items-center justify-center gap-2 h-8 cursor-pointer rounded-sm border-0 bg-white px-3 py-1.5 text-sm font-medium leading-5 text-black shadow hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
