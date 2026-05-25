"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocalePath } from "@/hooks/use-locale-path";
import { useDagStore } from "@/stores/dag-store";
import { Loader2, Square, Check, CloudOff, X, ArrowLeft, LayoutTemplate, Share2 } from "lucide-react";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface CanvasTopBarProps {
  projectId?: string;
  projectName?: string;
  saveStatus?: SaveStatus;
  onRename?: (name: string) => void;
  onShare?: () => void;
}

export function CanvasTopBar({ projectId, projectName = "Untitled", saveStatus = "saved", onRename, onShare }: CanvasTopBarProps) {
  const router = useRouter();
  const lp = useLocalePath();
  const t = useTranslations("canvas");
  const dagRun = useDagStore((s) => s.currentRun);
  const isExecuting = useDagStore((s) => s.isExecuting);
  const dagError = useDagStore((s) => s.error);
  const cancelRun = useDagStore((s) => s.cancelRun);

  const [editName, setEditName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [xins, setXins] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplCategory, setTplCategory] = useState("");
  const [tplCategoryInput, setTplCategoryInput] = useState("");
  const [tplCatDropOpen, setTplCatDropOpen] = useState(false);
  const [tplCategories, setTplCategories] = useState<{ id: string; name: string; name_en: string | null }[]>([]);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplToast, setTplToast] = useState<string | null>(null);

  const refreshBalance = useCallback(() => {
    fetch("/api/billing/balance").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.balance != null) setXins(d.balance);
    });
  }, []);

  useEffect(() => {
    refreshBalance();
    window.addEventListener("xinyu:balance-changed", refreshBalance);
    return () => window.removeEventListener("xinyu:balance-changed", refreshBalance);
  }, [refreshBalance]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.user?.role === "ADMIN") setIsAdmin(true);
    });
  }, []);

  useEffect(() => {
    setEditName(projectName);
  }, [projectName]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== projectName) {
      onRename?.(trimmed);
    } else {
      setEditName(projectName);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-30 flex items-center">
      {/* Editable project name */}
      <div className="flex items-center relative">
        <input
          ref={inputRef}
          className="flex h-9 rounded-md bg-transparent px-3 py-1 text-base text-zinc-800 dark:text-white border-none shadow-none ring-0 outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 md:text-sm !text-base w-48 focus:w-64 transition-all"
          placeholder={t("namePlaceholder")}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitRename(); inputRef.current?.blur(); }
            if (e.key === "Escape") { setEditName(projectName); inputRef.current?.blur(); }
          }}
        />
      </div>

      {/* Right side: DAG controls (positioned absolute right) */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        {projectId && isExecuting && (
          <button
            onClick={cancelRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm"
          >
            <Square size={14} /> {t("stop")}
          </button>
        )}

        {dagRun && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {dagRun.status === "RUNNING" ? t("layer", { current: dagRun.currentLayer + 1, total: dagRun.totalLayers }) : dagRun.status}
          </span>
        )}
        {dagError && (
          <span className="text-xs text-red-400 max-w-40 truncate" title={dagError}>
            {dagError}
          </span>
        )}

        {saveStatus === "saving" ? (
          <span className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-transparent text-sm text-zinc-500 dark:text-zinc-400 select-none backdrop-blur shadow-md">
            <Loader2 size={14} className="animate-spin" />
            {t("saving")}
          </span>
        ) : saveStatus === "error" ? (
          <span className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-red-55 dark:bg-red-500/10 border border-red-100 dark:border-transparent text-sm text-red-500 dark:text-red-400 select-none backdrop-blur shadow-md">
            <CloudOff size={14} />
            {t("saveError")}
          </span>
        ) : saveStatus === "unsaved" ? (
          <span className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-transparent text-sm text-amber-600 dark:text-amber-400 select-none backdrop-blur shadow-md">
            <span className="size-1.5 rounded-full bg-amber-500" />
            {t("unsaved")}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-transparent text-sm text-zinc-500 dark:text-zinc-400 select-none backdrop-blur shadow-md">
            <Check size={14} />
            {t("saved")}
          </span>
        )}

        {isAdmin && projectId && (
          <button
            onClick={() => {
              setTplName(projectName);
              setTplDesc("");
              setTplCategory("");
              setTplCategoryInput("");
              setTplCatDropOpen(false);
              setTplDialogOpen(true);
              fetch("/api/templates/categories").then(r => r.ok ? r.json() : null).then(d => {
                if (d?.categories) setTplCategories(d.categories);
              });
            }}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-white text-sm transition-colors cursor-pointer backdrop-blur shadow-md"
            title={t("saveAsTemplate")}
          >
            <LayoutTemplate size={14} />
            <span className="hidden sm:inline">{t("saveAsTemplate")}</span>
          </button>
        )}

        {projectId && onShare && (
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-white text-sm transition-colors cursor-pointer backdrop-blur shadow-md"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">{t("share")}</span>
          </button>
        )}


      </div>

      {/* Save as Template Dialog */}
      {tplDialogOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center"
          onMouseDown={() => setTplDialogOpen(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl border border-zinc-700/60 bg-[#111]/95 backdrop-blur-xl shadow-2xl p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-4">{t("saveAsTemplate")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">{t("templateName")}</label>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  maxLength={200}
                  className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">{t("templateDesc")}</label>
                <textarea
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/20 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">{t("templateCategory")}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={tplCategoryInput}
                    onChange={(e) => { setTplCategoryInput(e.target.value); setTplCategory(""); setTplCatDropOpen(true); }}
                    onFocus={() => setTplCatDropOpen(true)}
                    placeholder={t("templateCategoryPlaceholder")}
                    className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-white/20"
                  />
                  {tplCatDropOpen && tplCategories.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-zinc-900 border border-white/10 shadow-xl max-h-40 overflow-y-auto z-10">
                      {tplCategories
                        .filter((c) => !tplCategoryInput || c.name.toLowerCase().includes(tplCategoryInput.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setTplCategory(c.id); setTplCategoryInput(c.name); setTplCatDropOpen(false); }}
                            className="w-full text-left px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                          >
                            {c.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                {tplCategoryInput && !tplCategory && (
                  <p className="text-[10px] text-white/30 mt-1">{t("templateCategoryNew")}</p>
                )}
              </div>
            </div>
            {tplToast && (
              <div className="mt-3 text-xs text-[#CCFF00]">{tplToast}</div>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setTplDialogOpen(false)}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-5 text-sm text-white/70 hover:bg-white/10 transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                onClick={async () => {
                  if (!tplName.trim() || !projectId) return;
                  setTplSaving(true);
                  try {
                    // If user typed a new category name (no existing ID selected), create it first
                    let categoryId = tplCategory || undefined;
                    if (!categoryId && tplCategoryInput.trim()) {
                      const catRes = await fetch("/api/templates/categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: tplCategoryInput.trim() }),
                      });
                      if (catRes.ok) {
                        const catData = await catRes.json();
                        categoryId = catData.category?.id;
                      }
                    }
                    const canvasRes = await fetch(`/api/projects/${projectId}/canvas`);
                    if (!canvasRes.ok) throw new Error("Failed to fetch canvas");
                    const canvasJson = await canvasRes.json();
                    const canvasData = canvasJson.canvas_data ?? { nodes: [], edges: [] };
                    // Extract first media thumbnail from nodes
                    let thumbnail: string | undefined;
                    for (const node of (canvasData.nodes ?? [])) {
                      const d = node.data;
                      if (!d) continue;
                      const url = d.thumbnailUrl || d.imageUrl || d.videoThumbnailUrl;
                      if (url && typeof url === "string" && (url.startsWith("http") || url.startsWith("/"))) {
                        thumbnail = url;
                        break;
                      }
                    }
                    const res = await fetch("/api/templates", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: tplName.trim(),
                        description: tplDesc.trim() || undefined,
                        canvas_data: canvasData,
                        category_id: categoryId,
                        thumbnail,
                        is_public: true,
                      }),
                    });
                    if (res.ok) {
                      setTplToast(t("templateSaved"));
                      setTimeout(() => { setTplDialogOpen(false); setTplToast(null); }, 1500);
                    } else {
                      const err = await res.json();
                      setTplToast(err.error?.message ?? "Failed");
                    }
                  } catch {
                    setTplToast("Network error");
                  } finally {
                    setTplSaving(false);
                  }
                }}
                disabled={tplSaving || !tplName.trim()}
                className="h-9 rounded-lg bg-[#CCFF00] px-5 text-sm font-medium text-black hover:bg-[#CCFF00]/90 transition-colors disabled:opacity-50"
              >
                {tplSaving ? <Loader2 size={14} className="animate-spin" /> : t("saveTemplate")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
