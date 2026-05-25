"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, FolderOpen, Loader2, Image as ImageIcon, Music } from "lucide-react";

/* ─── Types ─────────────────────────────────────────── */

interface MaterialItem {
  id: string;
  name: string;
  type: "IMAGE" | "VIDEO" | "AUDIO";
  storage_key: string;
  thumbnail_url?: string;
}

interface MaterialFolder {
  id: string;
  parent_id?: string | null;
  name: string;
  material_count: number;
}

type FolderNode = MaterialFolder & { children: FolderNode[] };

/* ─── Folder Icon (matches StoryboardPanel / MaterialPanel) ── */

function PickerFolderIcon({ hasContent = false }: { hasContent?: boolean }) {
  const uid = useRef(`pf-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <div className="group/asset-folder relative w-6 h-6 shrink-0 select-none">
      <svg className="absolute left-0 w-6" viewBox="0 0 24 16" fill="none" style={{ top: 3, height: "15.25px" }}>
        <defs>
          <linearGradient id={`${uid}-back`} x1="12" y1="0" x2="12" y2="5.25" gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#7a9900" /><stop offset="1" stopColor="#4d6600" />
          </linearGradient>
        </defs>
        <path d="M1.90714 0C0.853857 0 0 0.853857 0 1.90714V15.25H24V3.83571C24 2.77059 23.1366 1.90714 22.0714 1.90714H11.1L10.4306 1.86058C10.0631 1.83501 9.71068 1.70474 9.4149 1.48517L8.09689 0.506737C7.65362 0.177671 7.11621 0 6.56415 0H1.90714Z" fill={`url(#${uid}-back)`} />
      </svg>
      {hasContent && (
        <div className="absolute z-[1] left-1 bottom-0 w-5 h-5 transition-transform duration-200 ease-out -rotate-[10deg] -translate-y-[8px] group-hover/asset-folder:-translate-y-[12px]" style={{ transformOrigin: "right bottom" }}>
          <svg className="h-full w-full" viewBox="-1 -0.5 22 17" fill="none">
            <defs>
              <linearGradient id={`${uid}-ib`} x1="10" y1="0" x2="10" y2="5" gradientUnits="userSpaceOnUse"><stop stopColor="#8fb300" /><stop offset="1" stopColor="#5c7a00" /></linearGradient>
              <radialGradient id={`${uid}-if`} cx="0.5" cy="0.5" r="0.6" gradientUnits="objectBoundingBox"><stop stopColor="#d4f04c" /><stop offset="1" stopColor="#8fb300" /></radialGradient>
            </defs>
            <path d="M1.5 0C.67 0 0 .67 0 1.5V14.5c0 .83.67 1.5 1.5 1.5h17c.83 0 1.5-.67 1.5-1.5V3.5c0-.83-.67-1.5-1.5-1.5H9.2l-.5-.04a2.4 2.4 0 0 1-.9-.46L6.7.6A1.8 1.8 0 0 0 5.6.1H1.5Z" fill={`url(#${uid}-ib)`} />
            <rect y="4" width="20" height="12" rx="1.5" fill={`url(#${uid}-if)`} />
          </svg>
        </div>
      )}
      <div className="absolute z-[2] bottom-0 left-0 w-6 rounded-[2px] overflow-hidden transition-[transform] duration-200 ease-out [transform:perspective(60px)_rotateX(0deg)] group-hover/asset-folder:[transform:perspective(60px)_rotateX(-30deg)]" style={{ height: 16, transformOrigin: "center bottom", boxShadow: "rgba(17,26,0,0.07) 0px -0.104px 1.166px 0px, rgba(17,26,0,0.25) 0px 0.207px 0.207px 0px, rgba(204,255,0,0.15) 0px 0.104px 0.207px 0px inset" }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 16" fill="none">
          <defs>
            <radialGradient id={`${uid}-fr`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 8) scale(12 16.41)"><stop stopColor="#CCFF00" /><stop offset="1" stopColor="#6b8c00" /></radialGradient>
          </defs>
          <rect width="24" height="16" rx="2" fill={`url(#${uid}-fr)`} />
        </svg>
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────── */

interface MaterialPickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  emptyText?: string;
  filterType?: "IMAGE" | "VIDEO" | "AUDIO";
  onSelect: (url: string) => void;
}

export function MaterialPickerModal({ open, onClose, title, emptyText, filterType = "IMAGE", onSelect }: MaterialPickerModalProps) {
  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderMats, setFolderMats] = useState<Record<string, MaterialItem[]>>({});
  const [folderLoading, setFolderLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch folders on open
  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      try {
        const res = await fetch("/api/materials/folders");
        if (res.ok) {
          const data = await res.json();
          setFolders(data.folders ?? []);
        }
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, [open, loaded]);

  // Fetch folder materials lazily
  const fetchFolderMats = useCallback(async (folderId: string) => {
    if (folderMats[folderId]) return;
    setFolderLoading(true);
    try {
      const res = await fetch(`/api/materials?folder_id=${folderId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const mats = (data.materials ?? []).filter((m: MaterialItem) => m.type === filterType);
        setFolderMats((prev) => ({ ...prev, [folderId]: mats }));
      }
    } catch { /* ignore */ }
    setFolderLoading(false);
  }, [folderMats, filterType]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) { next.delete(folderId); } else { next.add(folderId); fetchFolderMats(folderId); }
      return next;
    });
  }, [fetchFolderMats]);

  const handleSelect = useCallback((mat: MaterialItem) => {
    const url = mat.storage_key.startsWith("http") || mat.storage_key.startsWith("/")
      ? mat.storage_key
      : `/api/files/${mat.storage_key}`;
    onSelect(url);
  }, [onSelect]);

  if (!open || typeof document === "undefined") return null;

  // Build folder tree
  const folderMap = new Map<string, FolderNode>();
  for (const f of folders) folderMap.set(f.id, { ...f, children: [] });
  const rootFolders: FolderNode[] = [];
  for (const f of folderMap.values()) {
    if (f.parent_id && folderMap.has(f.parent_id)) folderMap.get(f.parent_id)!.children.push(f);
    else rootFolders.push(f);
  }

  const renderMatRow = (mat: MaterialItem) => {
    const thumbUrl = mat.thumbnail_url || (mat.storage_key.startsWith("http") ? mat.storage_key : `/api/files/${mat.storage_key}`);
    return (
      <button
        key={mat.id}
        onClick={() => handleSelect(mat)}
        className="group/mat flex w-full min-w-0 items-center gap-2.5 p-1 rounded-sm hover:bg-white/10 transition-colors cursor-pointer"
      >
        <div className="flex size-6 shrink-0 items-center justify-center">
          <div className="flex size-6 items-center justify-center aspect-square rounded-[4px] border border-white/10 bg-white/5 shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.16),0_4px_8px_0_rgba(0,0,0,0.16)] overflow-hidden relative">
            {mat.type === "AUDIO" ? (
              <Music size={12} className="text-pink-400 opacity-60" />
            ) : mat.thumbnail_url ? (
              <img src={thumbUrl} alt={mat.name} className="block size-6 object-cover" loading="lazy" />
            ) : (
              <ImageIcon size={12} className="text-zinc-600" />
            )}
          </div>
        </div>
        <span className="min-w-0 flex-1 truncate text-sm leading-snug font-normal text-[rgb(169,169,169)]">{mat.name}</span>
      </button>
    );
  };

  const renderFolder = (folder: FolderNode, depth: number): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const hasChildren = folder.children.length > 0;
    const hasExpandable = hasChildren || folder.material_count > 0;
    const mats = folderMats[folder.id] ?? [];
    const isLoadingMats = folderLoading && !folderMats[folder.id] && isExpanded;
    return (
      <div key={folder.id}>
        <div
          className="group/asset-folder flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm py-1 pr-1 transition-colors hover:bg-white/10"
          style={{ paddingLeft: depth * 24 + 6 }}
          onClick={() => toggleFolder(folder.id)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center">
              <ChevronDown
                size={16}
                className={`-ml-0.5 transition-transform ${
                  hasExpandable
                    ? isExpanded ? "rotate-0 text-white/90" : "-rotate-90 text-white/40"
                    : "text-transparent"
                }`}
              />
            </div>
            <PickerFolderIcon hasContent={folder.material_count > 0} />
            <span className={`min-w-0 flex-1 truncate text-sm leading-snug font-semibold ${folder.material_count > 0 ? "text-white/90" : "text-white/60"}`}>
              {folder.name}
            </span>
          </div>
        </div>
        {isExpanded && (
          <div className="relative mt-0.5 space-y-0.5" style={{ marginLeft: depth * 24 + 17, paddingLeft: 11 }}>
            <span className="absolute left-0 top-0 bottom-0 w-px bg-[#CCFF00]/[0.15]" aria-hidden="true" />
            {hasChildren && folder.children.map((child) => renderFolder(child, 0))}
            {isLoadingMats && (
              <div className="flex items-center gap-2 py-2 pl-2 text-white/30 text-[11px]">
                <Loader2 size={12} className="animate-spin" />
              </div>
            )}
            {!isLoadingMats && mats.length > 0 && mats.map(renderMatRow)}
            {!isLoadingMats && mats.length === 0 && !hasChildren && (
              <div className="py-1.5 pl-2 text-[11px] text-white/25">{emptyText || "No images"}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="border border-white/[0.08] rounded-2xl w-[380px] max-h-[460px] flex flex-col backdrop-blur-xl"
        style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <PickerFolderIcon hasContent />
            <span className="text-base font-semibold text-white/90">{title}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 cursor-pointer transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-0.5">
            {!loaded ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-white/30" />
              </div>
            ) : rootFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-white/20 text-[12px]">
                <FolderOpen size={24} className="mb-2 opacity-40" />
                {emptyText || "No images"}
              </div>
            ) : (
              rootFolders.map((f) => renderFolder(f, 0))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
