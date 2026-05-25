"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Plus, MessageCircle, FolderOpen, Film, Settings } from "lucide-react";
import { useCommentModeStore } from "@/stores/comment-mode-store";

function DockTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 pointer-events-none z-[100]">
          <span className="whitespace-nowrap rounded-lg bg-white dark:bg-[#232323] border border-zinc-200 dark:border-white/10 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-lg">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

interface DockToolbarProps {
  onOpenAddMenu: (x: number, y: number) => void;
  onToggleAssets?: () => void;
  assetsOpen?: boolean;
  onToggleMaterials?: () => void;
  materialsOpen?: boolean;
  onToggleStoryboard?: () => void;
  storyboardOpen?: boolean;
  onToggleMarketing?: () => void;
  marketingOpen?: boolean;
  onOpenSettings?: () => void;
}

function ClapperboardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12.296 3.464 3.02 3.956" />
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="m6.18 5.276 3.1 3.899" />
    </svg>
  );
}

export function DockToolbar({ onOpenAddMenu, onToggleAssets, assetsOpen, onToggleMaterials, materialsOpen, onToggleStoryboard, storyboardOpen, onToggleMarketing, marketingOpen, onOpenSettings }: DockToolbarProps) {
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("canvas");
  const tComment = useTranslations("comment");
  const commentActive = useCommentModeStore((s) => s.active);

  const handleAddClick = () => {
    if (!addBtnRef.current) return;
    const rect = addBtnRef.current.getBoundingClientRect();
    onOpenAddMenu(rect.right + 8, rect.top);
  };

  return (
    <>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-50">
        <div className="flex flex-col gap-1 items-center rounded-[2rem] bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-xl border border-zinc-200/80 dark:border-white/10 p-1.5 shadow-xl">
          {/* Add node button */}
          <DockTooltip label={t("addNode")}>
            <button
              ref={addBtnRef}
              onClick={handleAddClick}
              className="size-10 flex items-center justify-center rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black shadow-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              <Plus size={20} />
            </button>
          </DockTooltip>

          {/* Tool icons */}
          <div className="w-full flex flex-col gap-1 pt-1 px-px">
            <DockTooltip label={t("materialLibrary")}>
              <button
                onClick={onToggleMaterials}
                className={`rounded-md w-full aspect-square hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors ${materialsOpen ? "text-zinc-900 bg-zinc-100 dark:text-white dark:bg-white/10" : "text-zinc-400 dark:text-zinc-500"}`}
                data-testid="canvas-dockbar-materials-btn"
                data-library-toggle="true"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, aspectRatio: "1/1" }}>
                  <path d="M13.2094 8.05177C13.6634 8.05177 14.0988 8.23211 14.4198 8.55312C14.7408 8.87413 14.9211 9.30951 14.9211 9.76348V15.3265C14.9211 15.7805 14.7408 16.2159 14.4198 16.5369C14.0988 16.8579 13.6634 17.0382 13.2094 17.0382H3.79505C3.34108 17.0382 2.9057 16.8579 2.58469 16.5369C2.26368 16.2159 2.08334 15.7805 2.08334 15.3265V7.62385C2.08334 7.16987 2.26368 6.73449 2.58469 6.41349C2.9057 6.09248 3.34108 5.91214 3.79505 5.91214H6.36261C6.56191 5.91214 6.75847 5.95854 6.93673 6.04767C7.11499 6.1368 7.27005 6.26621 7.38963 6.42565L7.90315 7.53826C8.02273 7.6977 8.17779 7.82711 8.35605 7.91624C8.53431 8.00537 8.73087 8.05177 8.93017 8.05177H13.2094Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M17.4153 13.5414C17.7363 13.2204 17.9167 12.785 17.9167 12.331V6.768C17.9167 6.31403 17.7363 5.87865 17.4153 5.55764C17.0943 5.23663 16.6589 5.05629 16.2049 5.05629H11.9257C11.7264 5.05629 11.5298 5.00989 11.3516 4.92076C11.1733 4.83163 11.0182 4.70222 10.8987 4.54278L10.3851 3.43017C10.2656 3.27073 10.1105 3.14132 9.93224 3.05219C9.75398 2.96306 9.55742 2.91666 9.35812 2.91666H6.79056C6.33659 2.91666 5.90121 3.097 5.5802 3.418" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </DockTooltip>
            <DockTooltip label={t("projectAssets")}>
              <button
                onClick={onToggleAssets}
                className={`rounded-md w-full aspect-square hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors ${assetsOpen ? "text-zinc-900 bg-zinc-100 dark:text-white dark:bg-white/10" : "text-zinc-400 dark:text-zinc-500"}`}
              >
                <FolderOpen size={18} />
              </button>
            </DockTooltip>
            <DockTooltip label={tComment("tooltip")}>
              <button
                onClick={() => useCommentModeStore.getState().toggle()}
                className={`rounded-md w-full aspect-square hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors ${commentActive ? "text-zinc-900 bg-zinc-100 dark:text-white dark:bg-white/10" : "text-zinc-400 dark:text-zinc-500"}`}
              >
                <MessageCircle size={18} />
              </button>
            </DockTooltip>
            {onToggleStoryboard && (
              <DockTooltip label={t("storyboardPanel")}>
                <button
                  onClick={onToggleStoryboard}
                  className={`rounded-md w-full aspect-square hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors ${storyboardOpen ? "text-lime-600 bg-lime-100/50 dark:text-[#CCFF00] dark:bg-[#CCFF00]/10" : "text-zinc-400 dark:text-zinc-500"}`}
                >
                  <ClapperboardIcon size={18} />
                </button>
              </DockTooltip>
            )}
            {onToggleMarketing && (
              <DockTooltip label={t("marketingPanel")}>
                <button
                  onClick={onToggleMarketing}
                  className={`rounded-md w-full aspect-square hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors ${marketingOpen ? "text-lime-600 bg-lime-100/50 dark:text-[#CCFF00] dark:bg-[#CCFF00]/10" : "text-zinc-400 dark:text-zinc-500"}`}
                >
                  <Film size={18} />
                </button>
              </DockTooltip>
            )}
            {onOpenSettings && (
              <DockTooltip label="API 接口设置">
                <button
                  onClick={onOpenSettings}
                  className="rounded-md w-full aspect-square text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 flex justify-center items-center cursor-pointer transition-colors"
                >
                  <Settings size={18} />
                </button>
              </DockTooltip>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
