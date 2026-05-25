"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Sparkles, Folder, Check, Loader2, X } from "lucide-react";

interface PaletteColor {
  hex: string;
  pct: number;
}

interface PromptItem {
  id: string;
  title?: string;
  prompt: string;
  image?: string;
  gallery?: string[];
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  is_folder?: boolean;
  folder_id?: string | null;
  palette_cache?: PaletteColor[];
}

interface ProjectItem {
  id: string;
  name: string;
  image_prompts?: PromptItem[];
  video_prompts?: PromptItem[];
  skill_prompts?: PromptItem[];
}

interface PromptLibraryPopoverProps {
  type: "image" | "video";
  onSelect: (prompt: string) => void;
  onClose: () => void;
  flipUp?: boolean;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
}

// ── CIE L*a*b* Perceptual color translator from Extension ──
function pqiRgbToLab(r: number, g: number, b: number): [number, number, number] {
  let R = r / 255, G = g / 255, B = b / 255;
  R = R <= 0.04045 ? R / 12.92 : Math.pow((R + 0.055) / 1.055, 2.4);
  G = G <= 0.04045 ? G / 12.92 : Math.pow((G + 0.055) / 1.055, 2.4);
  B = B <= 0.04045 ? B / 12.92 : Math.pow((B + 0.055) / 1.055, 2.4);
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  X /= 0.95047; Z /= 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function pqiHexToLab(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return pqiRgbToLab(r, g, b);
}

function pqiDeltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  return Math.sqrt(Math.pow(lab1[0] - lab2[0], 2) + Math.pow(lab1[1] - lab2[1], 2) + Math.pow(lab1[2] - lab2[2], 2));
}

const PQI_COLOR_TARGETS: Record<string, [number, number, number]> = {
  'rich ruby crimson red': [53, 80, 67],
  'warm amber tangerine orange': [65, 48, 75],
  'soft golden marigold yellow': [81, 10, 80],
  'emerald botanical sage green': [66, -60, 43],
  'vibrant aquatic teal cyan': [68, -43, -15],
  'celestial cobalt indigo blue': [55, 11, -73],
  'velvet amethyst violet purple': [50, 58, -65],
  'deep obsidian charcoal black': [15, 3, -4],
  'pure minimalist alabaster white': [98, -1, -2]
};

function pqiTranslateHexToAesthetic(hex: string): string {
  const lab = pqiHexToLab(hex);
  let bestName = 'color';
  let minDiff = 999;
  for (const [name, target] of Object.entries(PQI_COLOR_TARGETS)) {
    const diff = pqiDeltaE(lab, target);
    if (diff < minDiff) {
      minDiff = diff;
      bestName = name;
    }
  }
  return bestName;
}

