"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _nextId = 0;
let _listener: ((t: ToastItem) => void) | null = null;

export function showToast(message: string, type: ToastType = "success") {
  _listener?.({ id: ++_nextId, message, type });
}

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <Check size={15} strokeWidth={2.5} />,
  info: <Info size={15} strokeWidth={2} />,
  warning: <AlertCircle size={15} strokeWidth={2} />,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: "text-emerald-400",
  info: "text-blue-400",
  warning: "text-amber-400",
};

function ToastEntry({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => setExiting(true), 2800);
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (exiting) {
      const t = setTimeout(() => onDone(item.id), 300);
      return () => clearTimeout(t);
    }
  }, [exiting, item.id, onDone]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[rgba(30,30,30,0.92)] px-4 py-2.5 shadow-lg backdrop-blur-xl transition-all duration-300 ${
        exiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
      }`}
      style={{ animation: exiting ? undefined : "toastIn 0.25s ease-out" }}
    >
      <span className={COLOR_MAP[item.type]}>{ICON_MAP[item.type]}</span>
      <span className="text-sm font-medium text-white/85">{item.message}</span>
    </div>
  );
}

export function GlobalToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _listener = (t) => setToasts((prev) => [...prev.slice(-4), t]);
    return () => { _listener = null; };
  }, []);

  const handleDone = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none flex flex-col items-end gap-2">
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {toasts.map((t) => (
        <ToastEntry key={t.id} item={t} onDone={handleDone} />
      ))}
    </div>,
    document.body,
  );
}
