"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { type NodeProps } from "@xyflow/react";
import type { CanvasNode } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { useUserStore } from "@/stores/user-store";
import { ArrowUp, MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

const BRAND = "#CCFF00";

/* ── Comment data shape ── */
export interface CommentEntry {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

/* ── Helpers ── */
type TFunc = (key: string, values?: Record<string, string | number | Date>) => string;

function timeAgo(iso: string, t: TFunc): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return t("justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  return t("daysAgo", { n: d });
}

const MAX_LEN = 200;

/* ── Pin icon (speech bubble) ── */
function CommentPinIcon({ count }: { count: number }) {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center cursor-pointer group">
      <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="drop-shadow-lg transition-transform group-hover:scale-110">
        <path
          d="M20 4C11.16 4 4 10.04 4 17.5C4 21.62 6.24 25.28 9.8 27.72L8 35L16.14 31.2C17.38 31.52 18.66 31.7 20 31.7C28.84 31.7 36 25.66 36 18.2C36 10.74 28.84 4 20 4Z"
          fill={BRAND}
        />
      </svg>
      {count > 0 && (
        <span className="absolute inset-0 flex items-center justify-center text-black text-[11px] font-bold select-none" style={{ paddingBottom: 3 }}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}

/* ── Avatar ── */
function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 rounded-full items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `${BRAND}22`, color: BRAND }}
    >
      {name?.charAt(0).toUpperCase() || "U"}
    </span>
  );
}

/* ── Floating dropdown (portal) ── */
function FloatingMenu({
  anchorRef,
  onEdit,
  onDelete,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("comment");
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.right });
  }, [anchorRef]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose, anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[100px]"
      style={{ top: pos.top, left: pos.left, transform: "translateX(-100%)" }}
    >
      <button
        className="nodrag w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/5 flex items-center gap-2 transition-colors"
        onClick={(e) => { e.stopPropagation(); onEdit(); onClose(); }}
      >
        <Pencil size={11} /> {t("edit")}
      </button>
      <div className="mx-2 border-t border-white/5" />
      <button
        className="nodrag w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2 transition-colors"
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
      >
        <Trash2 size={11} /> {t("delete")}
      </button>
    </div>,
    document.body,
  );
}

/* ── Single comment row ── */
function CommentRow({
  comment,
  isOwn,
  onDelete,
  onEdit,
}: {
  comment: CommentEntry;
  isOwn: boolean;
  onDelete: () => void;
  onEdit: (newText: string) => void;
}) {
  const t = useTranslations("comment");
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.setSelectionRange(editText.length, editText.length);
    }
  }, [editing]);

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    onEdit(trimmed);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(comment.text);
    setEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
    if (e.key === "Escape") { e.preventDefault(); handleCancelEdit(); }
  };

  return (
    <div className="flex gap-2.5 px-3 py-2 hover:bg-white/[0.03] transition-colors group">
      <Avatar name={comment.author} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[13px] text-white/90 truncate">{comment.author}</span>
            <span className="text-[11px] text-white/30 flex-shrink-0">{timeAgo(comment.createdAt, t)}</span>
          </div>
          {isOwn && !editing && (
            <>
              <button
                ref={menuBtnRef}
                className="nodrag h-5 w-5 p-0 flex items-center justify-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity text-white/40"
                onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
              >
                <MoreHorizontal size={13} />
              </button>
              {showMenu && (
                <FloatingMenu
                  anchorRef={menuBtnRef}
                  onEdit={() => setEditing(true)}
                  onDelete={onDelete}
                  onClose={() => setShowMenu(false)}
                />
              )}
            </>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={handleEditKeyDown}
              className="nodrag nowheel w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-[13px] leading-[1.5] text-white placeholder:text-white/25 outline-none resize-none min-h-[40px] transition focus:outline-none focus:ring-0"
              style={{ borderColor: `${BRAND}60` }}
              maxLength={MAX_LEN}
            />
            <div className="flex items-center justify-end gap-1.5 mt-1">
              <button
                className="nodrag h-6 px-2 rounded text-[11px] text-white/40 hover:text-white/70 hover:bg-white/5 flex items-center gap-1 transition-colors"
                onClick={handleCancelEdit}
              >
                <X size={11} /> {t("cancel")}
              </button>
              <button
                className="nodrag h-6 px-2 rounded text-[11px] flex items-center gap-1 transition-colors disabled:opacity-40"
                style={{ color: BRAND }}
                disabled={!editText.trim() || editText.trim() === comment.text}
                onClick={handleSaveEdit}
              >
                <Check size={11} /> {t("save")}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[13px] leading-[1.5] text-white/70 whitespace-pre-wrap break-words">{comment.text}</div>
        )}
      </div>
    </div>
  );
}

