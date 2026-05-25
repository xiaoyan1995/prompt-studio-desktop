"use client";

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useStore } from "@xyflow/react";
import type { Editor } from "@tiptap/react";
import { Check, Copy, X } from "lucide-react";
import type { NodeData } from "@/types/canvas";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { TipTapEditor } from "../../TipTapEditor";
import { TextToolbar } from "../../NodeToolbars";
import { GenerateConflictModal } from "../../GenerateConflictModal";
import type { ActiveViewProps } from "../../plugin-types";

const LazyTextGenPanel = lazy(() => import("../../panels/TextGenPanel").then((m) => ({ default: m.TextGenPanel })));

function toErrorKey(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("content policy")) return "errContentSafety";
  if (lower.includes("insufficient_balance") || lower.includes("余额不足")) return "errInsufficientBalance";
  if (lower.includes("concurrency")) return "errConcurrency";
  if (lower.includes("timeout") || lower.includes("timed out")) return "errTimeout";
  if (lower.includes("sse connection lost")) return "errConnectionLost";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "errRateLimit";
  return "errGenericFailed";
}

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

export function TextActiveView({ id, data, updaters, connectedRefs }: ActiveViewProps) {
  const t = useTranslations("canvas");
  const inverseZoom = 1 / useStore(zoomSelector);
  const thisNode = useCanvasStore((s) => s._nodeMap.get(id));
  const textConfig = NODE_TYPE_CONFIGS.text;
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [isGenerating, setIsGenerating] = useState(String(data.status) === "running");
  const [isGenerateConflictOpen, setIsGenerateConflictOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isCopiedInModal, setIsCopiedInModal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const modalCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTextOutput = String(data.content ?? "").replace(/<[^>]*>/g, "").trim().length > 0;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; editor: Editor };
      if (detail.nodeId === id) setEditorInstance(detail.editor);
    };
    window.addEventListener("xinyu:text-editor-ready", handler);
    return () => window.removeEventListener("xinyu:text-editor-ready", handler);
  }, [id]);

  useEffect(() => {
    if (!isTextModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsTextModalOpen(false);
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTextModalOpen]);

  useEffect(() => {
    return () => { if (modalCopyTimerRef.current) clearTimeout(modalCopyTimerRef.current); };
  }, []);

  const runTextGenerate = useCallback(async (targetNodeId: string, sourceData: NodeData, streamToCurrentEditor: boolean) => {
    const prompt = String(sourceData.prompt ?? "").trim();
    if (!prompt || isGenerating) return;

    const modelId = String(sourceData.model_id || "deepseek/deepseek-v3.2");
    const updateTarget = (payload: Partial<NodeData>) => {
      if (targetNodeId === id) updaters.updateData(payload);
      else useCanvasStore.getState().updateNodeData(targetNodeId, payload);
    };

    setIsGenerating(true);
    updateTarget({ status: "running", content: "", errorMessage: undefined });

    if (streamToCurrentEditor && editorInstance) editorInstance.commands.clearContent();

    const controller = new AbortController();
    abortRef.current = controller;

    const mediaUrls = [
      ...connectedRefs.images.map((url) => ({ url, type: "image" as const })),
      ...connectedRefs.videos.map((url) => ({ url, type: "video" as const })),
    ];

    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, prompt, media: mediaUrls.length > 0 ? mediaUrls : undefined, projectId: useCanvasStore.getState().projectId, nodeId: targetNodeId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text && accumulated.length < 3000) {
              accumulated += parsed.text;
              if (accumulated.length > 3000) accumulated = accumulated.slice(0, 3000);
              updateTarget({ content: accumulated });
              if (streamToCurrentEditor && editorInstance) editorInstance.commands.setContent(accumulated);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      updateTarget({ content: accumulated, status: "succeeded" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        updateTarget({ status: "idle" });
      } else {
        const errKey = err instanceof Error ? toErrorKey(err.message) : "errGenericFailed";
        updateTarget({ status: "failed", errorMessage: errKey });
        window.dispatchEvent(new Event("xinyu:balance-changed"));
        window.dispatchEvent(new Event("xinyu:save-now"));
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [id, isGenerating, editorInstance, updaters, connectedRefs]);

  const handleRemoveRef = useCallback((url: string) => {
    const { _nodeMap } = useCanvasStore.getState();
    const myEdges = useCanvasStore.getState()._edgesByTarget.get(id) ?? [];
    for (const e of myEdges) {
      const src = _nodeMap.get(e.source);
      if (!src) continue;
      if (String(src.data?.imageUrl) === url) { updaters.deleteEdgeById(e.id); return; }
    }
  }, [id, updaters]);

  const createSiblingTextNode = useCallback(() => {
    const srcW = Number(thisNode?.style?.width ?? textConfig.defaultWidth);
    const srcH = Number(thisNode?.style?.height ?? textConfig.defaultHeight);
    const newX = (thisNode?.position.x ?? 0) + srcW + 80;
    const newY = thisNode?.position.y ?? 0;
    const newId = updaters.addNodeWithData(
      "text",
      newX,
      newY,
      {
        label: String(data.label ?? textConfig.label),
        prompt: String(data.prompt ?? ""),
        model_id: String(data.model_id ?? "deepseek/deepseek-v3.2"),
        content: "",
        status: "idle",
        errorMessage: undefined,
      },
      { w: srcW, h: srcH },
    );

    const incoming = useCanvasStore.getState()._edgesByTarget.get(id) ?? [];
    for (const edge of incoming) {
      updaters.addEdgeById(edge.source, newId);
    }
    return newId;
  }, [id, thisNode, textConfig, updaters, data]);

  const handleTextGenerate = useCallback(async () => {
    if (hasTextOutput) {
      setIsGenerateConflictOpen(true);
      return;
    }
    await runTextGenerate(id, data, true);
  }, [hasTextOutput, runTextGenerate, id, data]);

  const handleCopyModalText = useCallback(() => {
    const text = editorInstance?.getText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopiedInModal(true);
    if (modalCopyTimerRef.current) clearTimeout(modalCopyTimerRef.current);
    modalCopyTimerRef.current = setTimeout(() => setIsCopiedInModal(false), 1200);
  }, [editorInstance]);

  const textContent = String(data.content ?? "");

  return (
    <>
      {/* Toolbar above */}
      {!isTextModalOpen && (
        <TextToolbar inverseZoom={inverseZoom} editor={editorInstance} onOpenModal={() => setIsTextModalOpen(true)} />
      )}

      {/* Generation panel */}
      <Suspense fallback={null}>
        <LazyTextGenPanel
          prompt={String(data.prompt ?? "")}
          modelId={String(data.model_id ?? "")}
          onPromptChange={(v) => updaters.updateData({ prompt: v })}
          onModelChange={(v) => updaters.updateData({ model_id: v })}
          onGenerate={handleTextGenerate}
          isGenerating={isGenerating}
          inverseZoom={inverseZoom}
          imageNodes={connectedRefs.imageNodes}
          onRemoveRef={handleRemoveRef}
        />
      </Suspense>

      <GenerateConflictModal
        open={isGenerateConflictOpen}
        contentKind="text"
        onCancel={() => setIsGenerateConflictOpen(false)}
        onOverwrite={() => {
          setIsGenerateConflictOpen(false);
          void runTextGenerate(id, data, true);
        }}
        onCreateNew={() => {
          setIsGenerateConflictOpen(false);
          const newId = createSiblingTextNode();
          void runTextGenerate(newId, data, false);
        }}
      />

      {/* Text modal */}
      {isTextModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/65 backdrop-blur-[2px] p-4 flex items-center justify-center"
          onMouseDown={() => setIsTextModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full border-2 border-[#3F3F46] bg-[#272729] backdrop-blur-[88px] max-w-3xl xl:max-w-4xl 2xl:max-w-5xl h-[calc(100vh-100px)] p-2 flex flex-col gap-0 rounded-xl overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.7)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="relative w-full flex items-center justify-center">
              <div className="absolute left-3">
                <button
                  className="z-0 group/button relative flex items-center justify-center cursor-pointer focus-visible:outline-none text-xs transition-colors duration-300 text-zinc-300 hover:text-white rounded-md aspect-square h-7 w-7 p-0"
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyModalText(); }}
                >
                  {isCopiedInModal ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <div className="py-1">
                <TextToolbar inverseZoom={1} editor={editorInstance} modalMode />
              </div>
              <div className="absolute right-3">
                <button
                  className="z-0 group/button relative flex items-center justify-center cursor-pointer focus-visible:outline-none text-xs transition-colors duration-300 text-zinc-300 hover:text-white hover:bg-zinc-700 bg-tap-background-secondary rounded-md aspect-square h-7 w-7 p-0"
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsTextModalOpen(false); }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto w-full h-full"
            >
              <div className="w-full h-full">
                <TipTapEditor
                  content={textContent}
                  onUpdate={(html) => updaters.updateData({ content: html })}
                  onEditorReady={(e) => setEditorInstance(e)}
                  placeholder={t("startCreating")}
                  editable
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
