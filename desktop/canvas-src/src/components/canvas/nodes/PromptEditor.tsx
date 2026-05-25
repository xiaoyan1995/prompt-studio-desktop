"use client";

import { useEditor, EditorContent, ReactRenderer, NodeViewWrapper, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Suggestion from "@tiptap/suggestion";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCanvasStore } from "@/stores/canvas-store";
import { useTranslations } from "next-intl";
import type { MaterialFolderSuggestion } from "@/hooks/use-materials";

export interface ElementRef {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface RefSuggestion {
  id: string;
  label: string;
  type: "image" | "video" | "audio" | "text";
  thumbnailUrl?: string;
  preview?: string;
  isMaterial?: boolean;
  category?: string;
}

export interface PromptEditorHandle {
  insertElement: (el: ElementRef) => void;
  insertRefMention: (ref: { id: string; label: string; thumbnailUrl?: string; refType?: string }) => void;
  getElements: () => ElementRef[];
}

export interface SlashCommandItem {
  id: string;
  icon: React.ReactNode;
  name: string;
  description: string;
  promptTemplate: string;
  disabled?: boolean;
}

interface PromptEditorProps {
  content: string;
  contentJson?: any;
  onChange: (text: string, json?: any) => void;
  onElementsChange?: (elements: ElementRef[]) => void;
  suggestions?: RefSuggestion[];
  materialFolders?: MaterialFolderSuggestion[];
  slashCommands?: SlashCommandItem[];
  disabledHint?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  maxLength?: number;
}

function extractElements(editor: any): ElementRef[] {
  const elements: ElementRef[] = [];
  if (!editor) return elements;
  const json = editor.getJSON();
  const walk = (node: any) => {
    if (node.type === "mention" && node.attrs) {
      elements.push({
        id: node.attrs.id ?? "",
        name: node.attrs.label ?? "",
        imageUrl: node.attrs.imageUrl ?? "",
        thumbnailUrl: node.attrs.thumbnailUrl ?? "",
      });
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(json);
  return elements;
}

/* ── 3D Folder Icon (small, for suggestion list) ── */
function SuggestionFolderIcon({ hasContent = false }: { hasContent?: boolean }) {
  const uid = useRef(`sf-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <div className="group/asset-folder relative w-6 h-6 shrink-0 select-none">
      <svg className="absolute left-0 w-6" viewBox="0 0 24 16" fill="none" style={{ top: 3, height: "15.25px" }}>
        <defs>
          <linearGradient id={`${uid}-back`} x1="12" y1="0" x2="12" y2="5.25" gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#A6A6A6" />
            <stop offset="1" stopColor="#737373" />
          </linearGradient>
        </defs>
        <path d="M1.90714 0C0.853857 0 0 0.853857 0 1.90714V15.25H24V3.83571C24 2.77059 23.1366 1.90714 22.0714 1.90714H11.1L10.4306 1.86058C10.0631 1.83501 9.71068 1.70474 9.4149 1.48517L8.09689 0.506737C7.65362 0.177671 7.11621 0 6.56415 0H1.90714Z" fill={`url(#${uid}-back)`} />
      </svg>
      {hasContent && (
        <div className="absolute z-[1] left-1 bottom-0 w-5 h-5 transition-transform duration-200 ease-out -rotate-[10deg] -translate-y-[8px] group-hover/asset-folder:-translate-y-[12px]" style={{ transformOrigin: "right bottom" }}>
          <svg className="h-full w-full" viewBox="-1 -0.5 22 17" fill="none">
            <defs>
              <linearGradient id={`${uid}-ib`} x1="10" y1="0" x2="10" y2="5" gradientUnits="userSpaceOnUse"><stop stopColor="#A6A6A6" /><stop offset="1" stopColor="#808080" /></linearGradient>
              <radialGradient id={`${uid}-if`} cx="0.5" cy="0.5" r="0.6" gradientUnits="objectBoundingBox"><stop stopColor="#D9D9D9" /><stop offset="1" stopColor="#8C8C8C" /></radialGradient>
            </defs>
            <path d="M1.5 0C.67 0 0 .67 0 1.5V14.5c0 .83.67 1.5 1.5 1.5h17c.83 0 1.5-.67 1.5-1.5V3.5c0-.83-.67-1.5-1.5-1.5H9.2l-.5-.04a2.4 2.4 0 0 1-.9-.46L6.7.6A1.8 1.8 0 0 0 5.6.1H1.5Z" fill={`url(#${uid}-ib)`} />
            <rect y="4" width="20" height="12" rx="1.5" fill={`url(#${uid}-if)`} />
          </svg>
        </div>
      )}
      <div
        className="absolute z-[2] bottom-0 left-0 w-6 rounded-[2px] overflow-hidden transition-[transform] duration-200 ease-out [transform:perspective(60px)_rotateX(0deg)] group-hover/asset-folder:[transform:perspective(60px)_rotateX(-30deg)]"
        style={{ height: 16, transformOrigin: "center bottom", boxShadow: "rgba(17,26,0,0.07) 0px -0.104px 1.166px 0px, rgba(17,26,0,0.25) 0px 0.207px 0.207px 0px, rgba(255,255,255,0.25) 0px 0.104px 0.207px 0px inset" }}
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 16" fill="none">
          <defs><radialGradient id={`${uid}-fr`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 8) scale(12 16.41)"><stop stopColor="#D9D9D9" /><stop offset="1" stopColor="#8C8C8C" /></radialGradient></defs>
          <rect width="24" height="16" rx="2" fill={`url(#${uid}-fr)`} />
        </svg>
      </div>
    </div>
  );
}

const SuggestionList = forwardRef<{ onKeyDown: (e: KeyboardEvent) => boolean }, {
  items: RefSuggestion[];
  materialFolders?: MaterialFolderSuggestion[];
  command: (item: { id: string; label: string; thumbnailUrl?: string; type?: string }) => void;
}>(function SuggestionList({ items, materialFolders = [], command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Reset folder view when items change (new query)
  useEffect(() => { setSelectedIndex(0); }, [items, activeFolderId]);

  const nodeItems = items.filter((i) => !i.isMaterial);
  const activeFolder = activeFolderId ? materialFolders.find((f) => f.id === activeFolderId) : null;
  const folderMaterials = activeFolder?.materials.filter((m) =>
    !query || m.label.toLowerCase().includes(query.toLowerCase())
  ) ?? [];

  // Build display list depending on whether we're inside a folder
  const displayItems: Array<{ kind: "node" | "folder" | "material"; ref?: RefSuggestion; folder?: MaterialFolderSuggestion }> = [];
  if (activeFolderId && activeFolder) {
    folderMaterials.forEach((m) => displayItems.push({ kind: "material", ref: m }));
  } else {
    nodeItems.forEach((n) => displayItems.push({ kind: "node", ref: n }));
    materialFolders.forEach((f) => displayItems.push({ kind: "folder", folder: f }));
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % Math.max(displayItems.length, 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + displayItems.length) % Math.max(displayItems.length, 1));
        return true;
      }
      if (e.key === "Enter") {
        const item = displayItems[selectedIndex];
        if (item?.kind === "folder" && item.folder) {
          setActiveFolderId(item.folder.id);
          setSelectedIndex(0);
        } else if (item?.ref) {
          command({ id: item.ref.id, label: item.ref.label, thumbnailUrl: item.ref.thumbnailUrl, type: item.ref.type });
        }
        return true;
      }
      if (e.key === "Backspace" && activeFolderId) {
        setActiveFolderId(null);
        setSelectedIndex(0);
        return true;
      }
      return false;
    },
  }), [displayItems, selectedIndex, command, activeFolderId]);

  if (displayItems.length === 0 && !activeFolderId) return null;

  const hasNodeItems = nodeItems.length > 0;
  const hasFolders = materialFolders.length > 0;

  return (
    <div className="w-[280px] max-h-[360px] overflow-y-auto rounded-2xl border border-zinc-700/60 flex flex-col bg-[#2f2f2f] shadow-lg nodrag nowheel" style={{ boxShadow: "rgba(0,0,0,0.16) 0px 4px 16px 0px, rgba(255,255,255,0.16) 0px 0.5px 0px 0px inset" }}>
      {activeFolderId && activeFolder ? (
        /* ── Inside a folder ── */
        <>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors cursor-pointer shrink-0"
            onMouseDown={(e) => { e.preventDefault(); setActiveFolderId(null); setSelectedIndex(0); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            <span>{activeFolder.label}</span>
          </button>
          <div className="h-px bg-white/[0.08]" />
          <div className="flex-1 overflow-y-auto py-1 px-1">
            {folderMaterials.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-white/30">文件夹为空</div>
            ) : (
              folderMaterials.map((mat, i) => (
                <button
                  key={mat.id}
                  type="button"
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors cursor-pointer ${
                    i === selectedIndex ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06]"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); command({ id: mat.id, label: mat.label, thumbnailUrl: mat.thumbnailUrl, type: mat.type }); }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {mat.thumbnailUrl ? (
                    <img src={mat.thumbnailUrl} alt="" className="size-7 object-cover rounded-lg shrink-0" loading="lazy" decoding="async" />
                  ) : (
                    <div className="size-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold bg-violet-500/20 text-violet-400">
                      {mat.type === "video" ? "V" : mat.type === "audio" ? "A" : "I"}
                    </div>
                  )}
                  <span className="font-medium truncate text-white/90 flex-1">{mat.label}</span>
                  <span className="text-[9px] text-violet-400/60 shrink-0">素材</span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        /* ── Top level: node refs + folders ── */
        <div className="flex-1 overflow-y-auto py-2 px-1 flex flex-col gap-0.5">
          {hasNodeItems && (
            <div className="flex flex-col gap-0.5">
              {nodeItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors cursor-pointer ${
                    idx === selectedIndex ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); command({ id: item.id, label: item.label, thumbnailUrl: item.thumbnailUrl, type: item.type }); }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {item.type === "text" ? (
                    <div className="size-5 rounded shrink-0 flex items-center justify-center text-[9px] font-bold bg-amber-500/20 text-amber-400">T</div>
                  ) : item.type === "audio" ? (
                    <div className="size-5 rounded shrink-0 flex items-end justify-center gap-[1px] pb-[3px] bg-pink-500/20">
                      {[0.4, 0.7, 0.5, 0.9, 0.6].map((h, j) => (
                        <div key={j} className="w-[2px] rounded-full bg-pink-400" style={{ height: `${h * 14}px` }} />
                      ))}
                    </div>
                  ) : item.thumbnailUrl && item.type === "video" ? (
                    <video src={`${item.thumbnailUrl}#t=0.5`} className="size-5 object-cover rounded shrink-0" muted preload="metadata" />
                  ) : item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="size-5 object-cover rounded shrink-0" loading="lazy" decoding="async" />
                  ) : (
                    <div className={`size-5 rounded shrink-0 flex items-center justify-center text-[9px] font-bold ${
                      item.type === "video" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {item.type === "video" ? "V" : "I"}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`font-medium truncate ${item.type === "text" ? "text-amber-400" : item.type === "audio" ? "text-pink-400" : item.type === "video" ? "text-green-400" : "text-blue-400"}`}>
                      {item.label}
                    </span>
                    {item.type === "text" && item.preview && (
                      <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">{item.preview}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {hasNodeItems && hasFolders && (
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="h-px flex-1 bg-white/[0.1]" />
              <span className="text-[10px] font-medium text-white/30 tracking-wider shrink-0">素材库</span>
              <span className="h-px flex-1 bg-white/[0.1]" />
            </div>
          )}
          {!hasNodeItems && hasFolders && (
            <div className="px-2 py-1">
              <span className="text-[10px] font-medium text-white/30 tracking-wider">素材库</span>
            </div>
          )}
          {materialFolders.map((folder, fi) => {
            const globalIdx = nodeItems.length + fi;
            return (
              <button
                key={folder.id}
                type="button"
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-left transition-colors rounded-md cursor-pointer ${
                  globalIdx === selectedIndex ? "bg-white/10" : "hover:bg-white/[0.06]"
                }`}
                onMouseDown={(e) => { e.preventDefault(); setActiveFolderId(folder.id); setSelectedIndex(0); }}
                onMouseEnter={() => setSelectedIndex(globalIdx)}
              >
                <SuggestionFolderIcon hasContent={folder.materialCount > 0} />
                <span className="flex-1 min-w-0 text-sm font-medium leading-5 text-white/90 truncate">{folder.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/30"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ── Slash Command List (popup for / commands) ── */
const SlashCommandList = forwardRef<
  { onKeyDown: (e: KeyboardEvent) => boolean },
  { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void; disabledHint?: string }
>(function SlashCommandList({ items, command, disabledHint }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelectedIndex(0); }, [items]);

  const hasDisabled = items.some((i) => i.disabled);

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (e.key === "Enter") {
        const item = items[selectedIndex];
        if (item && !item.disabled) {
          command(item);
        }
        return true;
      }
      return false;
    },
  }), [items, selectedIndex, command]);

  if (items.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="w-full max-h-[440px] overflow-y-auto rounded-2xl border border-white/[0.08] flex flex-col backdrop-blur-xl nodrag nowheel"
      style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
    >
      <div className="p-2 flex flex-col gap-0.5">
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              className={[
                "w-full h-[60px] rounded-xl px-3 flex items-center gap-3 transition-all duration-200",
                item.disabled
                  ? "opacity-40 cursor-not-allowed"
                  : isSelected
                    ? "bg-white/[0.08] cursor-pointer"
                    : "hover:bg-white/[0.05] cursor-pointer",
              ].join(" ")}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!item.disabled) command(item);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="h-10 w-10 rounded-[10px] bg-white/[0.07] flex items-center justify-center shrink-0 [&_svg]:size-5 [&_svg]:text-zinc-300">
                {item.icon}
              </div>
              <div className="flex-1 h-full flex flex-col justify-center items-start overflow-hidden gap-1 text-left">
                <span
                  className={[
                    "font-medium text-[15px] text-zinc-100 leading-none transition-transform duration-200 text-left",
                    isSelected || item.disabled ? "translate-y-0" : "translate-y-[9px]",
                  ].join(" ")}
                >
                  {item.name}
                </span>
                <p
                  className={[
                    "text-xs text-zinc-500 leading-none truncate transition-all duration-200 text-left w-full",
                    isSelected ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                >
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {hasDisabled && disabledHint && (
        <div className="px-4 pb-2.5 pt-2 border-t border-white/[0.06]">
          <p className="text-xs text-amber-500/80 leading-relaxed">{disabledHint}</p>
        </div>
      )}
    </div>
  );
});

function MentionThumb({ src, isVideo }: { src: string; isVideo: boolean }) {
  if (isVideo) {
    return (
      <video
        src={`${src}#t=0.5`}
        className="w-3.5 h-3.5 rounded-sm object-cover shrink-0 block"
        muted
        preload="metadata"
        draggable={false}
      />
    );
  }
  return <img src={src} alt="" className="w-3.5 h-3.5 rounded-sm object-cover shrink-0 block" draggable={false} decoding="async" />;
}

function AudioPreviewInline({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.volume = 0.5;
    el.play().then(() => setPlaying(true)).catch(() => {});
    return () => { el.pause(); el.currentTime = 0; };
  }, [src]);
  const bars = [0.3, 0.6, 0.9, 0.5, 0.8, 0.4, 0.7, 0.55, 0.85, 0.45, 0.75, 0.65, 0.5, 0.9, 0.35];
  return (
    <div className="w-[220px] px-3 py-3">
      {src && <audio ref={audioRef} src={src} preload="auto" />}
      <div className="flex items-end justify-center gap-[3px] h-[40px]">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-[6px] rounded-full"
            style={{
              height: `${h * 40}px`,
              background: playing ? "linear-gradient(to top, #ec4899, #f472b6)" : "#4a4a4a",
              animation: playing ? `audioBarMention 0.8s ease-in-out ${i * 0.06}s infinite alternate` : "none",
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
      <style>{`@keyframes audioBarMention { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1); } }`}</style>
    </div>
  );
}

function ReplaceMenu({ items, currentId, label, onSelect, onClose, anchorRect }: {
  items: RefSuggestion[];
  currentId: string;
  label: string;
  onSelect: (item: RefSuggestion) => void;
  onClose: () => void;
  anchorRect: { x: number; y: number; bottom: number };
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const otherItems = items.filter((i) => i.id !== currentId);
  const nodeItems = otherItems.filter((i) => !i.isMaterial);
  const matItems = otherItems.filter((i) => i.isMaterial);
  const hasBoth = nodeItems.length > 0 && matItems.length > 0;

  const renderItem = (item: RefSuggestion) => (
    <button
      key={item.id}
      type="button"
      className="w-full flex items-center gap-2 mx-1 px-2 py-1.5 rounded-md text-left text-sm text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(item); }}
    >
      {item.type === "text" ? (
        <div className="size-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold bg-amber-500/20 text-amber-400">T</div>
      ) : item.type === "audio" ? (
        <div className="size-7 rounded-lg shrink-0 flex items-end justify-center gap-[1px] pb-[3px] bg-pink-500/20">
          {[0.4, 0.7, 0.5, 0.9, 0.6].map((h, j) => (
            <div key={j} className="w-[2px] rounded-full bg-pink-400" style={{ height: `${h * 14}px` }} />
          ))}
        </div>
      ) : item.thumbnailUrl && item.type === "video" ? (
        <video src={`${item.thumbnailUrl}#t=0.5`} className="size-7 object-cover rounded-lg shrink-0" muted preload="metadata" />
      ) : item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="size-7 object-cover rounded-lg shrink-0" loading="lazy" decoding="async" />
      ) : (
        <div className={`size-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold ${
          item.type === "video" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
        }`}>
          {item.type === "video" ? "V" : "I"}
        </div>
      )}
      <span className="font-medium truncate text-sm">{item.label}</span>
      {item.isMaterial && (
        <span className="text-[9px] text-violet-400/60 shrink-0 ml-auto">素材</span>
      )}
    </button>
  );

  if (otherItems.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 max-h-72 overflow-y-auto rounded-2xl border border-zinc-700/60 py-1 bg-[#1c1c1c] shadow-lg shadow-black/30 nodrag nowheel"
      style={{
        left: anchorRect.x,
        top: anchorRect.bottom + 4,
      }}
    >
      <div className="px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-500">Replace @{label} with:</span>
      </div>
      {nodeItems.map(renderItem)}
      {hasBoth && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[9px] text-zinc-500 shrink-0">素材库</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      )}
      {matItems.map(renderItem)}
    </div>,
    document.body,
  );
}

function RefMentionView({ node, editor, updateAttributes }: { node: any; editor: any; updateAttributes: (attrs: Record<string, any>) => void }) {
  const label = node.attrs.label ?? "";
  const thumb = node.attrs.thumbnailUrl ?? "";
  const refType = node.attrs.refType ?? "image";
  const isVideo = refType === "video" || label.startsWith("Video");
  const isAudio = refType === "audio" || label.startsWith("Audio") || label.startsWith("音频");
  const isText = refType === "text";
  const mentionId = node.attrs.id ?? "";
  const isUnresolved = mentionId.startsWith("unresolved-");
  const [showPreview, setShowPreview] = useState(false);
  const [showReplaceMenu, setShowReplaceMenu] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; bottom: number } | null>(null);
  const [textPreview, setTextPreview] = useState("");
  const pillRef = useRef<HTMLSpanElement>(null);
  const textNodeId = isText ? mentionId.replace(/^text-/, "") : "";

  const audioUrl = isAudio ? (() => {
    const n = useCanvasStore.getState().nodes.find((nd) => nd.id === mentionId);
    return String(n?.data?.audioUrl ?? "");
  })() : "";

  const handleMouseEnter = useCallback(() => {
    if (showReplaceMenu || !pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    setPreviewPos({ x: rect.left + rect.width / 2, y: rect.top });
    if (isText && textNodeId) {
      const n = useCanvasStore.getState().nodes.find((nd) => nd.id === textNodeId);
      const raw = String(n?.data?.content ?? "");
      setTextPreview(raw.replace(/<[^>]*>/g, "").trim());
    }
    setShowPreview(true);
  }, [isText, textNodeId, showReplaceMenu]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    setMenuAnchor({ x: rect.left, y: rect.top, bottom: rect.bottom });
    setShowReplaceMenu((prev) => !prev);
    setShowPreview(false);
  }, []);

  const handleReplace = useCallback((item: RefSuggestion) => {
    updateAttributes({
      id: item.id,
      label: item.label,
      thumbnailUrl: item.thumbnailUrl ?? null,
      refType: item.type ?? "image",
    });
    setShowReplaceMenu(false);
  }, [updateAttributes]);

  const suggestions: RefSuggestion[] = editor?.storage?.refMention?.suggestions ?? [];

  const pillClass = isUnresolved
    ? "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30"
    : isText
    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
    : isAudio
    ? "bg-pink-500/15 text-pink-400 border border-pink-500/20"
    : isVideo
    ? "bg-green-500/15 text-green-400 border border-green-500/20"
    : "bg-blue-500/15 text-blue-400 border border-blue-500/20";

  const hasMediaPreview = showPreview && thumb && !isText && !isAudio && previewPos;
  const hasAudioPreview = showPreview && isAudio && previewPos;
  const hasTextPreview = showPreview && isText && textPreview && previewPos;

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle" style={{ marginTop: -2 }}>
      <span
        ref={pillRef}
        className={`inline-flex items-center gap-0.5 h-[18px] rounded-sm pl-0.5 pr-1.5 text-[11px] font-medium cursor-pointer leading-[18px] align-middle ${pillClass}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowPreview(false)}
        onClick={handleClick}
      >
        {isUnresolved ? (
          <span className="w-3.5 h-3.5 rounded-sm flex items-center justify-center shrink-0 bg-zinc-500/25">
            <svg className="w-2.5 h-2.5 text-zinc-400" viewBox="0 0 24 24" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm-1.25 6.5a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25v1.215c0 .292-.146.564-.389.724l-1.36.906A.75.75 0 0 0 11.75 12v.75a.75.75 0 0 0 1.5 0v-.465l1.36-.906A2.25 2.25 0 0 0 15.6 9.715V8.5A1.75 1.75 0 0 0 13.75 6.75h-2.5A1.75 1.75 0 0 0 9.5 8.5a.75.75 0 0 0 1.5 0v-.25ZM12 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" fill="currentColor"/></svg>
          </span>
        ) : isText ? (
          <span className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[7px] font-bold bg-amber-500/25 shrink-0">T</span>
        ) : isAudio ? (
          <span className="w-3.5 h-3.5 rounded-sm flex items-end justify-center gap-[0.5px] pb-[2px] bg-pink-500/25 shrink-0">
            {[0.4, 0.75, 0.5, 0.9, 0.6].map((h, j) => (
              <span key={j} className="inline-block w-[1.5px] rounded-full bg-pink-400" style={{ height: `${h * 10}px` }} />
            ))}
          </span>
        ) : thumb ? (
          <MentionThumb src={thumb} isVideo={isVideo} />
        ) : null}
        <span className="leading-[18px]">{label}</span>
      </span>

      {showReplaceMenu && menuAnchor && (
        <ReplaceMenu
          items={suggestions}
          currentId={mentionId}
          label={label}
          onSelect={handleReplace}
          onClose={() => setShowReplaceMenu(false)}
          anchorRect={menuAnchor}
        />
      )}

      {hasMediaPreview && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: previewPos.x,
            top: previewPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="mb-2 rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-white/[0.04]">{label}</div>
            {isVideo ? (
              <video
                src={`${thumb}#t=0.5`}
                className="w-[200px] h-auto"
                muted
                autoPlay
                loop
                playsInline
                draggable={false}
              />
            ) : (
              <img
                src={thumb}
                alt={label}
                className="w-[200px] h-auto"
                draggable={false}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </div>,
        document.body,
      )}

      {hasAudioPreview && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: previewPos.x,
            top: previewPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="mb-2 rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-3 py-1.5 text-xs font-medium text-pink-400 bg-white/[0.04]">{label}</div>
            <AudioPreviewInline src={audioUrl} />
          </div>
        </div>,
        document.body,
      )}

      {hasTextPreview && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: previewPos.x,
            top: previewPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="mb-2 w-[200px] rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-white/[0.04]">{label}</div>
            <div className="px-3 py-2 text-[11px] text-zinc-300 leading-relaxed line-clamp-5">
              {textPreview}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </NodeViewWrapper>
  );
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  function PromptEditor(
    { content, contentJson, onChange, onElementsChange, suggestions = [], materialFolders = [], slashCommands = [], disabledHint, placeholder = "", style, maxLength },
    ref,
  ) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onElementsChangeRef = useRef(onElementsChange);
    onElementsChangeRef.current = onElementsChange;
    const suggestionsRef = useRef(suggestions);
    suggestionsRef.current = suggestions;
    const materialFoldersRef = useRef(materialFolders);
    materialFoldersRef.current = materialFolders;
    const slashCommandsRef = useRef(slashCommands);
    slashCommandsRef.current = slashCommands;
    const disabledHintRef = useRef(disabledHint);
    disabledHintRef.current = disabledHint;
    const editorInstanceRef = useRef<any>(null);
    const hasSlashCommands = slashCommands.length > 0;
    const [editorEmpty, setEditorEmpty] = useState(!content);
    const [charCount, setCharCount] = useState(content?.length ?? 0);
    const maxLengthRef = useRef(maxLength);
    maxLengthRef.current = maxLength;
    const t = useTranslations("canvas");

    const initialContent = useRef(contentJson ?? content);

    const refMention = Mention.extend({
      name: "refMention",
      addAttributes() {
        return {
          ...this.parent?.(),
          thumbnailUrl: { default: null },
          refType: { default: "image" },
        };
      },
      addStorage() {
        return { suggestions: [] as RefSuggestion[] };
      },
      addNodeView() {
        return ReactNodeViewRenderer(RefMentionView);
      },
    }).configure({
      HTMLAttributes: { class: "mention" },
      suggestion: {
        char: "@",
        allowedPrefixes: null,
        items: ({ query }: { query: string }) => {
          return suggestionsRef.current.filter((s) =>
            s.label.toLowerCase().includes(query.toLowerCase()),
          );
        },
        command: ({ editor, range, props }: any) => {
          editor.chain().focus().deleteRange(range).insertContent({
            type: "refMention",
            attrs: {
              id: props.id,
              label: props.label,
              thumbnailUrl: props.thumbnailUrl ?? null,
              refType: props.type ?? "image",
            },
          }).insertContent(" ").run();
        },
        render: () => {
          let component: ReactRenderer | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SuggestionList, {
                props: { items: props.items, command: props.command, materialFolders: materialFoldersRef.current },
                editor: props.editor,
              });
              popup = tippy(props.clientRect ? document.body : props.editor.options.element, {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              }) as unknown as TippyInstance;
            },
            onUpdate: (props: any) => {
              component?.updateProps({ items: props.items, command: props.command, materialFolders: materialFoldersRef.current });
              if (popup && props.clientRect) {
                (popup as any).setProps?.({ getReferenceClientRect: props.clientRect });
              }
            },
            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                (popup as any)?.hide?.();
                return true;
              }
              const ref = component?.ref as { onKeyDown?: (e: KeyboardEvent) => boolean } | null;
              return ref?.onKeyDown?.(props.event) ?? false;
            },
            onExit: () => {
              (popup as any)?.destroy?.();
              component?.destroy();
            },
          };
        },
      },
    });

    const elementMention = Mention.configure({
      HTMLAttributes: { class: "mention mention-element" },
      renderHTML({ node }) {
        const thumb = node.attrs.thumbnailUrl ?? "";
        const label = node.attrs.label ?? "Element";
        const imgTag = thumb
          ? `<img src="${thumb}" alt="" class="mention-thumb" />`
          : "";
        return [
          "span",
          { class: "mention mention-element", "data-mention-type": "element" },
          imgTag + label,
        ];
      },
    });

    const charLimitExt = Extension.create({
      name: "charLimit",
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey("charLimit"),
            filterTransaction: (tr) => {
              const limit = maxLengthRef.current;
              if (!limit || !tr.docChanged) return true;
              const newLen = tr.doc.textContent.length;
              return newLen <= limit;
            },
          }),
        ];
      },
    });

    const slashCommandExt = Extension.create({
      name: "slashCommands",
      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            char: "/",
            allowedPrefixes: null,
            startOfLine: false,
            items: ({ query, editor: ed }: { query: string; editor: any }) => {
              const cmds = slashCommandsRef.current ?? [];
              if (!cmds.length) return [];
              const fullText = ed.state.doc.textContent;
              if (fullText !== "/" + query) return [];
              if (!query) return cmds;
              return cmds.filter((c) =>
                c.name.toLowerCase().includes(query.toLowerCase()),
              );
            },
            command: ({ editor: ed, range, props }: any) => {
              if (props.disabled) return;
              ed.chain().focus().deleteRange(range).insertContent(props.promptTemplate).run();
            },
            render: () => {
              let component: ReactRenderer | null = null;
              let popup: TippyInstance | null = null;

              return {
                onStart: (props: any) => {
                  if (!props.items?.length) return;
                  component = new ReactRenderer(SlashCommandList, {
                    props: { items: props.items, command: props.command, disabledHint: disabledHintRef.current },
                    editor: props.editor,
                  });
                  const editorEl = props.editor.options.element as HTMLElement;
                  const getEditorRect = () => editorEl.getBoundingClientRect();
                  popup = tippy(document.body, {
                    getReferenceClientRect: getEditorRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "top-start",
                    maxWidth: "none",
                    offset: [0, 4],
                  }) as unknown as TippyInstance;
                  if (popup && (popup as any).popper) {
                    (popup as any).popper.style.width = `${editorEl.offsetWidth}px`;
                  }
                },
                onUpdate: (props: any) => {
                  if (!props.items?.length) {
                    (popup as any)?.hide?.();
                    return;
                  }
                  component?.updateProps({ items: props.items, command: props.command, disabledHint: disabledHintRef.current });
                  const editorEl = props.editor.options.element as HTMLElement;
                  if (popup) {
                    (popup as any).setProps?.({ getReferenceClientRect: () => editorEl.getBoundingClientRect() });
                    if ((popup as any).popper) {
                      (popup as any).popper.style.width = `${editorEl.offsetWidth}px`;
                    }
                  }
                  (popup as any)?.show?.();
                },
                onKeyDown: (props: any) => {
                  if (props.event.key === "Escape") {
                    (popup as any)?.hide?.();
                    return true;
                  }
                  const cRef = component?.ref as { onKeyDown?: (e: KeyboardEvent) => boolean } | null;
                  return cRef?.onKeyDown?.(props.event) ?? false;
                },
                onExit: () => {
                  (popup as any)?.destroy?.();
                  component?.destroy();
                },
              };
            },
          }),
        ];
      },
    });

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: false,
          bold: false,
          italic: false,
          strike: false,
          code: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({ placeholder: hasSlashCommands ? "" : placeholder, showOnlyCurrent: false }),
        refMention,
        elementMention,
        slashCommandExt,
        charLimitExt,
      ],
      content: initialContent.current || "",
      editorProps: {
        attributes: {
          class:
            "tiptap ProseMirror prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 pb-2 nodrag",
          tabindex: "0",
        },
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (!text || !/@/i.test(text)) return false;
          const sug = suggestionsRef.current;
          if (sug.length === 0) return false;

          const mentionPattern = /@(image[_\s]?\d+|图片?[_\s]?\d+|video[_\s]?\d+|视频[_\s]?\d+|audio[_\s]?\d+|音频[_\s]?\d+|text[_\s]?\d*|文字[_\s]?\d*)/gi;
          if (!mentionPattern.test(text)) return false;
          mentionPattern.lastIndex = 0;

          const typeAliasMap: Record<string, string> = {
            image: "image", 图: "image", 图片: "image",
            video: "video", 视频: "video",
            audio: "audio", 音频: "audio",
            text: "text", 文字: "text",
          };
          function inferType(raw: string): string {
            const lower = raw.toLowerCase();
            for (const [alias, typ] of Object.entries(typeAliasMap)) {
              if (lower.startsWith(alias)) return typ;
            }
            return "image";
          }

          const content: any[] = [];
          let lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = mentionPattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
              content.push({ type: "text", text: text.slice(lastIndex, match.index) });
            }
            const raw = match[1].replace(/[_\s]/g, " ").trim().toLowerCase();
            const matchedType = inferType(raw);
            const numMatch = raw.match(/\d+/);
            const num = numMatch ? parseInt(numMatch[0], 10) : -1;
            const typedSug = sug.filter((s) => !s.isMaterial && (s.type ?? "image") === matchedType);
            const found = typedSug.find((s, i) => {
              if (i + 1 === num) return true;
              return s.label.toLowerCase().replace(/[_\s]/g, " ") === raw;
            });
            if (found) {
              content.push({
                type: "refMention",
                attrs: {
                  id: found.id,
                  label: found.label,
                  thumbnailUrl: found.thumbnailUrl ?? null,
                  refType: found.type ?? "image",
                },
              });
              content.push({ type: "text", text: " " });
            } else {
              const placeholderLabel = match[1].replace(/[_]/g, " ").trim();
              content.push({
                type: "refMention",
                attrs: {
                  id: `unresolved-${num > 0 ? num : placeholderLabel}`,
                  label: placeholderLabel,
                  thumbnailUrl: null,
                  refType: matchedType,
                },
              });
              content.push({ type: "text", text: " " });
            }
            lastIndex = match.index + match[0].length;
          }

          if (lastIndex < text.length) {
            content.push({ type: "text", text: text.slice(lastIndex) });
          }

          const ed = editorInstanceRef.current;
          if (!ed) return false;
          ed.chain().focus().insertContent(content).run();

          event.preventDefault();
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        onChangeRef.current(e.getText(), e.getJSON());
        onElementsChangeRef.current?.(extractElements(e));
        setEditorEmpty(e.isEmpty);
        setCharCount(e.getText().length);
      },
    });

    editorInstanceRef.current = editor;

    const insertElement = useCallback(
      (el: ElementRef) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "mention",
            attrs: {
              id: el.id,
              label: el.name,
              imageUrl: el.imageUrl,
              thumbnailUrl: el.thumbnailUrl,
            },
          })
          .insertContent(" ")
          .run();
      },
      [editor],
    );

    const getElements = useCallback(
      () => extractElements(editor),
      [editor],
    );

    const insertRefMention = useCallback(
      (r: { id: string; label: string; thumbnailUrl?: string; refType?: string }) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "refMention",
            attrs: {
              id: r.id,
              label: r.label,
              thumbnailUrl: r.thumbnailUrl ?? null,
              refType: r.refType ?? "image",
            },
          })
          .insertContent(" ")
          .run();
      },
      [editor],
    );

    useImperativeHandle(ref, () => ({ insertElement, insertRefMention, getElements }), [
      insertElement,
      insertRefMention,
      getElements,
    ]);

    useEffect(() => {
      if (editor) {
        (editor.storage as any).refMention.suggestions = suggestions;
      }
    }, [editor, suggestions]);

    useEffect(() => {
      if (!editor || editor.view.composing) return;
      const current = editor.getText();
      if (content !== current) {
        editor.commands.setContent(contentJson ?? content ?? "");
      }
      setEditorEmpty(editor.isEmpty);
    }, [editor, content, contentJson]);

    return (
      <div
        className={[
          "overflow-y-auto w-full nodrag nowheel cursor-text relative",
          "[&_.ProseMirror]:min-h-[inherit]",
          "[&_.ProseMirror_p]:my-0 [&_.ProseMirror_p]:!text-sm",
          "[&_.ProseMirror]:!min-h-0",
          "[&_.mention]:rounded [&_.mention]:mr-1",
          "[&_.mention-element]:!bg-purple-500/15 [&_.mention-element]:!text-purple-700 [&_.mention-element]:dark:!text-purple-300 [&_.mention-element]:!border [&_.mention-element]:!border-purple-500/20 [&_.mention-element]:!h-6 [&_.mention-element]:!rounded-full [&_.mention-element]:!pl-1 [&_.mention-element]:!pr-2 [&_.mention-element]:!py-0 [&_.mention-element]:!inline-flex [&_.mention-element]:!items-center [&_.mention-element]:!gap-1 [&_.mention-element]:!text-xs [&_.mention-element]:!font-medium",
          "[&_.mention-thumb]:!w-4 [&_.mention-thumb]:!h-4 [&_.mention-thumb]:!rounded [&_.mention-thumb]:!object-cover [&_.mention-thumb]:!m-0 [&_.mention-thumb]:!shrink-0",
        ].join(" ")}
        style={{
          ...style,
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        data-testid="canvas-node-prompt-textarea"
      >
        <EditorContent editor={editor} />
        {maxLength && (
          <div className={`absolute bottom-1 right-2 text-[11px] tabular-nums pointer-events-none select-none ${charCount >= maxLength ? "text-red-400" : charCount >= maxLength * 0.8 ? "text-amber-400/70" : "text-zinc-500/50"}`}>
            {charCount}/{maxLength}
          </div>
        )}
        {hasSlashCommands && editorEmpty && (
          <div className="absolute inset-0 flex items-start pointer-events-none px-3 pt-[7px]">
            <span className="text-sm text-zinc-400 dark:text-zinc-500 leading-normal flex items-center gap-0.5 flex-wrap">
              {t("promptHintDesc")}
              <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-zinc-100 dark:bg-white/[0.08] border border-zinc-200 dark:border-transparent text-[11px] text-zinc-600 dark:text-zinc-400 font-medium mx-0.5">@</kbd>
              {t("promptHintRefMaterial")}
              <kbd className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-zinc-100 dark:bg-white/[0.08] border border-zinc-200 dark:border-transparent text-[11px] text-zinc-600 dark:text-zinc-400 font-medium mx-0.5">/</kbd>
              {t("promptHintInvokeCmd")}
            </span>
          </div>
        )}
      </div>
    );
  },
);