/* ── Input bar (shared by pre-creation and reply) ── */
function CommentInput({
  placeholder,
  onSubmit,
  autoFocus,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("comment");
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
        onKeyDown={handleKeyDown}
        className="nodrag nowheel w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/25 outline-none resize-none min-h-[80px] transition focus:outline-none focus:ring-0"
        style={{ borderColor: autoFocus ? `${BRAND}50` : undefined }}
        placeholder={placeholder}
        maxLength={MAX_LEN}
        onFocus={(e) => { e.currentTarget.style.borderColor = `${BRAND}80`; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
      />
      <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
        <span className="text-xs text-white/25">{text.length}/{MAX_LEN}</span>
        <button
          className="nodrag rounded-full p-1.5 bg-white hover:bg-white/80 text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!text.trim()}
          onClick={handleSubmit}
          title={t("sendTitle")}
        >
          <ArrowUp size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Main CommentNode ── */
function CommentNodeInner({ id, data }: NodeProps<CanvasNode>) {
  const comments: CommentEntry[] = (data.comments as CommentEntry[] | undefined) ?? [];
  const [expanded, setExpanded] = useState(comments.length === 0);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNodeById = useCanvasStore((s) => s.deleteNodeById);
  const updateNodeSize = useCanvasStore((s) => s.updateNodeSize);
  const user = useUserStore((s) => s.user);
  const fetchUser = useUserStore((s) => s.fetchUser);
  useEffect(() => { fetchUser(); }, [fetchUser]);
  const t = useTranslations("comment");
  const nickname = user?.nickname || t("anonymous");
  const scrollRef = useRef<HTMLDivElement>(null);

  const addComment = useCallback(
    (text: string) => {
      const entry: CommentEntry = {
        id: crypto.randomUUID(),
        author: nickname,
        text,
        createdAt: new Date().toISOString(),
      };
      const next = [...comments, entry];
      updateNodeData(id, { comments: next });

      if (comments.length === 0) {
        updateNodeSize(id, 48, 48);
        setExpanded(false);
      }

      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    },
    [id, comments, nickname, updateNodeData, updateNodeSize],
  );

  const editComment = useCallback(
    (commentId: string, newText: string) => {
      const next = comments.map((c) =>
        c.id === commentId ? { ...c, text: newText } : c,
      );
      updateNodeData(id, { comments: next });
    },
    [id, comments, updateNodeData],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      const next = comments.filter((c) => c.id !== commentId);
      updateNodeData(id, { comments: next });
      if (next.length === 0) {
        deleteNodeById(id);
      }
    },
    [id, comments, updateNodeData, deleteNodeById],
  );

  const handlePinClick = useCallback(() => {
    if (!expanded) {
      updateNodeSize(id, 300, 220);
      setExpanded(true);
    }
  }, [expanded, id, updateNodeSize]);

  const handleCollapse = useCallback(() => {
    if (comments.length > 0) {
      updateNodeSize(id, 48, 48);
      setExpanded(false);
    }
  }, [comments.length, id, updateNodeSize]);

  // Pre-creation: no comments yet → show textarea
  if (comments.length === 0) {
    return (
      <div className="relative rounded-xl shadow-2xl" style={{ width: 300, background: "#141414", border: `1px solid ${BRAND}40` }}>
        <div className="p-3">
          <CommentInput
            placeholder={t("inputPlaceholder")}
            onSubmit={addComment}
            autoFocus
          />
        </div>
      </div>
    );
  }

  // Collapsed: show pin
  if (!expanded) {
    return (
      <div
        className="nodrag"
        onClick={handlePinClick}
        style={{ width: 48, height: 48 }}
      >
        <CommentPinIcon count={comments.length} />
      </div>
    );
  }

  // Expanded: show thread
  return (
    <div className="rounded-xl shadow-2xl" style={{ width: 300, background: "#141414", border: `1px solid ${BRAND}40` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-xs font-medium" style={{ color: BRAND }}>{t("commentsCount", { count: comments.length })}</span>
        <button
          className="nodrag text-[11px] text-white/30 hover:text-white/60 transition-colors px-1"
          onClick={handleCollapse}
        >
          {t("collapse")}
        </button>
      </div>

      {/* Comments list */}
      <div className="flex flex-col overflow-hidden rounded-b-xl nowheel">
        <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 280 }}>
          {comments.map((c, i) => (
            <div key={c.id}>
              {i > 0 && <div className="mx-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }} />}
              <CommentRow
                comment={c}
                isOwn={c.author === nickname}
                onEdit={(newText) => editComment(c.id, newText)}
                onDelete={() => deleteComment(c.id)}
              />
            </div>
          ))}
        </div>

        {/* Reply input */}
        <div className="flex-shrink-0 p-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <CommentInput placeholder={t("replyPlaceholder")} onSubmit={addComment} />
        </div>
      </div>
    </div>
  );
}

export const CommentNode = memo(CommentNodeInner);
