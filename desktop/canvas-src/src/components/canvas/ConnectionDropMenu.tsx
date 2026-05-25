"use client";

import { useEffect, useRef, useMemo } from "react";
import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import type { NodeType } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { isConnectionAllowed } from "@/lib/connection-rules";

export interface ConnectionDropMenuProps {
  x: number;
  y: number;
  sourceNodeId: string;
  onSelect: (type: NodeType, sourceNodeId: string) => void;
  onClose: () => void;
}

export function ConnectionDropMenu({ x, y, sourceNodeId, onSelect, onClose }: ConnectionDropMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("canvas");

  const sourceNode = useCanvasStore((s) => s._nodeMap.get(sourceNodeId));
  const sourceType = (sourceNode?.data.nodeType as string) ?? "";

  const items = useMemo(
    () => [
      {
        type: "text" as NodeType,
        label: t("textGen"),
        desc: t("textDesc"),
        icon: (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M9.719 10.256a.583.583 0 010 1.166H2.041a.583.583 0 010-1.166h7.678zM7.8 6.417a.583.583 0 010 1.166H2.041a.583.583 0 010-1.166H7.8zM11.958 2.578a.583.583 0 010 1.167H2.041a.583.583 0 010-1.167h9.917z"
              fill="currentColor"
            />
          </svg>
        ),
      },
      {
        type: "prompt" as NodeType,
        label: t("promptNode"),
        desc: t("promptNodeDesc"),
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 5h14v10H9l-4 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 9h6M9 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        type: "image-gen" as NodeType,
        label: t("imageGen"),
        desc: t("imageDesc"),
        icon: (
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M31.8 3c1.927 0 3.493-.002 4.76.102 1.291.105 2.448.33 3.526.878a8 8 0 013.934 3.934c.549 1.078.773 2.235.878 3.525C45.002 12.707 45 14.273 45 16.2v15.6c0 1.927.002 3.493-.102 4.76-.105 1.291-.33 2.448-.878 3.526a8 8 0 01-3.934 3.934c-1.078.549-2.235.773-3.525.878-1.268.104-2.834.102-4.761.102H16.2c-1.927 0-3.493.002-4.76-.102-1.291-.105-2.448-.33-3.526-.878a8 8 0 01-3.934-3.934c-.549-1.078-.773-2.235-.878-3.525C2.998 35.293 3 33.727 3 31.8V16.2c0-1.927-.002-3.493.102-4.76.105-1.291.33-2.448.878-3.526a8 8 0 013.934-3.934C8.992 3.431 10.149 3.207 11.44 3.102 12.707 2.998 14.273 3 16.2 3h15.6zM31 13a4 4 0 110 8 4 4 0 010-8z"
              fill="currentColor"
            />
          </svg>
        ),
      },
      {
        type: "video-gen" as NodeType,
        label: t("videoGen"),
        desc: t("videoDesc"),
        icon: (
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M31.8 3c1.927 0 3.493-.002 4.76.102 1.291.105 2.448.33 3.526.878a8 8 0 013.934 3.934c.549 1.078.773 2.235.878 3.525C45.002 12.707 45 14.273 45 16.2v15.6c0 1.927.002 3.493-.102 4.76-.105 1.291-.33 2.448-.878 3.526a8 8 0 01-3.934 3.934c-1.078.549-2.235.773-3.525.878-1.268.104-2.834.102-4.761.102H16.2c-1.927 0-3.493.002-4.76-.102-1.291-.105-2.448-.33-3.526-.878a8 8 0 01-3.934-3.934c-.549-1.078-.773-2.235-.878-3.525C2.998 35.293 3 33.727 3 31.8V16.2c0-1.927-.002-3.493.102-4.76.105-1.291.33-2.448.878-3.526a8 8 0 013.934-3.934C8.992 3.431 10.149 3.207 11.44 3.102 12.707 2.998 14.273 3 16.2 3h15.6zM18.576 19.58c0-1.633 1.922-2.637 3.42-1.785l7.769 4.42c1.433.816 1.433 2.753 0 3.569l-7.77 4.42c-1.497.852-3.419-.152-3.419-1.785V19.58z"
              fill="currentColor"
            />
          </svg>
        ),
      },
    ],
    [t],
  );

  useEffect(() => {
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const filteredItems = items.filter((item) =>
    sourceType ? isConnectionAllowed(sourceType, item.type) : true
  );

  const menuW = 288;
  const menuH = 44 + filteredItems.length * 56;
  const clampedX = Math.min(x, window.innerWidth - menuW - 10);
  const clampedY = Math.min(y, window.innerHeight - menuH - 10);

  return (
    <div
      ref={ref}
      className="fixed z-[1000] animate-in zoom-in-95 origin-top-left duration-150"
      style={{ top: clampedY, left: clampedX }}
    >
      <Command
        className="bg-white/85 dark:bg-[#1e1e1e]/85 border border-zinc-200 dark:border-zinc-700/60 backdrop-blur-xl rounded-2xl p-1 min-w-72 w-fit max-h-[500px] overflow-hidden shadow-xl"
        loop
      >
        <Command.List>
          <Command.Group
            heading={
              <div className="text-sm py-1 px-2 text-zinc-400 dark:text-zinc-500 font-medium">
                {t("connectAndGenerate")}
              </div>
            }
          >
            {filteredItems.map((item) => (
              <Command.Item
                key={item.type}
                value={`${item.label}${item.desc}`}
                onSelect={() => {
                  onSelect(item.type, sourceNodeId);
                  onClose();
                }}
                className="group w-full h-[52px] text-base cursor-pointer rounded-xl p-2 transition-all duration-200 flex items-center gap-2 text-zinc-700 dark:text-zinc-300 data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-700/50 outline-none"
              >
                <div className="h-full aspect-square rounded-md text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 flex items-center justify-center transition-all duration-200 [&_svg]:text-zinc-700 dark:[&_svg]:text-zinc-200">
                  {item.icon}
                </div>
                <div className="flex-1 h-full flex flex-col justify-between overflow-hidden">
                  <span className="font-medium text-sm text-zinc-800 dark:text-zinc-200 leading-none translate-y-[10px] group-data-[selected=true]:translate-y-0 group-hover:translate-y-0 transition-transform duration-200 inline-flex items-center gap-1">
                    {item.label}
                  </span>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-none opacity-0 group-data-[selected=true]:opacity-100 group-hover:opacity-100 transition-all duration-200 truncate">
                    {item.desc}
                  </p>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
