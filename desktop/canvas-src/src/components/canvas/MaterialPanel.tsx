"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Music,
  Upload,
  Image as ImageIcon,
  Video,
  Loader2,
} from "lucide-react";
import { uploadFile, openFilePicker } from "@/lib/upload-client";
import { invalidateMaterialCache } from "@/hooks/use-materials";
import { useCanvasStore } from "@/stores/canvas-store";
import { useReactFlow } from "@xyflow/react";
import { useTranslations } from "next-intl";

/* ── Types ── */
type MaterialCategory = "CHARACTER" | "SCENE" | "ITEM" | "STYLE" | "SOUND_EFFECT" | "OTHERS";

interface FolderNode {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  material_count: number;
  created_at: string;
  children?: FolderNode[];
}

interface MaterialItem {
  id: string;
  category: MaterialCategory;
  folder_id?: string | null;
  name: string;
  description?: string;
  type: "IMAGE" | "VIDEO" | "AUDIO";
  storage_key: string;
  mime_type: string;
  file_size_bytes: number;
  width?: number;
  height?: number;
  duration_s?: number;
  thumbnail_url?: string;
  tags: string[];
  created_at: string;
}

interface MaterialPanelProps {
  open: boolean;
  onClose: () => void;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi)($|\?)/i.test(url);
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

