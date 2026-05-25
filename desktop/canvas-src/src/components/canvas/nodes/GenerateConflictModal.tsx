"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

type ExistingContentKind = "image" | "video" | "audio" | "text";

interface GenerateConflictModalProps {
  open: boolean;
  contentKind: ExistingContentKind;
  onCancel: () => void;
  onOverwrite: () => void;
  onCreateNew: () => void;
}

export function GenerateConflictModal({
  open,
  contentKind,
  onCancel,
  onOverwrite,
  onCreateNew,
}: GenerateConflictModalProps) {
  const t = useTranslations("canvas");
  const tc = useTranslations("common");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10010] bg-black/65 backdrop-blur-[2px] p-4 flex items-center justify-center"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-zinc-700/70 bg-[#1f1f21] shadow-[0_25px_80px_rgba(0,0,0,0.7)] p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-base font-medium text-zinc-100">
          {t("generateConflictTitle", { content: t(`generateConflictKind.${contentKind}`) })}
        </div>
        <div className="mt-2 text-sm text-zinc-400 leading-relaxed">
          {t("generateConflictDescription")}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancel();
            }}
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              onOverwrite();
            }}
          >
            {t("generateConflictOverwrite")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              onCreateNew();
            }}
          >
            {t("generateConflictCreateNew")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