export function PromptLibraryPopover({
  type,
  onSelect,
  onClose,
  flipUp = false,
  popoverRef,
}: PromptLibraryPopoverProps) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjIdx, setSelectedProjIdx] = useState<number>(0);
  const [selectedCat, setSelectedCat] = useState<"image_prompts" | "video_prompts" | "skill_prompts">("image_prompts");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [injectPalette, setInjectPalette] = useState(true);
  const [loading, setLoading] = useState(false);

  // Default selected category based on parent panel type
  useEffect(() => {
    if (type === "video") {
      setSelectedCat("video_prompts");
    } else {
      setSelectedCat("image_prompts");
    }
  }, [type]);

  // Load database on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/data");
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.projects)) {
            setProjects(data.projects);
          }
        }
      } catch (err) {
        console.error("Failed to load prompt studio data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentProject = projects[selectedProjIdx];

  // List of folders and non-folder counts
  const folders = useMemo(() => {
    if (!currentProject) return [];
    const all = currentProject[selectedCat] || [];
    return all.filter(it => it.is_folder);
  }, [currentProject, selectedCat]);

  const catList = useMemo(() => {
    if (!currentProject) return [];
    return [
      { id: "image_prompts" as const, label: "图片", icon: "🖼️", allItems: currentProject.image_prompts || [] },
      { id: "video_prompts" as const, label: "视频", icon: "🎬", allItems: currentProject.video_prompts || [] },
      { id: "skill_prompts" as const, label: "Skills", icon: "🤖", allItems: currentProject.skill_prompts || [] },
    ];
  }, [currentProject]);

  const activePrompts = useMemo(() => {
    if (!currentProject) return [];
    let items = (currentProject[selectedCat] || []).filter(it => !it.is_folder);

    // Apply folder filter (skip during search)
    if (!searchQuery) {
      if (folderFilter) {
        items = items.filter(it => it.folder_id === folderFilter);
      } else {
        items = items.filter(it => !it.folder_id);
      }
    }

    // Search query filter
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      items = items.filter(
        (it) =>
          (it.title && it.title.toLowerCase().includes(q)) ||
          (it.prompt && it.prompt.toLowerCase().includes(q)) ||
          (it.tags && it.tags.some(tag => tag.toLowerCase().includes(q)))
      );
    }

    items.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    return items;
  }, [currentProject, selectedCat, folderFilter, searchQuery]);

  const handleCardClick = async (item: PromptItem) => {
    const promptText = item.prompt || "";
    const palette = item.palette_cache || [];
    let injectText = promptText;

    // Aesthetic color recipe injection (exactly matched from browser extension)
    if (injectPalette && palette.length > 0 && (selectedCat === "image_prompts" || selectedCat === "video_prompts")) {
      const sorted = palette.slice().sort((a, b) => b.pct - a.pct);
      const parts = sorted.map((c, i) => {
        const desc = pqiTranslateHexToAesthetic(c.hex);
        return i === 0 ? `dominant ${desc} (${Math.round(c.pct)}%)` : `${desc} (${Math.round(c.pct)}%)`;
      });
      if (parts.length > 0) {
        injectText += `, color palette: [ ${parts.join(', ')} ]`;
      }
    }

    onSelect(injectText);
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      id="pqi-panel"
      className={`absolute ${
        flipUp ? "bottom-full mb-2" : "top-full mt-2"
      } right-0 z-50 nodrag nowheel visible`}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width: "460px",
        height: "500px",
        background: "transparent",
        borderRadius: "12px",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "13px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="w-full h-full bg-white dark:bg-[#1a1a1a] rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-100 shadow-2xl overflow-hidden flex flex-col">
        {/* 1. Header (Classic Minimalist White/Dark) */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-[#1a1a1a] border-b border-zinc-100 dark:border-white/[0.08] flex-shrink-0">
          <span className="text-sm">📋</span>
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100 flex-1">提示词库</span>
          <button
            type="button"
            className="w-5 h-5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-white/[0.08] dark:hover:bg-white/[0.15] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center justify-center transition-colors text-xs"
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>

        {/* 2. Search Row */}
        <div className="flex items-center border-b border-zinc-100 dark:border-white/[0.08] px-3.5 py-1.5 gap-2.5 flex-shrink-0 bg-white dark:bg-[#1a1a1a]">
          <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase shrink-0 select-none flex items-center gap-1">
            <Search size={12} className="text-zinc-400 dark:text-zinc-500" />
            搜索
          </span>
          <input
            type="text"
            placeholder="输入关键词过滤..."
            className="bg-transparent border-none outline-none text-xs text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 flex-1 min-w-0 py-0.5"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 3. Palette Toggle Row */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 border-b border-zinc-100 dark:border-white/[0.08] text-[11px] text-zinc-400 dark:text-zinc-500 select-none flex-shrink-0 bg-white dark:bg-[#1a1a1a]">
          <label className="flex items-center gap-1.5 cursor-pointer margin-0">
            <input
              type="checkbox"
              checked={injectPalette}
              onChange={(e) => setInjectPalette(e.target.checked)}
              className="cursor-pointer size-3.5 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 focus:ring-zinc-400"
            />
            <span>🎨 注入色彩配方</span>
          </label>
        </div>

        {/* 5. Body Layout */}
        <div className="flex flex-1 min-h-0 bg-white dark:bg-[#1a1a1a]">
          {/* Left Sidebar */}
          <div className="w-[125px] border-r border-zinc-200 dark:border-white/[0.08] overflow-y-auto py-2 shrink-0 flex flex-col bg-[#fafafa] dark:bg-zinc-950/40" style={{ scrollbarWidth: "none" }}>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={16} className="animate-spin text-zinc-400 dark:text-zinc-600" />
              </div>
            ) : (
              <>
                {/* Project folder list */}
                {projects.map((proj, pi) => {
                  const isActive = pi === selectedProjIdx;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      className={`w-full flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-medium text-left truncate transition-colors border-l-2 ${
                        isActive
                          ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 border-zinc-800 dark:border-zinc-200 font-bold"
                          : "text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04] hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedProjIdx(pi);
                        setFolderFilter(null); // Reset folder filter when changing project
                      }}
                    >
                      <Folder size={11} className={`shrink-0 ${isActive ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}`} />
                      <span className="truncate">{proj.name}</span>
                    </button>
                  );
                })}

                <div className="h-px bg-zinc-200 dark:bg-white/[0.08] my-1 mx-2" />

                {/* Category tabs */}
                {catList.map((cat) => {
                  const isActive = cat.id === selectedCat;
                  const nonFolderCount = cat.allItems.filter(it => !it.is_folder).length;
                  return (
                    <React.Fragment key={cat.id}>
                      <button
                        type="button"
                        className={`w-full flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-medium text-left truncate transition-colors ${
                          isActive && folderFilter === null
                            ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 font-bold"
                            : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.04] hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCat(cat.id);
                          setFolderFilter(null);
                        }}
                      >
                        <span className="shrink-0 text-xs">{cat.icon}</span>
                        <span className="truncate flex-1">{cat.label}</span>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 shrink-0 font-bold">
                          ({nonFolderCount})
                        </span>
                      </button>

                      {/* Expandable smart subfolders under selected category */}
                      {selectedCat === cat.id && folders.length > 0 && (
                        <div className="flex flex-col">
                          {folders.map(f => {
                            const fCount = cat.allItems.filter(it => !it.is_folder && it.folder_id === f.id).length;
                            const isFolderActive = folderFilter === f.id;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                className={`w-full flex items-center gap-1 px-3.5 pl-6 py-1.5 text-[10px] text-left truncate transition-colors ${
                                  isFolderActive
                                    ? "text-zinc-950 dark:text-zinc-100 font-bold bg-zinc-100/60 dark:bg-zinc-800/60"
                                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]"
                                }`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setFolderFilter(f.id);
                                }}
                              >
                                <span>📂</span>
                                <span className="truncate flex-1">{f.title || "未命名"}</span>
                                <span className="text-[8px] opacity-70">({fCount})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </div>

          {/* Right Card Grid */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-white dark:bg-[#1a1a1a]" style={{ scrollbarWidth: "thin" }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-2">
                <Loader2 size={20} className="animate-spin text-zinc-400 dark:text-zinc-500" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">读取提示词卡片...</span>
              </div>
            ) : activePrompts.length === 0 ? (
              <div className="text-center py-24 text-xs text-zinc-400 dark:text-zinc-500">
                {searchQuery ? "未找到匹配的提示词" : "该项目下暂无该类型提示词"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 align-content-start">
                {activePrompts.map((item) => {
                  const promptText = item.prompt || "";
                  const titleText = item.title || promptText.substring(0, 40) || "无标题";
                  const palette = item.palette_cache || [];
                  const imgPath = item.image || (item.gallery && item.gallery[0]) || "";
                  
                  // Construct the absolute asset uploads path for local media display
                  const imgUrl = imgPath 
                    ? ( /^https?:\/\//i.test(imgPath) ? imgPath : (imgPath.startsWith("/uploads/") ? imgPath : ("/uploads/" + imgPath)) ) 
                    : "";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="flex flex-col text-left rounded-xl border border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-lg dark:hover:shadow-black/40 transition-all bg-white dark:bg-zinc-900/40 overflow-hidden group relative"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCardClick(item);
                      }}
                    >
                      {/* Thumbnail Image */}
                      <div className="w-full h-32 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950/40 shrink-0 border-b border-zinc-100 dark:border-white/[0.06]">
                        {imgUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={imgUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover block"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#eef4ff] to-[#e2ebff] dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center text-4xl text-[#9fb8e9] dark:text-zinc-600 font-bold">
                            {selectedCat === "video_prompts" ? "🎬" : selectedCat === "skill_prompts" ? "🤖" : "🌄"}
                          </div>
                        )}

                        {/* Color Palette ribbon (exactly matched from extension HTML layout) */}
                        {palette.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 flex">
                            {palette.map((c, idx) => (
                              <div
                                key={idx}
                                style={{ background: c.hex, flex: c.pct }}
                                className="h-full"
                                title={`${c.hex} (${c.pct}%)`}
                              />
                            ))}
                          </div>
                        )}
                        
                        {/* Apply overlay pill on hover */}
                        <div className="absolute top-2 right-2 z-10 transition-opacity opacity-0 group-hover:opacity-100">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shadow border bg-[#CCFF00] text-black border-lime-400">
                            一键套用
                          </span>
                        </div>
                      </div>

                      {/* Info (Title & Prompt Text preview) */}
                      <div className="p-2 flex flex-col gap-0.5 min-w-0 w-full">
                        <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-[#CCFF00] truncate leading-none mb-0.5">
                          {titleText}
                        </span>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 line-clamp-2 leading-relaxed">
                          {promptText}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