/* ── 现代高逼格扁平琥珀色文件夹 Icon ── */
function FolderIcon({ hasContent = false }: { hasContent?: boolean }) {
  const uid = useRef(`f-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <div className="relative w-[21px] h-[18px] shrink-0 select-none">
      <svg className="w-full h-full" viewBox="0 0 24 20" fill="none">
        <defs>
          <linearGradient id={`${uid}-front`} x1="12" y1="2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id={`${uid}-back`} x1="12" y1="2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#b45309" />
            <stop offset="1" stopColor="#78350f" />
          </linearGradient>
        </defs>
        {/* 后板 */}
        <path d="M2 4a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z" fill={`url(#${uid}-back)`} />
        {/* 前盖 */}
        <path d="M2 7a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z" fill={`url(#${uid}-front)`} />
        <path d="M2 7h20" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── Dots menu icon ── */
function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
      <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
    </svg>
  );
}

/* ── Material Grid Card (Figma/Tapnow Style Gallery) ── */
function MaterialGridCard({
  mat,
  onMouseEnter,
  onMouseLeave,
  onDotsClick,
  isRenaming,
  renameName,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  mat: MaterialItem;
  onMouseEnter: (mat: MaterialItem, e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onDotsClick: (mat: MaterialItem, e: React.MouseEvent) => void;
  isRenaming?: boolean;
  renameName?: string;
  onRenameChange?: (v: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}) {
  const renameRef = useRef<HTMLInputElement>(null);
  const isVid = mat.type === "VIDEO";
  const isAudio = mat.type === "AUDIO";

  useEffect(() => {
    if (isRenaming) {
      setTimeout(() => {
        renameRef.current?.focus();
        renameRef.current?.select();
      }, 50);
    }
  }, [isRenaming]);

  return (
    <div
      className="group/asset-card relative aspect-square w-full rounded-xl border border-zinc-200/50 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer overflow-hidden flex flex-col items-center justify-center"
      draggable={!isRenaming}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-material-id", mat.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseEnter={(e) => onMouseEnter(mat, e)}
      onMouseLeave={onMouseLeave}
    >
      {/* Media content container */}
      <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center">
        {isAudio ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-br from-pink-500/5 to-pink-500/10">
            <Music size={20} className="text-pink-500 opacity-70" />
          </div>
        ) : mat.thumbnail_url && isVideoUrl(mat.thumbnail_url) ? (
          <video src={mat.thumbnail_url} className="w-full h-full object-cover" playsInline preload="metadata" muted />
        ) : mat.thumbnail_url ? (
          <img src={mat.thumbnail_url} alt={mat.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-600">
            <ImageIcon size={18} />
          </div>
        )}
      </div>

      {/* Video Badge */}
      {isVid && (
        <span className="absolute bottom-1.5 left-1.5 z-[2] size-5 rounded-md flex items-center justify-center bg-black/40 backdrop-blur-md text-white border border-white/10 shadow-sm">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M1.5 1V7L6.5 4L1.5 1Z" />
          </svg>
        </span>
      )}

      {/* Dynamic hover overlay with asset title */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/asset-card:opacity-100 transition-opacity duration-150 z-[1] flex items-end p-2 pointer-events-none">
        <span className="text-[10px] text-zinc-200 truncate w-full font-medium tracking-wide">
          {mat.name}
        </span>
      </div>

      {/* More actions overlay */}
      <button
        type="button"
        className="absolute top-1 right-1 z-[3] inline-flex items-center justify-center size-5 rounded-md bg-black/30 hover:bg-black/60 backdrop-blur-sm text-white border border-white/5 opacity-0 group-hover/asset-card:opacity-100 transition-opacity duration-150"
        onClick={(e) => {
          e.stopPropagation();
          onDotsClick(mat, e);
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {/* Inline renaming cover */}
      {isRenaming && (
        <div className="absolute inset-0 z-[4] bg-black/70 backdrop-blur-sm flex items-center p-2">
          <input
            ref={renameRef}
            value={renameName ?? ""}
            onChange={(e) => onRenameChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRenameSubmit?.();
              }
              if (e.key === "Escape") onRenameCancel?.();
            }}
            onBlur={() => {
              if (renameName?.trim()) onRenameSubmit?.();
              else onRenameCancel?.();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-zinc-800 text-xs text-white px-1.5 py-1 rounded border border-amber-500/30 outline-none text-center shadow-inner"
          />
        </div>
      )}
    </div>
  );
}

/* ── Folder tree row (recursive, with inline materials) ── */
function FolderTreeRow({
  folder,
  depth,
  expanded,
  onToggle,
  onDotsClick,
  renamingFolderId,
  renameName,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  folderMaterials,
  loadingFolderMats,
  onMatMouseEnter,
  onMatMouseLeave,
  onMatDotsClick,
  renamingMatId,
  renameMatName,
  onMatRenameChange,
  onMatRenameSubmit,
  onMatRenameCancel,
  dragOverFolderId,
  onDragOverFolder,
  onDropOnFolder,
}: {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDotsClick: (folder: FolderNode, e: React.MouseEvent) => void;
  renamingFolderId: string | null;
  renameName: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  folderMaterials: Record<string, MaterialItem[]>;
  loadingFolderMats: Set<string>;
  onMatMouseEnter: (mat: MaterialItem, e: React.MouseEvent) => void;
  onMatMouseLeave: () => void;
  onMatDotsClick: (mat: MaterialItem, e: React.MouseEvent) => void;
  renamingMatId: string | null;
  renameMatName: string;
  onMatRenameChange: (v: string) => void;
  onMatRenameSubmit: () => void;
  onMatRenameCancel: () => void;
  dragOverFolderId: string | null;
  onDragOverFolder: (id: string | null) => void;
  onDropOnFolder: (folderId: string, e: React.DragEvent) => void;
}) {
  const t = useTranslations("material");
  const isExpanded = expanded.has(folder.id);
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const hasExpandable = hasChildren || folder.material_count > 0;
  const isRenaming = renamingFolderId === folder.id;
  const renameRef = useRef<HTMLInputElement>(null);
  const mats = folderMaterials[folder.id];
  const isLoadingMats = loadingFolderMats.has(folder.id);

  useEffect(() => {
    if (isRenaming) setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 50);
  }, [isRenaming]);

  return (
    <div data-folder-node="true" className="mb-2">
      <div
        data-folder-row="true"
        className={`group/folder group/asset-folder flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 py-2.5 px-3 rounded-xl border transition-all duration-200 shadow-sm ${
          dragOverFolderId === folder.id
            ? "bg-amber-500/[0.08] border-amber-500/30 ring-1 ring-amber-500/20"
            : isExpanded
            ? "bg-zinc-100/50 dark:bg-white/[0.03] border-zinc-200/60 dark:border-white/[0.06] hover:bg-zinc-100/80 dark:hover:bg-white/[0.05]"
            : "bg-zinc-50/50 dark:bg-white/[0.01] border-zinc-200/40 dark:border-white/[0.03] hover:bg-zinc-100/60 dark:hover:bg-white/[0.04]"
        }`}
        style={{ marginLeft: depth * 16 }}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-folder-id", folder.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOverFolder(folder.id);
        }}
        onDragLeave={() => onDragOverFolder(null)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverFolder(null);
          onDropOnFolder(folder.id, e);
        }}
        onClick={() => { if (!isRenaming) onToggle(folder.id); }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            data-folder-chevron="true"
            type="button"
            className="flex size-5 shrink-0 items-center justify-center rounded-md hover:bg-zinc-200/50 dark:hover:bg-white/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); onToggle(folder.id); }}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${
                hasExpandable
                  ? isExpanded ? "rotate-90 text-zinc-800 dark:text-white/90" : "text-zinc-400 dark:text-white/40"
                  : "text-transparent"
              }`}
            />
          </button>
          <div className="shrink-0 transition-transform group-hover/folder:scale-105 duration-200">
            <FolderIcon hasContent={folder.material_count > 0} />
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            {isRenaming ? (
              <input
                ref={renameRef}
                value={renameName}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onRenameSubmit(); }
                  if (e.key === "Escape") onRenameCancel();
                }}
                onBlur={() => { if (renameName.trim()) onRenameSubmit(); else onRenameCancel(); }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 w-full bg-transparent text-sm font-semibold text-zinc-800 dark:text-white/90 placeholder:text-zinc-400 dark:placeholder:text-white/30 outline-none border-none p-0"
              />
            ) : (
              <button data-folder-name="true" type="button" className="flex min-w-0 max-w-full items-center text-left" onClick={(e) => e.stopPropagation()}>
                <span className={`truncate text-sm leading-snug font-semibold transition-colors duration-150 ${folder.material_count > 0 ? "text-zinc-800 dark:text-white/90" : "text-zinc-500 dark:text-white/60"}`}>
                  {folder.name}
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {folder.material_count > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200/50 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 transition-colors">
              {folder.material_count}
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center justify-center size-6 cursor-pointer rounded-lg opacity-0 hover:bg-zinc-200/50 dark:hover:bg-white/10 hover:text-zinc-600 dark:hover:text-white/60 group-hover/folder:opacity-100 transition-all duration-150"
            onClick={(e) => { e.stopPropagation(); onDotsClick(folder, e); }}
          >
            <DotsIcon />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div data-folder-content="true" className="relative mt-0.5 space-y-0.5" style={{ marginLeft: depth * 24 + 17, paddingLeft: 11 }}>
          <span className="absolute left-0 top-0 bottom-0 w-px bg-zinc-200 dark:bg-white/10" aria-hidden="true" />
          {/* Child folders */}
          {hasChildren && folder.children!.map((child) => (
            <FolderTreeRow
              key={child.id}
              folder={child}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              onDotsClick={onDotsClick}
              renamingFolderId={renamingFolderId}
              renameName={renameName}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              folderMaterials={folderMaterials}
              loadingFolderMats={loadingFolderMats}
              onMatMouseEnter={onMatMouseEnter}
              onMatMouseLeave={onMatMouseLeave}
              onMatDotsClick={onMatDotsClick}
              renamingMatId={renamingMatId}
              renameMatName={renameMatName}
              onMatRenameChange={onMatRenameChange}
              onMatRenameSubmit={onMatRenameSubmit}
              onMatRenameCancel={onMatRenameCancel}
              dragOverFolderId={dragOverFolderId}
              onDragOverFolder={onDragOverFolder}
              onDropOnFolder={onDropOnFolder}
            />
          ))}
          {/* Inline materials — Modern 3-Column Image Grid Gallery */}
          <div style={{ paddingLeft: 8, paddingRight: 8 }} className="pt-2 pb-3">
            {isLoadingMats ? (
              <div className="flex items-center gap-2 py-2 pl-1">
                <Loader2 size={12} className="text-white/30 animate-spin" />
                <span className="text-xs text-white/30">{t("loading")}</span>
              </div>
            ) : mats && mats.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {mats.map((mat) => (
                  <MaterialGridCard
                    key={mat.id}
                    mat={mat}
                    onMouseEnter={onMatMouseEnter}
                    onMouseLeave={onMatMouseLeave}
                    onDotsClick={onMatDotsClick}
                    isRenaming={renamingMatId === mat.id}
                    renameName={renamingMatId === mat.id ? renameMatName : undefined}
                    onRenameChange={onMatRenameChange}
                    onRenameSubmit={onMatRenameSubmit}
                    onRenameCancel={onMatRenameCancel}
                  />
                ))}
              </div>
            ) : !hasChildren && !isLoadingMats ? (
              <div className="truncate py-2 pl-1 text-sm font-normal leading-none text-white/30">{t("emptyFolder")}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function MaterialPanel({ open, onClose }: MaterialPanelProps) {
  const t = useTranslations("material");
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderMenu, setFolderMenu] = useState<{ folder: FolderNode; x: number; y: number } | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [movingFolder, setMovingFolder] = useState<FolderNode | null>(null);
  const [folderMaterials, setFolderMaterials] = useState<Record<string, MaterialItem[]>>({});
  const [loadingFolderMats, setLoadingFolderMats] = useState<Set<string>>(new Set());
  const [matMenu, setMatMenu] = useState<{ mat: MaterialItem; x: number; y: number } | null>(null);
  const matMenuRef = useRef<HTMLDivElement>(null);
  const [renamingMatId, setRenamingMatId] = useState<string | null>(null);
  const [renameMatName, setRenameMatName] = useState("");
  const [movingMat, setMovingMat] = useState<MaterialItem | null>(null);
  const [hoveredMat, setHoveredMat] = useState<{ mat: MaterialItem; x: number; y: number } | null>(null);
  const [complianceCache, setComplianceCache] = useState<Record<string, string>>({});
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragDataRef = useRef<{ type: "material" | "folder"; id: string } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const resizingRef = useRef(false);

  const fetchFolderMats = useCallback(async (folderId: string) => {
    if (loadingFolderMats.has(folderId)) return;
    setLoadingFolderMats((prev) => new Set(prev).add(folderId));
    try {
      const params = new URLSearchParams({ folder_id: folderId, limit: "200" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/materials?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFolderMaterials((prev) => ({ ...prev, [folderId]: data.materials ?? [] }));
      }
    } catch {}
    setLoadingFolderMats((prev) => { const n = new Set(prev); n.delete(folderId); return n; });
  }, [search, loadingFolderMats]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else {
        next.add(id);
        fetchFolderMats(id);
      }
      return next;
    });
  }, [fetchFolderMats]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/materials/folders");
      if (res.ok) {
        const data = await res.json();
        const flat: FolderNode[] = data.folders ?? [];
        setFolders(flat);
        setFolderTree(buildFolderTree(flat));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) fetchFolders();
  }, [open, fetchFolders]);

  // Re-fetch materials for all expanded folders when search changes
  useEffect(() => {
    if (!open) return;
    expanded.forEach((folderId) => fetchFolderMats(folderId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (creatingFolder) { setCreatingFolder(false); setNewFolderName(""); }
        else onClose();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close if click is outside the panel, not on the library toggle button, and not inside any dialogs/menus/popovers
      if (!target.closest("[data-library-panel]") && 
          !target.closest("[data-library-toggle]") &&
          !target.closest('[data-testid="save-to-material-dialog"]') &&
          !folderMenuRef.current?.contains(target) &&
          !matMenuRef.current?.contains(target) &&
          !popoverRef.current?.contains(target) &&
          !target.closest('[data-testid="folder-move-picker"]') &&
          !target.closest('[data-testid="material-move-picker"]')) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside, true);
    };
  }, [open, onClose, creatingFolder, folderMenuRef, matMenuRef]);

  // Listen for material-saved events from SaveToMaterialDialog to refresh in real-time
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const folderId = (e as CustomEvent).detail?.folderId;
      if (folderId && expanded.has(folderId)) {
        fetchFolderMats(folderId);
      }
      fetchFolders();
    };
    window.addEventListener("material-saved", handler);
    return () => window.removeEventListener("material-saved", handler);
  }, [open, expanded, fetchFolderMats, fetchFolders]);

  // Auto-focus new folder input
  useEffect(() => {
    if (creatingFolder) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50);
    }
  }, [creatingFolder]);

  // Resize handle
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.min(Math.max(e.clientX - 16, 260), 600);
      setPanelWidth(w);
    };
    const onUp = () => { resizingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Close folder menu on click outside
  useEffect(() => {
    if (!folderMenu) return;
    const handler = (e: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setFolderMenu(null);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [folderMenu]);

  // Close material menu on click outside
  useEffect(() => {
    if (!matMenu) return;
    const handler = (e: MouseEvent) => {
      if (matMenuRef.current && !matMenuRef.current.contains(e.target as Node)) {
        setMatMenu(null);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [matMenu]);

  // Rename folder
  const handleRenameFolder = useCallback(async () => {
    if (!renamingFolderId || !renameFolderName.trim()) {
      setRenamingFolderId(null);
      setRenameFolderName("");
      return;
    }
    try {
      const res = await fetch(`/api/materials/folders/${renamingFolderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameFolderName.trim() }),
      });
      if (res.ok) {
        await fetchFolders();
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Rename folder failed:", err);
    }
    setRenamingFolderId(null);
    setRenameFolderName("");
  }, [renamingFolderId, renameFolderName, fetchFolders]);

  // Delete folder
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    try {
      const res = await fetch(`/api/materials/folders/${folderId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchFolders();
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Delete folder failed:", err);
    }
  }, [fetchFolders]);

  // Duplicate folder
  const handleDuplicateFolder = useCallback(async (folder: FolderNode) => {
    try {
      const res = await fetch("/api/materials/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${folder.name} ${t("copySuffix")}`, parent_id: folder.parent_id ?? null }),
      });
      if (res.ok) {
        await fetchFolders();
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Duplicate folder failed:", err);
    }
  }, [fetchFolders, t]);

  // Move folder
  const handleMoveFolder = useCallback(async (folderId: string, newParentId: string | null) => {
    try {
      const res = await fetch(`/api/materials/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: newParentId }),
      });
      if (res.ok) {
        setMovingFolder(null);
        await fetchFolders();
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Move folder failed:", err);
    }
  }, [fetchFolders]);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/materials/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parent_id: null,
        }),
      });
      if (res.ok) {
        setCreatingFolder(false);
        setNewFolderName("");
        await fetchFolders();
      }
    } catch (err) {
      console.error("Create folder failed:", err);
    }
  }, [newFolderName, fetchFolders]);

  // Upload handler
  const handleUpload = useCallback(async (folderId: string) => {
    const targetFolderId = folderId;
    if (!targetFolderId) return;
    const file = await openFilePicker("media");
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined });

      const isVideo = "videoUrl" in result;
      const isAudio = "audioUrl" in result;
      const type = isAudio ? "AUDIO" : isVideo ? "VIDEO" : "IMAGE";
      const storageKey = isAudio
        ? (result as any).audioUrl
        : isVideo
        ? (result as any).videoUrl
        : (result as any).url;
      const thumbnailUrl = isAudio
        ? undefined
        : isVideo
        ? (result as any).thumbnailUrl
        : (result as any).thumbnailUrl ?? (result as any).url;

      const baseName = file.name.replace(/\.[^.]+$/, "");

      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "OTHERS",
          folder_id: targetFolderId,
          name: baseName,
          type,
          storage_key: storageKey,
          storage_bucket: "local",
          mime_type: file.type,
          file_size_bytes: file.size,
          width: (result as any).width,
          height: (result as any).height,
          duration_s: isAudio ? (result as any).audioDuration : undefined,
          thumbnail_url: thumbnailUrl,
        }),
      });

      if (res.ok) {
        invalidateMaterialCache();
        await fetchFolderMats(targetFolderId);
        await fetchFolders();
      }
    } catch (err) {
      console.error("Material upload failed:", err);
    }
    setUploading(false);
  }, [fetchFolderMats, fetchFolders]);

  // Delete material handler
  const handleDelete = useCallback(async (id: string, folderId?: string | null) => {
    setDeleteId(id);
    try {
      const res = await fetch(`/api/materials/${id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateMaterialCache();
        setFolderMaterials((prev) => {
          const updated = { ...prev };
          for (const fid of Object.keys(updated)) {
            updated[fid] = updated[fid].filter((m) => m.id !== id);
          }
          return updated;
        });
        fetchFolders();
      }
    } catch {}
    setDeleteId(null);
  }, [fetchFolders]);

  // Rename material
  const handleRenameMaterial = useCallback(async () => {
    if (!renamingMatId || !renameMatName.trim()) {
      setRenamingMatId(null);
      setRenameMatName("");
      return;
    }
    try {
      const res = await fetch(`/api/materials/${renamingMatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameMatName.trim() }),
      });
      if (res.ok) {
        // Update local state immediately
        setFolderMaterials((prev) => {
          const updated = { ...prev };
          for (const fid of Object.keys(updated)) {
            updated[fid] = updated[fid].map((m) =>
              m.id === renamingMatId ? { ...m, name: renameMatName.trim() } : m
            );
          }
          return updated;
        });
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Rename material failed:", err);
    }
    setRenamingMatId(null);
    setRenameMatName("");
  }, [renamingMatId, renameMatName]);

  // Move material to another folder
  const handleMoveMaterial = useCallback(async (matId: string, newFolderId: string | null) => {
    try {
      const res = await fetch(`/api/materials/${matId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: newFolderId }),
      });
      if (res.ok) {
        setMovingMat(null);
        // Refresh affected folders
        for (const fid of expanded) {
          fetchFolderMats(fid);
        }
        fetchFolders();
        invalidateMaterialCache();
      }
    } catch (err) {
      console.error("Move material failed:", err);
    }
  }, [expanded, fetchFolderMats, fetchFolders]);

  // Handle drop on a folder (drag-and-drop)
  const handleDropOnFolder = useCallback((targetFolderId: string, dt: DataTransfer | null) => {
    const matId = dt?.getData("application/x-material-id");
    const folderId = dt?.getData("application/x-folder-id");
    if (matId) {
      handleMoveMaterial(matId, targetFolderId);
    } else if (folderId && folderId !== targetFolderId) {
      handleMoveFolder(folderId, targetFolderId);
    }
  }, [handleMoveMaterial, handleMoveFolder]);

  // Fetch compliance status for a material URL (lazy, cached)
  const fetchComplianceStatus = useCallback(async (url: string) => {
    if (complianceCache[url]) return;
    try {
      const res = await fetch(`/api/assets/compliance/status?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        setComplianceCache((prev) => ({ ...prev, ...data.results }));
      }
    } catch {}
  }, [complianceCache]);

  // Hover handlers for material popover
  const handleMatMouseEnter = useCallback((mat: MaterialItem, e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredMat({ mat, x: rect.right + 8, y: rect.top });
      const matUrl = mat.thumbnail_url || mat.storage_key;
      if (matUrl && mat.type !== "AUDIO") fetchComplianceStatus(matUrl);
    }, 350);
  }, [fetchComplianceStatus]);

  const handleMatMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setTimeout(() => {
      if (!popoverRef.current?.matches(":hover")) setHoveredMat(null);
    }, 100);
  }, []);

  // Apply material to canvas as a new node
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const { screenToFlowPosition } = useReactFlow();
  const handleApplyToCanvas = useCallback((mat: MaterialItem) => {
    const flow = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    // Scale to fit within max 480px while preserving aspect ratio
    const MAX_DIM = 480;
    const fitSize = (origW: number, origH: number) => {
      if (origW <= 0 || origH <= 0) return { w: 280, h: 280 };
      const scale = Math.min(MAX_DIM / origW, MAX_DIM / origH, 1);
      return { w: Math.round(origW * scale), h: Math.round(origH * scale) };
    };

    const placeNode = (type: "source-image" | "video-gen" | "source-audio", data: Record<string, any>, w: number, h: number) => {
      addNodeWithData(type, flow.x - w / 2, flow.y - h / 2, { ...data, label: mat.name }, { w, h });
    };

    if (mat.type === "IMAGE") {
      const imgUrl = mat.thumbnail_url || mat.storage_key;
      if (mat.width && mat.height) {
        const { w, h } = fitSize(mat.width, mat.height);
        placeNode("source-image", { imageUrl: mat.storage_key, originalUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, w, h);
      } else {
        // Probe real dimensions from image
        const img = new Image();
        img.onload = () => {
          const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
          placeNode("source-image", { imageUrl: mat.storage_key, originalUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, w, h);
        };
        img.onerror = () => {
          placeNode("source-image", { imageUrl: mat.storage_key, originalUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, 280, 280);
        };
        img.src = imgUrl;
      }
    } else if (mat.type === "VIDEO") {
      const vidUrl = mat.thumbnail_url || mat.storage_key;
      if (mat.width && mat.height) {
        const { w, h } = fitSize(mat.width, mat.height);
        placeNode("video-gen", { videoUrl: mat.storage_key, originalVideoUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, w, h);
      } else {
        // Probe real dimensions from video
        const vid = document.createElement("video");
        vid.preload = "metadata";
        vid.onloadedmetadata = () => {
          const { w, h } = fitSize(vid.videoWidth, vid.videoHeight);
          placeNode("video-gen", { videoUrl: mat.storage_key, originalVideoUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, w, h);
        };
        vid.onerror = () => {
          placeNode("video-gen", { videoUrl: mat.storage_key, originalVideoUrl: mat.storage_key, thumbnailUrl: mat.thumbnail_url }, 480, 270);
        };
        vid.src = vidUrl;
      }
    } else if (mat.type === "AUDIO") {
      placeNode("source-audio", { audioUrl: mat.storage_key }, 320, 260);
    }
    setHoveredMat(null);
  }, [addNodeWithData, screenToFlowPosition]);

  if (!open || typeof document === "undefined") return null;

  const panelPortal = createPortal(
    <div
      data-library-panel="true"
      className="fixed left-4 top-16 z-[60] flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/[0.10] bg-white/90 dark:bg-[rgba(22,22,22,0.82)] pl-3 pr-4 py-3 shadow-xl backdrop-blur-[40px] transition-[bottom] duration-200 text-zinc-800 dark:text-white"
      style={{ width: panelWidth, bottom: 60, opacity: 1 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 z-50 flex w-3 cursor-col-resize items-center justify-center"
        onMouseDown={() => { resizingRef.current = true; }}
      >
        <div className="relative right-0.5 flex flex-col gap-[3px] transition-opacity duration-150 opacity-0 hover:opacity-100">
          <span className="block h-[3px] w-[3px] rounded-full bg-zinc-400 dark:bg-white/40" />
          <span className="block h-[3px] w-[3px] rounded-full bg-zinc-400 dark:bg-white/40" />
          <span className="block h-[3px] w-[3px] rounded-full bg-zinc-400 dark:bg-white/40" />
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex w-full items-center gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-md px-2 py-0.5 text-zinc-500 dark:text-white/60 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10"
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xl font-semibold leading-7 text-zinc-800 dark:text-white/90"
          style={{ letterSpacing: "-0.6px" }}
        >
          {t("title")}
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center gap-2.5 px-2 py-0.5 transition-colors rounded-sm bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-white/88 hover:bg-zinc-200 dark:hover:bg-white/[0.14]"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="flex w-full flex-col items-start gap-2 self-stretch">
        <div className="relative flex items-center w-full text-zinc-400 dark:text-zinc-500">
          <span className="absolute left-3">
            <Search size={16} style={{ color: "currentColor" }} />
          </span>
          <input
            className="flex w-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-transparent px-3 transition-colors text-sm text-zinc-800 dark:text-white/90 h-8 min-w-[48px] self-stretch overflow-hidden text-ellipsis rounded-full py-1 pl-[34px] pr-3 font-normal leading-5 shadow-none placeholder:text-zinc-400 dark:placeholder:text-[rgba(255,255,255,0.30)] focus-visible:outline-none focus-visible:ring-0"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Content: always folder tree with inline materials ── */}
      <div data-library-content="true" className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-3 p-3.5 pt-1.5">
          {/* New folder inline input */}
          {creatingFolder && (
            <div className="flex items-center gap-2 rounded-md py-1.5 px-2 bg-white/[0.06]">
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
                placeholder={t("folderName")}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white/90 placeholder:text-white/30 outline-none border-none"
              />
            </div>
          )}

          {folderTree.length === 0 && !creatingFolder ? (
            <div className="flex flex-col items-center justify-center h-60 text-zinc-500">
              <Upload size={36} className="mb-3 opacity-20" />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{t("noFolders")}</p>
              <p className="text-xs mt-1 mb-4" style={{ color: "rgba(255,255,255,0.25)" }}>{t("noFoldersHint")}</p>
              <button
                onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 text-white/80 hover:bg-white/[0.14] transition-colors"
              >
                <Plus size={14} />
                {t("newFolder")}
              </button>
            </div>
          ) : (
            folderTree.map((f) => (
              <FolderTreeRow
                key={f.id}
                folder={f}
                depth={0}
                expanded={expanded}
                onToggle={toggleExpanded}
                onDotsClick={(folder, e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setFolderMenu({ folder, x: rect.right, y: rect.top });
                }}
                renamingFolderId={renamingFolderId}
                renameName={renameFolderName}
                onRenameChange={setRenameFolderName}
                onRenameSubmit={handleRenameFolder}
                onRenameCancel={() => { setRenamingFolderId(null); setRenameFolderName(""); }}
                folderMaterials={folderMaterials}
                loadingFolderMats={loadingFolderMats}
                onMatMouseEnter={handleMatMouseEnter}
                onMatMouseLeave={handleMatMouseLeave}
                onMatDotsClick={(mat, e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMatMenu({ mat, x: rect.right, y: rect.top });
                }}
                renamingMatId={renamingMatId}
                renameMatName={renameMatName}
                onMatRenameChange={setRenameMatName}
                onMatRenameSubmit={handleRenameMaterial}
                onMatRenameCancel={() => { setRenamingMatId(null); setRenameMatName(""); }}
                dragOverFolderId={dragOverFolderId}
                onDragOverFolder={setDragOverFolderId}
                onDropOnFolder={(folderId, e) => {
                  handleDropOnFolder(folderId, e.dataTransfer);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );

  /* ── Folder context menu (separate portal to avoid backdrop-blur containing block) ── */
  const folderMenuPortal = folderMenu && createPortal(
    <div
      ref={folderMenuRef}
      className="fixed z-[9999] min-w-[180px] rounded-xl border border-white/10 bg-[rgba(38,38,38,0.96)] p-1 shadow-xl backdrop-blur-[28px]"
      style={{ left: folderMenu.x + 4, top: folderMenu.y }}
    >
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          setCreatingFolder(true);
          setNewFolderName("");
          setFolderMenu(null);
        }}
      >
        <Plus size={14} className="text-white/60" />
        {t("newFolder")}
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          handleUpload(folderMenu.folder.id);
          setFolderMenu(null);
        }}
      >
        <Upload size={14} className="text-white/60" />
        {t("uploadMaterial")}
      </button>
      <div className="my-1 h-px bg-white/10" />
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          setRenamingFolderId(folderMenu.folder.id);
          setRenameFolderName(folderMenu.folder.name);
          setFolderMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4" /><path d="M13.5 6.5l4 4" /></svg>
        {t("rename")}
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          setMovingFolder(folderMenu.folder);
          setFolderMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        {t("moveTo")}
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          handleDuplicateFolder(folderMenu.folder);
          setFolderMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        {t("duplicate")}
      </button>
      <div className="my-1 h-px bg-white/10" />
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        onClick={() => {
          handleDeleteFolder(folderMenu.folder.id);
          setFolderMenu(null);
        }}
      >
        <Trash2 size={14} className="text-red-400" />
        {t("delete")}
      </button>
    </div>,
    document.body,
  );

  /* ── Move-to picker (separate portal) ── */
  const movePickerPortal = movingFolder && createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onClick={() => setMovingFolder(null)}>
      <div
        data-testid="folder-move-picker"
        className="w-72 max-h-80 rounded-2xl border border-white/10 bg-[rgba(30,30,30,0.96)] p-3 shadow-xl backdrop-blur-[28px] flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white/90 px-1">{t("moveTitle", { name: movingFolder.name })}</p>
        <div className="flex-1 overflow-y-auto space-y-0.5 max-h-52">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
            onClick={() => handleMoveFolder(movingFolder.id, null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            {t("rootDirectory")}
          </button>
          {folders.filter((f) => f.id !== movingFolder.id).map((f) => (
            <button
              key={f.id}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                f.id === movingFolder.parent_id ? "text-white/30 cursor-default" : "text-white/80 hover:bg-white/10"
              }`}
              disabled={f.id === movingFolder.parent_id}
              onClick={() => handleMoveFolder(movingFolder.id, f.id)}
            >
              <div className="shrink-0"><FolderIcon hasContent={f.material_count > 0} /></div>
              {f.name}
            </button>
          ))}
        </div>
        <button
          className="mt-1 w-full rounded-lg py-2 text-sm text-white/60 hover:bg-white/10 transition-colors"
          onClick={() => setMovingFolder(null)}
        >
          {t("cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );

  /* ── Material hover popover (separate portal) ── */
  const matPopoverPortal = hoveredMat && createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] w-72 rounded-2xl border border-white/10 bg-[rgba(30,30,30,0.96)] shadow-xl backdrop-blur-[28px] overflow-hidden"
      style={{
        left: Math.min(hoveredMat.x, window.innerWidth - 310),
        top: Math.max(8, Math.min(hoveredMat.y, window.innerHeight - 380)),
      }}
      onMouseLeave={() => setHoveredMat(null)}
    >
      {/* Compliance badge */}
      {hoveredMat.mat.type !== "AUDIO" && (() => {
        const matUrl = hoveredMat.mat.thumbnail_url || hoveredMat.mat.storage_key;
        const status = matUrl ? complianceCache[matUrl] : undefined;
        return (
          <div className="flex items-center justify-center gap-1.5 py-2">
            {status === "ACTIVE" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-400"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="text-xs text-emerald-400 font-medium">{t("approved")}</span>
              </>
            ) : status === "REJECTED" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-red-400"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                <span className="text-xs text-red-400 font-medium">{t("rejected")}</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white/40"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                <span className="text-xs text-white/40 font-medium">{t("notReviewed")}</span>
              </>
            )}
          </div>
        );
      })()}

      {/* Thumbnail */}
      <div className="w-full aspect-video bg-black/30 flex items-center justify-center overflow-hidden">
        {hoveredMat.mat.type === "AUDIO" ? (
          <Music size={32} className="text-pink-400 opacity-60" />
        ) : hoveredMat.mat.thumbnail_url && isVideoUrl(hoveredMat.mat.thumbnail_url) ? (
          <video
            src={hoveredMat.mat.thumbnail_url}
            className="w-full h-full object-contain"
            muted
            autoPlay
            loop
            playsInline
          />
        ) : hoveredMat.mat.thumbnail_url ? (
          <img
            src={hoveredMat.mat.thumbnail_url}
            alt={hoveredMat.mat.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <ImageIcon size={32} className="text-zinc-600" />
        )}
      </div>

      {/* Info */}
      <div className="px-3.5 pt-2.5 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-white/90 truncate flex-1">{hoveredMat.mat.name}</p>
          {hoveredMat.mat.type !== "AUDIO" && (
            <button
              className="shrink-0 p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
              title={t("preCheck")}
              onClick={() => {
                const matUrl = hoveredMat.mat.thumbnail_url || hoveredMat.mat.storage_key;
                if (matUrl) {
                  const isVid = hoveredMat.mat.type === "VIDEO";
                  fetch("/api/assets/compliance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(isVid ? { video_url: matUrl } : { image_url: matUrl }),
                  }).then(async (r) => {
                    if (r.ok) {
                      setComplianceCache((prev) => ({ ...prev, [matUrl]: "ACTIVE" }));
                    } else {
                      const err = await r.json().catch(() => ({}));
                      if (err.error === "COMPLIANCE_REJECTED") {
                        setComplianceCache((prev) => ({ ...prev, [matUrl]: "REJECTED" }));
                      }
                    }
                  });
                  setComplianceCache((prev) => ({ ...prev, [matUrl]: "CHECKING" }));
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </button>
          )}
        </div>
        <p className="text-[11px] text-white/40 mt-0.5">
          {t("createdAt", { date: new Date(hoveredMat.mat.created_at).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }), time: new Date(hoveredMat.mat.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
        </p>
      </div>

      {/* Apply to canvas */}
      <div className="px-3 pb-3 pt-1.5">
        <button
          className="w-full py-2 rounded-xl text-sm font-medium bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition-colors cursor-pointer"
          onClick={() => {
            handleApplyToCanvas(hoveredMat.mat);
            setHoveredMat(null);
          }}
        >
          {t("applyToCanvas")}
        </button>
      </div>
    </div>,
    document.body,
  );

  /* ── Material context menu (separate portal) ── */
  const matMenuPortal = matMenu && createPortal(
    <div
      ref={matMenuRef}
      className="fixed z-[9999] min-w-[160px] rounded-xl border border-white/10 bg-[rgba(38,38,38,0.96)] p-1 shadow-xl backdrop-blur-[28px]"
      style={{ left: matMenu.x + 4, top: matMenu.y }}
    >
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          handleApplyToCanvas(matMenu.mat);
          setMatMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></svg>
        {t("applyToCanvas")}
      </button>
      <div className="my-1 h-px bg-white/10" />
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          setRenamingMatId(matMenu.mat.id);
          setRenameMatName(matMenu.mat.name);
          setMatMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4" /><path d="M13.5 6.5l4 4" /></svg>
        {t("rename")}
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/90 hover:bg-white/10 transition-colors"
        onClick={() => {
          setMovingMat(matMenu.mat);
          setMatMenu(null);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        {t("moveTo")}
      </button>
      <div className="my-1 h-px bg-white/10" />
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        onClick={() => {
          handleDelete(matMenu.mat.id, matMenu.mat.folder_id);
          setMatMenu(null);
        }}
      >
        <Trash2 size={14} className="text-red-400" />
        {t("delete")}
      </button>
    </div>,
    document.body,
  );

  /* ── Material move-to picker (separate portal) ── */
  const matMovePickerPortal = movingMat && createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onClick={() => setMovingMat(null)}>
      <div
        data-testid="material-move-picker"
        className="w-72 max-h-80 rounded-2xl border border-white/10 bg-[rgba(30,30,30,0.96)] p-3 shadow-xl backdrop-blur-[28px] flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white/90 px-1">{t("moveTitle", { name: movingMat.name })}</p>
        <div className="flex-1 overflow-y-auto space-y-0.5 max-h-52">
          {folders.map((f) => (
            <button
              key={f.id}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                f.id === movingMat.folder_id ? "text-white/30 cursor-default" : "text-white/80 hover:bg-white/10"
              }`}
              disabled={f.id === movingMat.folder_id}
              onClick={() => handleMoveMaterial(movingMat.id, f.id)}
            >
              <div className="shrink-0"><FolderIcon hasContent={f.material_count > 0} /></div>
              {f.name}
            </button>
          ))}
        </div>
        <button
          className="mt-1 w-full rounded-lg py-2 text-sm text-white/60 hover:bg-white/10 transition-colors"
          onClick={() => setMovingMat(null)}
        >
          {t("cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );

  return <>{panelPortal}{folderMenuPortal}{movePickerPortal}{matPopoverPortal}{matMenuPortal}{matMovePickerPortal}</>;
}
