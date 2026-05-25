"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { History, Plus, RotateCcw, Trash2, X, Loader2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import type { SerializedCanvas } from "@/types/canvas";

interface Snapshot {
  id: string;
  name: string;
  version: number;
  created_at: string;
}

interface SnapshotPanelProps {
  projectId: string;
  onRestore: (canvasData: SerializedCanvas, version: number) => void;
}

export function SnapshotPanel({ projectId, onRestore }: SnapshotPanelProps) {
  const t = useTranslations("snapshots");
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) fetchSnapshots();
  }, [open, fetchSnapshots]);

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNewName("");
        setShowCreate(false);
        fetchSnapshots();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    const res = await fetch(`/api/projects/${projectId}/snapshots/${snapshotId}`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      const canvasRes = await fetch(`/api/projects/${projectId}/canvas`);
      if (canvasRes.ok) {
        const canvasData = await canvasRes.json();
        onRestore(canvasData.canvas_data, canvasData.version);
      }
      setOpen(false);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    await fetch(`/api/projects/${projectId}/snapshots/${snapshotId}`, {
      method: "DELETE",
    });
    fetchSnapshots();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm transition-colors cursor-pointer shadow-md backdrop-blur"
        title={t("title")}
      >
        <History size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-72 bg-white/95 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-xl overflow-hidden z-50 text-zinc-800 dark:text-white backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("title")}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCreate(true)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                title={t("create")}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {showCreate && (
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex gap-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setShowCreate(false);
                }}
                placeholder={t("namePlaceholder")}
                className="flex-1 h-8 px-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-800 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="h-8 px-3 rounded-lg bg-zinc-900 dark:bg-white/10 hover:bg-zinc-800 dark:hover:bg-white/15 text-sm text-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : t("save")}
              </button>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-zinc-400 dark:text-zinc-500" />
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
                {t("noSnapshots")}
              </div>
            ) : (
              snapshots.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{s.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {formatTime(s.created_at)} · v{s.version}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRestore(s.id)}
                      className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer"
                      title={t("restore")}
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                      title={t("delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
