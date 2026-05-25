"use client";

import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import { useCanvasStore } from "@/stores/canvas-store";

interface ContextMenuProps {
  x: number;
  y: number;
  target: { type: "node" | "edge" | "canvas"; id?: string };
  onClose: () => void;
  onDelete?: (id: string) => void;
  onDeleteSelected?: () => void;
  onDuplicate?: (id: string) => void;
  onDuplicateSelected?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onOpenAddNodeMenu?: () => void;
  onUploadAsset?: () => void;
  onSaveToMaterial?: (nodeId: string) => void;
  canSaveToMaterial?: boolean;
}

function formatShortcut(shortcut?: string): string | undefined {
  if (!shortcut) return undefined;
  if (typeof window === "undefined") return shortcut;
  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
  if (isMac) return shortcut;

  if (shortcut === "⌫,del") return "Del";
  if (shortcut === "⌫") return "Backspace";

  let formatted = shortcut.replace(/⌘/g, "Ctrl+").replace(/⇧/g, "Shift+");
  if (formatted.includes("Shift+Ctrl+")) {
    formatted = formatted.replace("Shift+Ctrl+", "Ctrl+Shift+");
  }
  return formatted;
}

export function ContextMenu({ x, y, target, onClose, onDelete, onDeleteSelected, onDuplicate, onDuplicateSelected, onCopy, onPaste, onOpenAddNodeMenu, onUploadAsset, onSaveToMaterial, canSaveToMaterial }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("canvas");
  const tc = useTranslations("common");

  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp to viewport
  const menuW = 240;
  const menuH = 300;
  const clampedX = Math.min(x, window.innerWidth - menuW - 10);
  const clampedY = Math.min(y, window.innerHeight - menuH - 10);

  return (
    <div
      ref={ref}
      className="fixed z-[100] animate-in zoom-in-95 fade-in origin-top-left duration-150"
      style={{ left: clampedX, top: clampedY }}
    >
      <Command
        className="bg-white/85 dark:bg-[#1e1e1e]/85 border border-zinc-200/60 dark:border-zinc-700/60 backdrop-blur-xl rounded-2xl p-1 w-60 max-h-[500px] overflow-hidden shadow-xl"
        loop
      >
        <Command.List>
          {/* ── Canvas context menu ── */}
          {target.type === "canvas" && (
            <>
              <Command.Group>
                <CtxItem label={t("uploadAsset")} onSelect={() => { onClose(); onUploadAsset?.(); }} />
              </Command.Group>

              <Command.Separator className="-mx-1 h-px bg-zinc-200/60 dark:bg-zinc-700/60 my-1" />

              <Command.Group>
                <CtxItem
                  label={t("addNode")}
                  onSelect={() => {
                    onClose();
                    onOpenAddNodeMenu?.();
                  }}
                />
              </Command.Group>

              <Command.Separator className="-mx-1 h-px bg-zinc-200/60 dark:bg-zinc-700/60 my-1" />

              <Command.Group>
                <CtxItem label={t("undo")} shortcut="⌘Z" onSelect={() => { useCanvasStore.getState().undo(); onClose(); }} />
                <CtxItem label={t("redo")} shortcut="⇧⌘Z" onSelect={() => { useCanvasStore.getState().redo(); onClose(); }} />
              </Command.Group>

              <Command.Separator className="-mx-1 h-px bg-zinc-200/60 dark:bg-zinc-700/60 my-1" />

              <Command.Group>
                <CtxItem label={t("paste")} shortcut="⌘V" onSelect={() => { onPaste?.(); onClose(); }} />
              </Command.Group>
            </>
          )}

          {/* ── Node context menu (single) ── */}
          {target.type === "node" && target.id && (
            <>
              {canSaveToMaterial && (
                <Command.Group>
                  <CtxItem label={t("saveToMaterial")} onSelect={() => { onSaveToMaterial?.(target.id!); onClose(); }} />
                </Command.Group>
              )}

              <Command.Group>
                <CtxItem label={tc("copy")} shortcut="⌘C" onSelect={() => { onCopy?.(); onClose(); }} />
                <CtxItem label={t("paste")} shortcut="⌘V" onSelect={() => { onPaste?.(); onClose(); }} />
                <CtxItem label={t("duplicate")} shortcut="⇧⌘V" onSelect={() => { onDuplicate?.(target.id!); onClose(); }} />
              </Command.Group>

              <Command.Separator className="-mx-1 h-px bg-zinc-200/60 dark:bg-zinc-700/60 my-1" />

              <Command.Group>
                <CtxItem
                  label={tc("delete")}
                  shortcut="⌫,del"
                  danger
                  onSelect={() => { onDelete?.(target.id!); onClose(); }}
                />
              </Command.Group>
            </>
          )}

          {/* ── Selection context menu (multi-select) ── */}
          {target.type === "node" && !target.id && (
            <>
              <Command.Group>
                <CtxItem label={tc("copy")} shortcut="⌘C" onSelect={() => { onCopy?.(); onClose(); }} />
                <CtxItem label={t("paste")} shortcut="⌘V" onSelect={() => { onPaste?.(); onClose(); }} />
                <CtxItem label={t("duplicate")} shortcut="⇧⌘V" onSelect={() => { onDuplicateSelected?.(); onClose(); }} />
              </Command.Group>

              <Command.Separator className="-mx-1 h-px bg-zinc-200/60 dark:bg-zinc-700/60 my-1" />

              <Command.Group>
                <CtxItem
                  label={tc("delete")}
                  shortcut="⌫,del"
                  danger
                  onSelect={() => { onDeleteSelected?.(); onClose(); }}
                />
              </Command.Group>
            </>
          )}

          {/* ── Edge context menu ── */}
          {target.type === "edge" && target.id && (
            <Command.Group>
              <CtxItem
                label={t("deleteEdge")}
                shortcut="⌫"
                danger
                onSelect={() => { onDelete?.(target.id!); onClose(); }}
              />
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

/* ── Context menu item ── */
function CtxItem({
  label,
  shortcut,
  danger,
  onSelect,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={label + (shortcut ?? "")}
      onSelect={onSelect}
      className={`relative flex select-none items-center outline-none p-3 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-700/50 ${
        shortcut ? "justify-between gap-2" : ""
      } ${danger ? "text-red-500 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-sm text-zinc-400 dark:text-zinc-500 tracking-widest">{formatShortcut(shortcut)}</span>
      )}
    </Command.Item>
  );
}
