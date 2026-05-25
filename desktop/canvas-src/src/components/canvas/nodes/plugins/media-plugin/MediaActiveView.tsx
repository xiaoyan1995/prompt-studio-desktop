"use client";

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { showToast } from "@/components/ui/GlobalToast";
import { useTranslations } from "next-intl";
import { useStore } from "@xyflow/react";
import type { NodeType, NodeData } from "@/types/canvas";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { openFilePicker, uploadImageFile } from "@/lib/upload-client";
import { cameraSettingsToPrompt, type CameraSettings } from "../../CameraControl";
import { lightingSettingsToPrompt, type LightingSettings } from "../../LightingControl";
import type { InpaintMode } from "../../../InpaintModal";
import type { LightingToolSettings } from "../../../LightingToolModal";
import type { MultiAngleToolSettings } from "../../../MultiAngleToolModal";
import { ImageToolbar, VideoToolbar, type ComplianceStatus } from "../../NodeToolbars";
import { EnhancePanel } from "../../EnhancePanel";
import { VideoEnhancePanel } from "../../VideoEnhancePanel";
import { RemoveBgPanel } from "../../RemoveBgPanel";
import { fitNodeToRatio } from "../../node-constants";
import { GenerateConflictModal } from "../../GenerateConflictModal";
import { IMAGE_MODEL_MAX_REFS, DEFAULT_MAX_REFS } from "../../panel-shared";
import type { ActiveViewProps, ConnectedRefs, NodeUpdaters } from "../../plugin-types";
import type { ElementRef } from "../../PromptEditor";
import { extractMaterialUrls, stripMaterialMentions, autoRegisterToAssetLibrary } from "@/lib/material-utils";
import { toErrorKey } from "@/lib/error-keys";
import { useSession } from "next-auth/react";

const InpaintModal = lazy(() => import("../../../InpaintModal").then((m) => ({ default: m.InpaintModal })));
const LightingToolModal = lazy(() => import("../../../LightingToolModal").then((m) => ({ default: m.LightingToolModal })));
const MultiAngleToolModal = lazy(() => import("../../../MultiAngleToolModal").then((m) => ({ default: m.MultiAngleToolModal })));
const OutpaintModal = lazy(() => import("../../../OutpaintModal").then((m) => ({ default: m.OutpaintModal })));
const CropModal = lazy(() => import("../../../CropModal").then((m) => ({ default: m.CropModal })));
const AnnotateModal = lazy(() => import("../../../AnnotateModal").then((m) => ({ default: m.AnnotateModal })));
const GridSplitModal = lazy(() => import("../../../GridSplitModal").then((m) => ({ default: m.default })));
const FrameCaptureModal = lazy(() => import("../../../FrameCaptureModal").then((m) => ({ default: m.FrameCaptureModal })));
const LazyImageGenPanel = lazy(() => import("../../panels/ImageGenPanel").then((m) => ({ default: m.ImageGenPanel })));
const LazyVideoGenPanel = lazy(() => import("../../panels/VideoGenPanel").then((m) => ({ default: m.VideoGenPanel })));

type VideoRefMode = "startEnd" | "imageRef" | "videoEdit" | "videoRef";

function useSSEGeneration(
  jobIdRef: { current: string | null },
  updaters: NodeUpdaters,
  targetId: string,
  opts: {
    onSuccess: (msg: Record<string, unknown>) => void;
    maxRetries?: number;
    retryDelayMs?: number;
  },
) {
  return useCallback(() => {
    const jobId = jobIdRef.current;
    if (!jobId) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let retries = 0;
      const maxRetries = opts.maxRetries ?? 3;
      const retryDelay = opts.retryDelayMs ?? 2000;
      function connectSSE() {
        const es = new EventSource(`/api/jobs/${jobId}/sse`);
        es.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.status === "SUCCEEDED" || msg.status === "PARTIAL_SUCCESS") {
              es.close();
              opts.onSuccess(msg);
              resolve();
            } else if (msg.status === "FAILED") {
              es.close();
              reject(new Error(msg.error || "Generation failed"));
            }
          } catch { /* ignore */ }
        };
        es.onerror = () => {
          es.close();
          if (retries < maxRetries) {
            retries++;
            setTimeout(connectSSE, retryDelay * retries);
          } else {
            reject(new Error("SSE connection lost"));
          }
        };
      }
      connectSSE();
    });
  }, [jobIdRef, updaters, targetId, opts]);
}

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function readImageFileDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      const width = Number(img.naturalWidth || 0);
      const height = Number(img.naturalHeight || 0);
      cleanup();
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = objectUrl;
  });
}

export function MediaActiveView({ id, data, updaters, connectedRefs, promptEditorRef, elementRefsRef }: ActiveViewProps) {
  const t = useTranslations("canvas");
  const tImg = useTranslations("imageToolbar");
  const tVid = useTranslations("videoToolbar");
  const inverseZoom = 1 / useStore(zoomSelector);
  const nodeType = data.nodeType as NodeType;
  const config = NODE_TYPE_CONFIGS[nodeType];
  const isImageGen = nodeType === "image-gen";
  const isVideoGen = nodeType === "video-gen";
  const isUpscale = nodeType === "upscale";
  const isVideoUpscale = nodeType === "video-upscale";
  const isRembg = nodeType === "rembg";
  const isGenerative = isImageGen || isVideoGen;

  const thisNode = useCanvasStore((s) => s._nodeMap.get(id));
  const enterFocusEdit = useCanvasStore((s) => s.enterFocusEdit);

  const hasImage = !!data.imageUrl;
  const displayVideoUrl = String(data.videoUrl ?? "");
  const originalVideoUrl = String(data.originalVideoUrl ?? data.videoUrl ?? "");
  const hasVideo = displayVideoUrl.length > 0;
  const hasImageOutput = hasImage || !!data.originalUrl || (Array.isArray(data.imageUrls) && data.imageUrls.length > 0);
  const hasVideoOutput = hasVideo || originalVideoUrl.length > 0;

  const { data: _session } = useSession();
  const sessionRef = useRef(_session);
  sessionRef.current = _session;
  const [isGenerating, setIsGenerating] = useState(String(data.status) === "running");
  const [generateConflictKind, setGenerateConflictKind] = useState<"image" | "video" | null>(null);
  const [isInpaintOpen, setIsInpaintOpen] = useState(false);
  const [inpaintMode, setInpaintMode] = useState<InpaintMode>("redraw");
  const openDetailView = useCanvasStore((s) => s.openDetailView);
  const [isLightingToolOpen, setIsLightingToolOpen] = useState(false);
  const [isMultiAngleToolOpen, setIsMultiAngleToolOpen] = useState(false);
  const [isOutpaintOpen, setIsOutpaintOpen] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isAnnotateOpen, setIsAnnotateOpen] = useState(false);
  const [isGridSplitOpen, setIsGridSplitOpen] = useState(false);
  const [isFrameCaptureOpen, setIsFrameCaptureOpen] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus>(
    (data.complianceStatus as ComplianceStatus) ?? "idle",
  );
  const [videoComplianceStatus, setVideoComplianceStatus] = useState<ComplianceStatus>(
    (data.videoComplianceStatus as ComplianceStatus) ?? "idle",
  );

  useEffect(() => {
    const s = (data.complianceStatus as ComplianceStatus) ?? "idle";
    setComplianceStatus(s);
  }, [data.complianceStatus]);

  useEffect(() => {
    const s = (data.videoComplianceStatus as ComplianceStatus) ?? "idle";
    setVideoComplianceStatus(s);
  }, [data.videoComplianceStatus]);

  const handleCompliance = useCallback(async () => {
    const imgUrl = String(data.imageUrl ?? data.originalUrl ?? "");
    if (!imgUrl) return;
    setComplianceStatus("checking");
    updaters.updateData({ complianceStatus: "checking" });
    try {
      const res = await fetch("/api/assets/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imgUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        if (err.error === "COMPLIANCE_REJECTED") {
          setComplianceStatus("failed");
          updaters.updateData({ complianceStatus: "failed" });
          showToast(tImg("complianceRejectedToast"), "warning");
          return;
        }
        if (err.error === "URL_NOT_REACHABLE") {
          setComplianceStatus("error");
          updaters.updateData({ complianceStatus: "error" });
          showToast(tImg("complianceUrlUnreachableToast"), "warning");
          return;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { assetId } = await res.json();
      setComplianceStatus("passed");
      updaters.updateData({ complianceStatus: "passed", complianceAssetId: assetId });
    } catch {
      setComplianceStatus("error");
      updaters.updateData({ complianceStatus: "error" });
    }
  }, [data.imageUrl, data.originalUrl, updaters]);

  const handleVideoCompliance = useCallback(async () => {
    const vidUrl = String(data.originalVideoUrl ?? data.videoUrl ?? "");
    if (!vidUrl) return;
    setVideoComplianceStatus("checking");
    updaters.updateData({ videoComplianceStatus: "checking" });
    try {
      const res = await fetch("/api/assets/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: vidUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        if (err.error === "COMPLIANCE_REJECTED") {
          setVideoComplianceStatus("failed");
          updaters.updateData({ videoComplianceStatus: "failed" });
          showToast(tVid("complianceRejectedToast"), "warning");
          return;
        }
        if (err.error === "URL_NOT_REACHABLE") {
          setVideoComplianceStatus("error");
          updaters.updateData({ videoComplianceStatus: "error" });
          showToast(tVid("complianceUrlUnreachableToast"), "warning");
          return;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { assetId } = await res.json();
      setVideoComplianceStatus("passed");
      updaters.updateData({ videoComplianceStatus: "passed", videoComplianceAssetId: assetId });
    } catch {
      setVideoComplianceStatus("error");
      updaters.updateData({ videoComplianceStatus: "error" });
    }
  }, [data.videoUrl, data.originalVideoUrl, updaters]);

  // Escape key for detail view is handled at the page level

  useEffect(() => {
    const handler = (e: Event) => {
      const { sourceNodeId } = useCanvasStore.getState().focusEditState;
      if (sourceNodeId !== id) return;
      const detail = (e as CustomEvent).detail as ElementRef;
      if (detail && promptEditorRef?.current) {
        promptEditorRef.current.insertElement(detail);
      }
    };
    window.addEventListener("xinyu:focus-extract-done", handler);
    return () => window.removeEventListener("xinyu:focus-extract-done", handler);
  }, [id, promptEditorRef]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string };
      if (detail.nodeId !== id) return;
      (async () => {
        const file = await openFilePicker();
        if (!file) return;
        updaters.updateData({ status: "running" });
        try {
          const sourceDims = await readImageFileDimensions(file);
          const result = await uploadImageFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined, nodeId: id });
          updaters.updateData({
            imageUrl: result.url,
            originalUrl: result.originalUrl ?? result.url,
            thumbnailUrl: result.thumbnailUrl,
            thumbnailLevels: result.thumbnailLevels,
            originalImageUrls: [result.originalUrl ?? result.url],
            status: "idle",
            label: result.fileName,
          });
          if (sourceDims && sourceDims.width > 0 && sourceDims.height > 0) {
            const { w, h } = fitNodeToRatio(sourceDims.width, sourceDims.height);
            updaters.updateSize(w, h);
          }
        } catch (err: unknown) {
          const rawMsg = err instanceof Error ? err.message : "";
          const errKey = toErrorKey(rawMsg || "");
          updaters.updateData({ status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined });
        }
      })();
    };
    window.addEventListener("xinyu:reupload", handler);
    return () => window.removeEventListener("xinyu:reupload", handler);
  }, [id, updaters]);

  const resolveTextMentions = useCallback((rawPrompt: string): string => {
    if (connectedRefs.textNodes.length === 0) return rawPrompt;
    let resolved = rawPrompt;
    for (const tn of connectedRefs.textNodes) {
      const placeholder = `@${tn.label}`;
      if (resolved.includes(placeholder)) {
        const plainContent = (tn.content || "").replace(/<[^>]*>/g, "").trim();
        resolved = resolved.replace(placeholder, plainContent);
      }
    }
    return resolved;
  }, [connectedRefs.textNodes]);

  const buildApiPrompt = useCallback((promptJson: any, fallbackText: string): string => {
    if (!promptJson || !promptJson.content) return fallbackText;
    const textNodes = connectedRefs.textNodes;
    const textIdMap = new Map(textNodes.map((tn) => [tn.id, (tn.content || "").replace(/<[^>]*>/g, "").trim()]));
    const walkNode = (node: any): string => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "refMention" && node.attrs) {
        const label = node.attrs.label ?? "";
        const mentionId = node.attrs.id ?? "";
        const refType = node.attrs.refType ?? "image";
        if (refType === "text") {
          const nodeId = mentionId.startsWith("text-") ? mentionId.slice(5) : mentionId;
          return textIdMap.get(nodeId) ?? `@${label}`;
        }
        return `@${label}`;
      }
      if (node.type === "mention" && node.attrs) {
        return `@${node.attrs.id ?? node.attrs.label ?? ""}`;
      }
      if (node.content) {
        return node.content.map(walkNode).join("");
      }
      if (node.type === "hardBreak") return "\n";
      return "";
    };
    const paragraphs = (promptJson.content ?? []).map(walkNode);
    return paragraphs.join("\n").trim();
  }, [connectedRefs.textNodes]);

  const handleRemoveRef = useCallback((url: string, type: "image" | "video" | "audio") => {
    const { edges, _nodeMap } = useCanvasStore.getState();
    const myEdges = useCanvasStore.getState()._edgesByTarget.get(id) ?? [];
    for (const e of myEdges) {
      const src = _nodeMap.get(e.source);
      if (!src) continue;
      if (type === "audio" && String(src.data?.audioUrl) === url) { updaters.deleteEdgeById(e.id); return; }
      if (type === "video" && String(src.data?.videoUrl) === url) { updaters.deleteEdgeById(e.id); return; }
      if (type === "image" && String(src.data?.imageUrl) === url) { updaters.deleteEdgeById(e.id); return; }
    }
  }, [id, updaters]);

  const createSiblingGenerationNode = useCallback((type: "image-gen" | "video-gen") => {
    const srcNode = useCanvasStore.getState()._nodeMap.get(id);
    const srcW = Number(srcNode?.style?.width ?? config.defaultWidth);
    const srcH = Number(srcNode?.style?.height ?? config.defaultHeight);
    const newX = (srcNode?.position.x ?? 0) + srcW + 80;
    const newY = srcNode?.position.y ?? 0;
    const baseData: Partial<NodeData> = type === "image-gen"
      ? {
          label: String(data.label ?? config.label),
          prompt: String(data.prompt ?? ""),
          prompt_json: data.prompt_json,
          model_id: String(data.model_id ?? "nano-banana-2"),
          aspect_ratio: String(data.aspect_ratio ?? "16:9"),
          image_size: String(data.image_size ?? "2K"),
          count: Number(data.count) || 1,
          cameraSettings: data.cameraSettings,
          lightingSettings: data.lightingSettings,
          image_ref_order: (data.image_ref_order as number[]) ?? [],
          status: "idle",
          errorMessage: undefined,
        }
      : {
          label: String(data.label ?? config.label),
          prompt: String(data.prompt ?? ""),
          prompt_json: data.prompt_json,
          model_id: String(data.model_id ?? "kling-3-standard"),
          aspect_ratio: String(data.aspect_ratio ?? "16:9"),
          duration_s: Number(data.duration_s) || 5,
          generate_audio: data.generate_audio !== false,
          video_ref_mode: (data.video_ref_mode as "startEnd" | "imageRef" | "videoEdit" | "videoRef") ?? "imageRef",
          video_ref_order: (data.video_ref_order as number[]) ?? [],
          resolution: String(data.resolution ?? "720p"),
          fps: String(data.fps ?? "25"),
          status: "idle",
          errorMessage: undefined,
        };
    const newId = updaters.addNodeWithData(type, newX, newY, baseData, { w: srcW, h: srcH });

    const incoming = useCanvasStore.getState()._edgesByTarget.get(id) ?? [];
    for (const edge of incoming) {
      updaters.addEdgeById(edge.source, newId);
    }
    return newId;
  }, [id, data, config, updaters]);

  /* ── Image Generation ── */
  const runImageGenerate = useCallback(async (targetNodeId: string, sourceData: NodeData) => {
    const rawPrompt = String(sourceData.prompt ?? "").trim();
    if (!rawPrompt || isGenerating) return;

    const basePrompt = buildApiPrompt(sourceData.prompt_json, resolveTextMentions(rawPrompt));
    const aspectRatio = String(sourceData.aspect_ratio || "16:9");
    const imageSize = String(sourceData.image_size || "2K");
    const modelKey = String(sourceData.model_id || "nano-banana-2");
    const camSettings = sourceData.cameraSettings as CameraSettings | null;
    const litSettings = sourceData.lightingSettings as LightingSettings | null;
    const cameraSuffix = camSettings ? cameraSettingsToPrompt(camSettings) : "";
    const lightingSuffix = litSettings ? lightingSettingsToPrompt(litSettings) : "";

    const elements = elementRefsRef?.current ?? [];
    const elementSuffix = elements.length > 0 ? `Focus on: ${elements.map((e) => e.name).join(", ")}` : "";
    const suffixes = [cameraSuffix, lightingSuffix, elementSuffix].filter(Boolean).join(". ");
    const prompt = suffixes ? `${basePrompt}. ${suffixes}` : basePrompt;

    const maxRefs = IMAGE_MODEL_MAX_REFS[modelKey] ?? DEFAULT_MAX_REFS;
    const elementImageUrls = elements.map((e) => e.imageUrl).filter(Boolean);
    const materialUrls = extractMaterialUrls(sourceData.prompt_json);
    const imgRefOrder = (sourceData.image_ref_order as number[]) ?? [];
    const orderedConnImages = imgRefOrder.length === connectedRefs.images.length
      ? imgRefOrder.filter((i) => i < connectedRefs.images.length).map((i) => connectedRefs.images[i])
      : connectedRefs.images;
    const refImages = [...orderedConnImages, ...elementImageUrls, ...materialUrls.images].slice(0, maxRefs);

    const targetExisting = useCanvasStore.getState()._nodeMap.get(targetNodeId)?.data as NodeData | undefined;
    const prevImageUrl = targetExisting?.imageUrl as string | undefined;
    const prevThumbUrl = targetExisting?.thumbnailUrl as string | undefined;
    const prevOriginalUrl = targetExisting?.originalUrl as string | undefined;

    const updateTarget = (payload: Partial<NodeData>) => {
      if (targetNodeId === id) updaters.updateData(payload);
      else useCanvasStore.getState().updateNodeData(targetNodeId, payload);
    };
    const updateTargetSize = (w: number, h: number) => {
      if (targetNodeId === id) updaters.updateSize(w, h);
      else useCanvasStore.getState().updateNodeSize(targetNodeId, w, h);
    };

    setIsGenerating(true);
    updateTarget({ status: "running", errorMessage: undefined });

    try {
      const genCount = Number(sourceData.count) || 1;
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt, model_id: modelKey, aspect_ratio: aspectRatio, image_size: imageSize, node_id: targetNodeId, project_id: useCanvasStore.getState().projectId,
          ...(genCount > 1 ? { count: genCount } : {}),
          ...(refImages.length > 0 ? { reference_images: refImages } : {}),
          ...(sourceData.enable_pro ? { enable_pro: true } : {}),
          ...(sourceData.negative_prompt ? { negative_prompt: sourceData.negative_prompt } : {}),
          ...(sourceData.guidance_scale != null ? { guidance_scale: sourceData.guidance_scale } : {}),
          ...(sourceData.num_inference_steps != null ? { num_inference_steps: sourceData.num_inference_steps } : {}),
          ...(sourceData.seed != null ? { seed: sourceData.seed } : {}),
          ...(sourceData.output_quality ? { output_quality: sourceData.output_quality } : {}),
          ...(sourceData.thinking_level ? { thinking_level: sourceData.thinking_level } : {}),
          ...(sourceData.enable_web_search ? { enable_web_search: true } : {}),
          ...(sourceData.enable_image_search ? { enable_image_search: true } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        if (err.error === "CONCURRENCY_LIMIT") {
          showToast(t("concurrencyLimit", { running: err.running, limit: err.limit }));
          updaters.updateData({ status: "idle" });
          return;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { jobId } = await res.json();
      updateTarget({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));

      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.status === "SUCCEEDED" || msg.status === "PARTIAL_SUCCESS") {
                es.close();
                const assets = msg.assets as Array<{
                  url: string;
                  originalUrl?: string;
                  thumbnailUrl?: string;
                  thumbnailLevels?: { sm?: string; md?: string; lg?: string };
                }> | undefined;
                if (assets && assets.length > 0) {
                  const urls = assets.map((a) => a.url);
                  const thumbs = assets.map((a) => a.thumbnailUrl ?? a.url);
                  const originals = assets.map((a) => a.originalUrl ?? a.url);
                  updateTarget({
                    imageUrl: urls[0],
                    originalUrl: originals[0],
                    thumbnailUrl: thumbs[0],
                    thumbnailLevels: assets[0]?.thumbnailLevels,
                    imageUrls: urls,
                    originalImageUrls: originals,
                    thumbnailUrls: thumbs,
                    thumbnailLevelsList: assets.map((a) => a.thumbnailLevels ?? {}),
                    primaryImageIndex: 0,
                    status: "succeeded",
                    generatedAt: new Date().toISOString(),
                    revisedPrompt: msg.revised_prompt,
                    generated_model_id: modelKey,
                    generated_image_size: imageSize,
                    generated_aspect_ratio: aspectRatio,
                  });
                } else {
                  updateTarget({
                    imageUrl: msg.url,
                    originalUrl: msg.originalUrl ?? msg.url,
                    thumbnailUrl: msg.thumbnailUrl ?? msg.url,
                    thumbnailLevels: msg.thumbnailLevels,
                    imageUrls: [msg.url],
                    originalImageUrls: [msg.originalUrl ?? msg.url],
                    thumbnailUrls: [msg.thumbnailUrl ?? msg.url],
                    thumbnailLevelsList: [msg.thumbnailLevels ?? {}],
                    primaryImageIndex: 0,
                    status: "succeeded",
                    generatedAt: new Date().toISOString(),
                    revisedPrompt: msg.revised_prompt,
                    generated_model_id: modelKey,
                    generated_image_size: imageSize,
                    generated_aspect_ratio: aspectRatio,
                  });
                }
                const ratioStr = msg.aspect_ratio ?? aspectRatio;
                const [rw, rh] = ratioStr.split(":").map(Number);
                if (rw && rh) { const { w, h } = fitNodeToRatio(rw, rh); updateTargetSize(w, h); }
                // Auto-register generated images to project asset library
                const regUrl = (assets && assets.length > 0) ? (assets[0].originalUrl ?? assets[0].url) : (msg.originalUrl ?? msg.url);
                if (regUrl) {
                  autoRegisterToAssetLibrary({
                    url: regUrl,
                    type: "IMAGE",
                    projectId: useCanvasStore.getState().projectId,
                    title: data.label || "Canvas Image",
                    prompt: data.prompt || "",
                    model: modelKey || "",
                    aspect: aspectRatio || "",
                  });
                }
                window.dispatchEvent(new Event("xinyu:balance-changed"));
                window.dispatchEvent(new Event("xinyu:save-now"));
                resolve();
              } else if (msg.status === "FAILED") {
                es.close();
                reject(new Error(msg.error || "Generation failed"));
              }
            } catch { /* ignore */ }
          };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : "";
      const errKey = toErrorKey(rawMsg || "");
      updateTarget({
        status: "failed",
        errorMessage: errKey,
        errorDetail: rawMsg || undefined,
        imageUrl: prevImageUrl,
        originalUrl: prevOriginalUrl,
        thumbnailUrl: prevThumbUrl,
      });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
    } finally {
      setIsGenerating(false);
    }
  }, [id, isGenerating, updaters, connectedRefs.images, buildApiPrompt, resolveTextMentions, elementRefsRef, t]);

  const handleImageGenerate = useCallback(async () => {
    await runImageGenerate(id, data);
  }, [runImageGenerate, id, data]);

  /* ── Video Generation ── */
  const runVideoGenerate = useCallback(async (targetNodeId: string, sourceData: NodeData) => {
    const rawPromptText = String(sourceData.prompt ?? "").trim();
    if (!rawPromptText || isGenerating) return;

    const basePrompt = buildApiPrompt(sourceData.prompt_json, rawPromptText);
    const aspectRatio = String(sourceData.aspect_ratio || "16:9");
    const durationS = Number(sourceData.duration_s) || 5;
    const modelKey = String(sourceData.model_id || "kling-3-standard");
    const audioEnabled = sourceData.generate_audio !== false;
    const videoResolution = String(sourceData.resolution ?? "720p");
    const videoFps = String(sourceData.fps ?? "25");
    const refMode = (sourceData.video_ref_mode as string) || "imageRef";
    const refOrder = (sourceData.video_ref_order as number[]) ?? [];

    const materialUrls = extractMaterialUrls(sourceData.prompt_json);
    const rawImgRefs = [...connectedRefs.images, ...materialUrls.images];
    const reorderedConnImages = refOrder.length === connectedRefs.images.length
      ? refOrder.filter((i) => i < connectedRefs.images.length).map((i) => connectedRefs.images[i])
      : connectedRefs.images;
    const imgRefs = [...reorderedConnImages, ...materialUrls.images];
    const vidRefs = [...connectedRefs.videos, ...materialUrls.videos];
    const firstVideoRefNode = connectedRefs.videoNodes?.[0];
    const firstVideoRefUrl = firstVideoRefNode
      ? String(
          useCanvasStore.getState()._nodeMap.get(firstVideoRefNode.nodeId)?.data?.originalVideoUrl
            ?? firstVideoRefNode.url,
        )
      : vidRefs[0];
    const isSeedance2Model = modelKey === "seedance-2" || modelKey === "seedance-2-fast" || modelKey === "seedance-2-cli" || modelKey === "seedance-2-fast-cli";
    // Seedance 2.0 is multimodal — video refs go through normal generation, not video-edit
    const isVideoEditMode = vidRefs.length > 0 && (refMode === "videoEdit" || refMode === "videoRef") && !isSeedance2Model;

    // Collect all video ref URLs (use originalVideoUrl when available) and total duration
    const allVideoRefUrls: string[] = [];
    let refVideoDurationTotal = 0;
    if (vidRefs.length > 0) {
      const videoNodes = connectedRefs.videoNodes ?? [];
      for (let i = 0; i < vidRefs.length; i++) {
        const vNode = videoNodes[i];
        const nodeData = vNode ? useCanvasStore.getState()._nodeMap.get(vNode.nodeId)?.data : undefined;
        const origUrl = vNode
          ? String(nodeData?.originalVideoUrl ?? vNode.url)
          : vidRefs[i];
        if (origUrl) allVideoRefUrls.push(origUrl);
        const dur = Number(nodeData?.duration_s ?? 0);
        if (dur > 0) refVideoDurationTotal += dur;
      }
    }

    const targetExisting = useCanvasStore.getState()._nodeMap.get(targetNodeId)?.data as NodeData | undefined;
    const prevVideoUrl = targetExisting?.videoUrl as string | undefined;
    const prevOriginalVideoUrl = targetExisting?.originalVideoUrl as string | undefined;
    const prevThumbUrl = targetExisting?.thumbnailUrl as string | undefined;
    const updateTarget = (payload: Partial<NodeData>) => {
      if (targetNodeId === id) updaters.updateData(payload);
      else useCanvasStore.getState().updateNodeData(targetNodeId, payload);
    };
    const updateTargetSize = (w: number, h: number) => {
      if (targetNodeId === id) updaters.updateSize(w, h);
      else useCanvasStore.getState().updateNodeSize(targetNodeId, w, h);
    };

    // ── Auto-verify material @ref URLs for Seedance 2.0 compliance ──
    const skipCompliance = process.env.NEXT_PUBLIC_SKIP_COMPLIANCE === "true";
    const sessRole = (sessionRef.current?.user as unknown as { role?: string })?.role;
    const sessSkipCompliance = (sessionRef.current?.user as unknown as { skipCompliance?: boolean })?.skipCompliance ?? false;
    const isAdmin = sessRole === "ADMIN" || sessRole === "OWNER" || sessSkipCompliance;
    if (!skipCompliance && !isAdmin && isSeedance2Model && (materialUrls.images.length > 0 || materialUrls.videos.length > 0)) {
      const urlsToVerify: { url: string; type: "image" | "video" }[] = [
        ...materialUrls.images.map((u: string) => ({ url: u, type: "image" as const })),
        ...materialUrls.videos.map((u: string) => ({ url: u, type: "video" as const })),
      ];
      showToast(t("materialVerifying"), "info");
      try {
        const results = await Promise.all(
          urlsToVerify.map(async ({ url, type }) => {
            const body = type === "video" ? { video_url: url } : { image_url: url };
            const r = await fetch("/api/assets/compliance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!r.ok) {
              const err = await r.json().catch(() => ({ error: "Unknown" }));
              return { ok: false, error: err.error, message: err.message };
            }
            return { ok: true };
          }),
        );
        const failed = results.find((r) => !r.ok);
        if (failed) {
          const msg = (failed as any).error === "COMPLIANCE_REJECTED"
            ? t("materialComplianceRejected")
            : t("materialVerifyFailed");
          showToast(msg, "warning");
          return;
        }
      } catch (err) {
        showToast(t("materialVerifyFailed"), "warning");
        return;
      }
    }

    setIsGenerating(true);
    updateTarget({ status: "running", errorMessage: undefined });

    let apiUrl: string;
    let bodyPayload: Record<string, unknown>;

    if (isVideoEditMode) {
      apiUrl = "/api/generate/video-edit";
      const editModelId = modelKey === "grok-video" ? "grok-video" : (modelKey.includes("o3") ? modelKey : modelKey.replace("kling-3", "kling-o3"));
      bodyPayload = { prompt: basePrompt, model_id: editModelId, video_url: firstVideoRefUrl, image_urls: imgRefs.slice(0, 4), keep_audio: true, duration_s: durationS, resolution: videoResolution, node_id: targetNodeId, project_id: useCanvasStore.getState().projectId };
    } else {
      apiUrl = "/api/generate/video";
      bodyPayload = { prompt: basePrompt, model_id: modelKey, aspect_ratio: aspectRatio, duration_s: durationS, generate_audio: audioEnabled, video_ref_mode: refMode, resolution: videoResolution, fps: videoFps, node_id: targetNodeId, project_id: useCanvasStore.getState().projectId };
      if (refMode === "startEnd" && imgRefs.length > 0) { bodyPayload.start_image_url = imgRefs[0]; if (imgRefs[1]) bodyPayload.end_image_url = imgRefs[1]; }
      else if (refMode === "imageRef" && imgRefs.length > 0) { bodyPayload.element_images = imgRefs.slice(0, 9); }
      // Seedance 2.0: pass video refs as ref_video_urls for multimodal generation
      if (isSeedance2Model && allVideoRefUrls.length > 0) { bodyPayload.ref_video_urls = allVideoRefUrls; if (refVideoDurationTotal > 0) bodyPayload.ref_video_duration_s = refVideoDurationTotal; }
      // Audio refs (connected + material @mentions)
      const allAudioRefs = [...connectedRefs.audios, ...materialUrls.audios];
      if (allAudioRefs.length > 0) { bodyPayload.ref_audio_urls = allAudioRefs; }
    }

    try {
      const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyPayload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); updateTarget({ status: "idle" }); return; }
        if (err.error === "COMPLIANCE_REQUIRED") { showToast(t("complianceRequired"), "warning"); updateTarget({ status: "idle" }); return; }
        if (err.error === "COMPLIANCE_REJECTED") { showToast(t("complianceRejectedVideo"), "warning"); updateTarget({ status: "idle" }); return; }
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { jobId } = await res.json();
      updateTarget({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));

      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        const MAX_RETRIES = 15;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => {
            retries = 0;
            try {
              const msg = JSON.parse(event.data);
              if (msg.status === "SUCCEEDED") {
                es.close();
                const displayUrl = String(msg.videoUrl ?? msg.url ?? "");
                updateTarget({
                  videoUrl: displayUrl,
                  originalVideoUrl: String(msg.originalVideoUrl ?? displayUrl),
                  thumbnailUrl: msg.thumbnailUrl || undefined,
                  thumbnailLevels: msg.thumbnailLevels,
                  status: "succeeded",
                  generatedAt: new Date().toISOString(),
                  ...(msg.video_width ? { video_width: msg.video_width } : {}),
                  ...(msg.video_height ? { video_height: msg.video_height } : {}),
                  ...(msg.kie_task_id ? { kie_task_id: msg.kie_task_id } : {}),
                });
                let rw: number | undefined, rh: number | undefined;
                if (msg.video_width && msg.video_height) { rw = msg.video_width; rh = msg.video_height; }
                else { const ratioStr = msg.aspect_ratio ?? aspectRatio; if (ratioStr && ratioStr !== "auto") [rw, rh] = ratioStr.split(":").map(Number); }
                if (rw && rh) { const { w, h } = fitNodeToRatio(rw, rh); updateTargetSize(w, h); }
                // Auto-register generated video to project asset library
                const vidRegUrl = String(msg.originalVideoUrl ?? displayUrl);
                if (vidRegUrl) {
                  autoRegisterToAssetLibrary({
                    url: vidRegUrl,
                    type: "VIDEO",
                    projectId: useCanvasStore.getState().projectId,
                    title: data.label || "Canvas Video",
                    prompt: data.prompt || "",
                    model: String(data.model_id || ""),
                    aspect: aspectRatio || "",
                  });
                }
                window.dispatchEvent(new Event("xinyu:balance-changed"));
                window.dispatchEvent(new Event("xinyu:save-now"));
                resolve();
              } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Video generation failed")); }
            } catch { /* ignore */ }
          };
          es.onerror = () => { es.close(); if (retries < MAX_RETRIES) { retries++; setTimeout(connectSSE, Math.min(3000 * retries, 15000)); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : "";
      const errKey = toErrorKey(rawMsg || "");
      updateTarget({
        status: "failed",
        errorMessage: errKey,
        errorDetail: rawMsg || undefined,
        videoUrl: prevVideoUrl,
        originalVideoUrl: prevOriginalVideoUrl,
        thumbnailUrl: prevThumbUrl,
      });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
    } finally {
      setIsGenerating(false);
    }
  }, [id, isGenerating, updaters, connectedRefs.images, connectedRefs.videos, connectedRefs.audios, connectedRefs.videoNodes, buildApiPrompt, t]);

  const handleVideoGenerate = useCallback(async () => {
    await runVideoGenerate(id, data);
  }, [runVideoGenerate, id, data]);

  const handleGenerate = useCallback(async () => {
    if (isVideoGen) {
      if (hasVideoOutput) {
        setGenerateConflictKind("video");
        return;
      }
      await handleVideoGenerate();
      return;
    }
    if (hasImageOutput) {
      setGenerateConflictKind("image");
      return;
    }
    await handleImageGenerate();
  }, [isVideoGen, hasVideoOutput, hasImageOutput, handleVideoGenerate, handleImageGenerate]);

  /* ── Inpaint / Outpaint / Enhance / RemoveBG / Lighting / Crop / Annotate handlers ── */
  const handleInpaintGenerate = useCallback(async (targetNodeId: string, prompt: string, compositeDataUrl: string, mode: InpaintMode, imageSize: string, aspectRatio: string, modelId?: string) => {
    try {
      const updateTarget = (d: Partial<NodeData>) => useCanvasStore.getState().updateNodeData(targetNodeId, d);
      const res = await fetch("/api/generate/image-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, image_data: compositeDataUrl, mode, aspect_ratio: aspectRatio, image_size: imageSize, model_id: modelId ?? "nano-banana-pro", node_id: targetNodeId, project_id: useCanvasStore.getState().projectId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); updateTarget({ status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      updateTarget({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.status === "SUCCEEDED") { es.close(); const u = msg.url; const th = msg.thumbnailUrl ?? msg.url; const ou = msg.originalUrl ?? u; updateTarget({ imageUrl: u, originalUrl: ou, thumbnailUrl: th, thumbnailLevels: msg.thumbnailLevels, imageUrls: [u], originalImageUrls: [ou], thumbnailUrls: [th], thumbnailLevelsList: [msg.thumbnailLevels ?? {}], primaryImageIndex: 0, status: "succeeded", generatedAt: new Date().toISOString(), revisedPrompt: msg.revised_prompt }); const ratioStr = msg.aspect_ratio ?? aspectRatio; const [rw, rh] = ratioStr.split(":").map(Number); if (rw && rh) { const { w, h } = fitNodeToRatio(rw, rh); useCanvasStore.getState().updateNodeSize(targetNodeId, w, h); } window.dispatchEvent(new Event("xinyu:balance-changed")); window.dispatchEvent(new Event("xinyu:save-now")); resolve(); } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Generation failed")); } } catch { /* ignore */ } };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const rawMsg = err instanceof Error ? err.message : ""; const errKey = toErrorKey(rawMsg || ""); useCanvasStore.getState().updateNodeData(targetNodeId, { status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined }); window.dispatchEvent(new Event("xinyu:balance-changed")); }
  }, [updaters, t]);

  const handleEnhanceGenerate = useCallback(async (targetNodeId: string, sourceImageUrl: string) => {
    try {
      setIsGenerating(true);
      const updateTarget = (d: Partial<NodeData>) => useCanvasStore.getState().updateNodeData(targetNodeId, d);
      updateTarget({ status: "running" });
      const nodeData = useCanvasStore.getState()._nodeMap.get(targetNodeId)?.data;
      const res = await fetch("/api/generate/enhance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: sourceImageUrl, node_id: targetNodeId, enhance_model: nodeData?.enhance_model ?? "Standard V2", upscale_factor: nodeData?.upscale_factor ?? 2, face_enhancement: nodeData?.face_enhancement !== false, face_enhancement_strength: nodeData?.face_enhancement_strength ?? 0.8, face_enhancement_creativity: nodeData?.face_enhancement_creativity ?? 0, project_id: useCanvasStore.getState().projectId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); updateTarget({ status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      updateTarget({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.status === "SUCCEEDED") { es.close(); const u = msg.url; const th = msg.thumbnailUrl ?? msg.url; const ou = msg.originalUrl ?? u; updateTarget({ imageUrl: u, originalUrl: ou, thumbnailUrl: th, thumbnailLevels: msg.thumbnailLevels, imageUrls: [u], originalImageUrls: [ou], thumbnailUrls: [th], thumbnailLevelsList: [msg.thumbnailLevels ?? {}], primaryImageIndex: 0, status: "succeeded", generatedAt: new Date().toISOString() }); if (msg.width && msg.height) { const { w, h } = fitNodeToRatio(msg.width, msg.height); useCanvasStore.getState().updateNodeSize(targetNodeId, w, h); } window.dispatchEvent(new Event("xinyu:balance-changed")); window.dispatchEvent(new Event("xinyu:save-now")); resolve(); } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Enhancement failed")); } } catch { /* ignore */ } };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const errKey = err instanceof Error ? toErrorKey(err.message) : "errGenericFailed"; useCanvasStore.getState().updateNodeData(targetNodeId, { status: "failed", errorMessage: errKey }); window.dispatchEvent(new Event("xinyu:balance-changed")); } finally { setIsGenerating(false); }
  }, [t]);

  const handleOutpaintGenerate = useCallback(async (sourceNodeId: string, sourceImageUrl: string, expand: { top: number; right: number; bottom: number; left: number }, prompt: string, quality: string, outpaintModel: string) => {
    const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
    const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
    const nodeX = (thisNode?.position.x ?? 0) + nodeW + 80;
    const nodeY = thisNode?.position.y ?? 0;
    const newId = updaters.addNodeWithData("image-gen", nodeX, nodeY, { label: t("outpaintLabel"), status: "running" }, { w: nodeW, h: nodeH });
    updaters.addEdgeById(sourceNodeId, newId);
    try {
      setIsGenerating(true);
      const res = await fetch("/api/generate/outpaint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: sourceImageUrl, node_id: newId, expand_top: expand.top, expand_right: expand.right, expand_bottom: expand.bottom, expand_left: expand.left, prompt, quality, outpaint_model: outpaintModel, project_id: useCanvasStore.getState().projectId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); useCanvasStore.getState().updateNodeData(newId, { status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      useCanvasStore.getState().updateNodeData(newId, { jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.status === "SUCCEEDED") { es.close(); const ou = msg.originalUrl ?? msg.url; useCanvasStore.getState().updateNodeData(newId, { imageUrl: msg.url, originalUrl: ou, thumbnailUrl: msg.thumbnailUrl ?? msg.url, thumbnailLevels: msg.thumbnailLevels, imageUrls: [msg.url], originalImageUrls: [ou], thumbnailUrls: [msg.thumbnailUrl ?? msg.url], thumbnailLevelsList: [msg.thumbnailLevels ?? {}], primaryImageIndex: 0, status: "succeeded", generatedAt: new Date().toISOString() }); if (msg.width && msg.height) { const { w, h } = fitNodeToRatio(msg.width, msg.height); useCanvasStore.getState().updateNodeSize(newId, w, h); } window.dispatchEvent(new Event("xinyu:balance-changed")); window.dispatchEvent(new Event("xinyu:save-now")); resolve(); } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Outpaint failed")); } } catch { /* ignore */ } };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const rawMsg = err instanceof Error ? err.message : ""; const errKey = toErrorKey(rawMsg || ""); useCanvasStore.getState().updateNodeData(newId, { status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined }); window.dispatchEvent(new Event("xinyu:balance-changed")); } finally { setIsGenerating(false); }
  }, [id, thisNode, config, updaters, t]);

  const handleCrop = useCallback(async (blob: Blob, width: number, height: number) => {
    try {
      const file = new File([blob], `cropped-${Date.now()}.png`, { type: blob.type || "image/png" });
      const result = await uploadImageFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined, nodeId: id });
      if (result?.url) {
        const pos = thisNode?.position ?? { x: 0, y: 0 };
        const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
        const { w, h } = fitNodeToRatio(width, height);
        const newId = updaters.addNodeWithData(
          "source-image",
          pos.x + nodeW + 80,
          pos.y,
          {
            label: t("cropLabel"),
            imageUrl: result.url,
            originalUrl: result.originalUrl ?? result.url,
            thumbnailUrl: result.thumbnailUrl ?? result.url,
            thumbnailLevels: result.thumbnailLevels,
            aspect_ratio: `${width}:${height}`,
          },
          { w, h },
        );
        updaters.addEdgeById(id, newId);
        window.dispatchEvent(new Event("xinyu:save-now"));
      }
    } catch (err) { console.error("[Crop] upload failed:", err); }
    setIsCropOpen(false);
  }, [id, thisNode, config, updaters, t]);

  const handleRemoveBgGenerate = useCallback(async (sourceNodeId: string, sourceImageUrl: string) => {
    const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
    const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
    const nodeX = (thisNode?.position.x ?? 0) + nodeW + 80;
    const nodeY = thisNode?.position.y ?? 0;
    const newId = updaters.addNodeWithData("rembg", nodeX, nodeY, { label: t("rembgLabel"), status: "idle", rembg_model: "General Use (Light)", operating_resolution: "1024x1024", refine_foreground: true, sourceImageUrl }, { w: nodeW, h: nodeH });
    updaters.addEdgeById(sourceNodeId, newId);
    window.dispatchEvent(new Event("xinyu:save-now"));
  }, [thisNode, config, updaters, t]);

  const handleRemoveBgSend = useCallback(async () => {
    const sourceUrl = String(data.sourceImageUrl ?? connectedRefs.images[0] ?? "");
    if (!sourceUrl) return;
    try {
      setIsGenerating(true);
      updaters.updateData({ status: "running" });
      const res = await fetch("/api/generate/rembg", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: sourceUrl, node_id: id, rembg_model: data.rembg_model ?? "General Use (Light)", operating_resolution: data.operating_resolution ?? "1024x1024", refine_foreground: data.refine_foreground !== false, output_mask: data.output_mask === true, project_id: useCanvasStore.getState().projectId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); updaters.updateData({ status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      updaters.updateData({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.status === "SUCCEEDED") {
                es.close();
                const ou = msg.originalUrl ?? msg.url;
                updaters.updateData({ imageUrl: msg.url, originalUrl: ou, thumbnailUrl: msg.thumbnailUrl ?? msg.url, thumbnailLevels: msg.thumbnailLevels, imageUrls: [msg.url], originalImageUrls: [ou], thumbnailUrls: [msg.thumbnailUrl ?? msg.url], thumbnailLevelsList: [msg.thumbnailLevels ?? {}], primaryImageIndex: 0, status: "succeeded", generatedAt: new Date().toISOString() });
                if (msg.width && msg.height) { const { w, h } = fitNodeToRatio(msg.width, msg.height); updaters.updateSize(w, h); }
                if (msg.maskUrl) {
                  const thisPos = useCanvasStore.getState()._nodeMap.get(id);
                  const nw = Number(thisPos?.style?.width ?? 280);
                  const maskNodeId = updaters.addNodeWithData("image-gen", (thisPos?.position.x ?? 0) + nw + 60, thisPos?.position.y ?? 0, { label: "Mask", imageUrl: msg.maskUrl, originalUrl: msg.maskOriginalUrl ?? msg.maskUrl, originalImageUrls: [msg.maskOriginalUrl ?? msg.maskUrl], thumbnailUrl: msg.maskThumbnailUrl ?? msg.maskUrl, status: "succeeded", generatedAt: new Date().toISOString() }, msg.maskWidth && msg.maskHeight ? fitNodeToRatio(msg.maskWidth, msg.maskHeight) : undefined);
                  updaters.addEdgeById(id, maskNodeId);
                }
                // Auto-register generated image to project asset library
                if (ou) {
                  let rembgAspect = "";
                  if (msg.width && msg.height) {
                    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
                    const divisor = gcd(msg.width, msg.height);
                    rembgAspect = `${msg.width / divisor}:${msg.height / divisor}`;
                  }
                  autoRegisterToAssetLibrary({
                    url: ou,
                    type: "IMAGE",
                    projectId: useCanvasStore.getState().projectId,
                    title: data.label ? `${data.label} (RemoveBG)` : "Canvas RemBG",
                    prompt: `RemoveBG - Source: ${data.sourceImageUrl || ""}`,
                    model: String(data.rembg_model || "RemoveBG"),
                    aspect: rembgAspect,
                  });
                }
                window.dispatchEvent(new Event("xinyu:balance-changed"));
                window.dispatchEvent(new Event("xinyu:save-now"));
                resolve();
              } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "RemoveBG failed")); }
            } catch { /* ignore */ }
          };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const rawMsg = err instanceof Error ? err.message : ""; const errKey = toErrorKey(rawMsg || ""); updaters.updateData({ status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined }); window.dispatchEvent(new Event("xinyu:balance-changed")); } finally { setIsGenerating(false); }
  }, [id, data, connectedRefs.images, updaters, t]);

  const handleVideoEnhanceGenerate = useCallback(async (targetNodeId: string, sourceVideoUrl: string) => {
    try {
      setIsGenerating(true);
      const updateTarget = (d: Partial<NodeData>) => useCanvasStore.getState().updateNodeData(targetNodeId, d);
      updateTarget({ status: "running" });
      const nodeData = useCanvasStore.getState()._nodeMap.get(targetNodeId)?.data;
      const res = await fetch("/api/generate/enhance-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify((() => {
          const srcNode = connectedRefs.videoNodes?.[0];
          const srcData = srcNode ? useCanvasStore.getState()._nodeMap.get(srcNode.nodeId)?.data : null;
          const srcW = Number(srcData?.video_width ?? srcData?.width ?? 0);
          const srcH = Number(srcData?.video_height ?? srcData?.height ?? 0);
          const targetRes = Number(nodeData?.ve_target_resolution ?? 1080);
          const factor = srcH > 0 ? Math.min(4, Math.max(1, targetRes / srcH)) : 2;
          const dur = Number(nodeData?.ve_detected_duration ?? srcData?.duration_s ?? srcData?.duration ?? nodeData?.duration_s ?? nodeData?.duration ?? 0);
          return {
            video_url: sourceVideoUrl,
            node_id: targetNodeId,
            project_id: useCanvasStore.getState().projectId,
            enhance_model: nodeData?.enhance_model ?? "Starlight Precise 2.5",
            upscale_factor: factor,
            target_fps: nodeData?.ve_target_fps ?? undefined,
            target_resolution: targetRes,
            source_width: srcW || undefined,
            source_height: srcH || undefined,
            duration: dur || undefined,
            compression: nodeData?.ve_compression ?? undefined,
            noise: nodeData?.ve_noise ?? undefined,
            halo: nodeData?.ve_halo ?? undefined,
            grain: nodeData?.ve_grain ?? undefined,
            recover_detail: nodeData?.ve_recover_detail ?? undefined,
          };
        })()),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); updateTarget({ status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      updateTarget({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.status === "SUCCEEDED") { es.close(); const displayUrl = String(msg.videoUrl ?? msg.url ?? ""); updateTarget({ videoUrl: displayUrl, originalVideoUrl: String(msg.originalVideoUrl ?? displayUrl), thumbnailUrl: msg.thumbnailUrl || undefined, thumbnailLevels: msg.thumbnailLevels, status: "succeeded", generatedAt: new Date().toISOString(), ...(msg.video_width ? { video_width: msg.video_width } : {}), ...(msg.video_height ? { video_height: msg.video_height } : {}) }); if (msg.video_width && msg.video_height) { const { w, h } = fitNodeToRatio(msg.video_width, msg.video_height); useCanvasStore.getState().updateNodeSize(targetNodeId, w, h); } window.dispatchEvent(new Event("xinyu:balance-changed")); window.dispatchEvent(new Event("xinyu:save-now")); resolve(); } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Video enhancement failed")); } } catch { /* ignore */ } };
          es.onerror = () => { es.close(); if (retries < 5) { retries++; setTimeout(connectSSE, 3000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const rawMsg = err instanceof Error ? err.message : ""; const errKey = toErrorKey(rawMsg || ""); useCanvasStore.getState().updateNodeData(targetNodeId, { status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined }); window.dispatchEvent(new Event("xinyu:balance-changed")); } finally { setIsGenerating(false); }
  }, [t]);

  const handleLightingToolGenerate = useCallback(async (targetNodeId: string, lightingPrompt: string, imageSize: string, aspectRatio: string, sourceImageUrl: string, selectedModelId?: string, controlImage?: string) => {
    const modelKey = selectedModelId || String(data.model_id || "nano-banana-2");
    const refImages = [sourceImageUrl];
    if (controlImage) refImages.push(controlImage);
    try {
      const res = await fetch("/api/generate/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: lightingPrompt, model_id: modelKey, aspect_ratio: aspectRatio, image_size: imageSize, node_id: targetNodeId, reference_images: refImages, project_id: useCanvasStore.getState().projectId }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Unknown error" })); if (err.error === "CONCURRENCY_LIMIT") { showToast(t("concurrencyLimit", { running: err.running, limit: err.limit })); useCanvasStore.getState().updateNodeData(targetNodeId, { status: "idle" }); return; } throw new Error(err.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      useCanvasStore.getState().updateNodeData(targetNodeId, { jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.status === "SUCCEEDED") { es.close(); const ou = msg.originalUrl ?? msg.url; useCanvasStore.getState().updateNodeData(targetNodeId, { imageUrl: msg.url, originalUrl: ou, thumbnailUrl: msg.thumbnailUrl ?? msg.url, thumbnailLevels: msg.thumbnailLevels, imageUrls: [msg.url], originalImageUrls: [ou], thumbnailUrls: [msg.thumbnailUrl ?? msg.url], thumbnailLevelsList: [msg.thumbnailLevels ?? {}], primaryImageIndex: 0, status: "succeeded", generatedAt: new Date().toISOString(), revisedPrompt: msg.revised_prompt }); const ratioStr = msg.aspect_ratio ?? aspectRatio; const [rw, rh] = ratioStr.split(":").map(Number); if (rw && rh) { const { w, h } = fitNodeToRatio(rw, rh); useCanvasStore.getState().updateNodeSize(targetNodeId, w, h); } window.dispatchEvent(new Event("xinyu:balance-changed")); window.dispatchEvent(new Event("xinyu:save-now")); resolve(); } else if (msg.status === "FAILED") { es.close(); reject(new Error(msg.error || "Generation failed")); } } catch { /* ignore */ } };
          es.onerror = () => { es.close(); if (retries < 3) { retries++; setTimeout(connectSSE, 2000 * retries); } else reject(new Error("SSE connection lost")); };
        }
        connectSSE();
      });
    } catch (err: unknown) { const rawMsg = err instanceof Error ? err.message : ""; const errKey = toErrorKey(rawMsg || ""); useCanvasStore.getState().updateNodeData(targetNodeId, { status: "failed", errorMessage: errKey, errorDetail: rawMsg || undefined }); window.dispatchEvent(new Event("xinyu:balance-changed")); }
  }, [data.model_id, t]);

  const titleValue = String(data.label ?? "");

  return (
    <>
      {/* Video toolbar */}
      {hasVideo && (
        <VideoToolbar
          inverseZoom={inverseZoom}
          videoUrl={displayVideoUrl}
          nodeData={data}
          nodeId={id}
          onEnhance={() => {
            const srcUrl = String(data.originalVideoUrl ?? data.videoUrl ?? "");
            if (!srcUrl) return;
            const pos = thisNode?.position ?? { x: 0, y: 0 };
            const w = Number(thisNode?.width ?? config?.defaultWidth ?? 280);
            const newId = updaters.addNodeWithData("video-upscale", pos.x + w + 60, pos.y, {
              label: t("videoEnhanceLabel"),
              model_id: "topaz-video-enhance",
              enhance_model: "Starlight Precise 2.5",
              upscale_factor: 2,
              ve_compression: 0,
              ve_noise: 0,
              ve_halo: 0,
              ve_grain: 0,
              ve_recover_detail: 0,
              duration_s: data.duration_s,
            });
            updaters.addEdgeById(id, newId);
          }}
          onFrameCapture={() => setIsFrameCaptureOpen(true)}
          onMaximize={() => openDetailView({ videoUrl: originalVideoUrl, isVideo: true, nodeId: id, data })}
          onCompliance={handleVideoCompliance}
          complianceStatus={videoComplianceStatus}
        />
      )}

      {/* Image toolbar */}
      {hasImage && !hasVideo && (
        <ImageToolbar
          inverseZoom={inverseZoom}
          imageUrl={String(data.imageUrl)}
          nodeData={data}
          nodeId={id}
          onRedraw={() => { setInpaintMode("redraw"); setIsInpaintOpen(true); }}
          onErase={() => { setInpaintMode("erase"); setIsInpaintOpen(true); }}
          onEnhance={() => {
            const srcUrl = String(data.originalUrl ?? data.imageUrl ?? "");
            if (!srcUrl) return;
            const pos = thisNode?.position ?? { x: 0, y: 0 };
            const w = Number(thisNode?.width ?? config?.defaultWidth ?? 280);
            const newId = updaters.addNodeWithData("upscale", pos.x + w + 60, pos.y, { label: t("enhanceLabel"), model_id: "topaz-enhance", enhance_model: "Standard V2", upscale_factor: 2, face_enhancement: true });
            updaters.addEdgeById(id, newId);
          }}
          onLighting={() => setIsLightingToolOpen(true)}
          onMultiAngle={() => setIsMultiAngleToolOpen(true)}
          onOutpaint={() => setIsOutpaintOpen(true)}
          onRemoveBg={() => handleRemoveBgGenerate(id, String(data.originalUrl ?? data.imageUrl ?? ""))}
          onCrop={() => setIsCropOpen(true)}
          onAnnotate={() => setIsAnnotateOpen(true)}
          onGridSplit={() => setIsGridSplitOpen(true)}
          onMaximize={() => openDetailView({
            imageUrl: hasImage ? String(data.imageUrl) : undefined,
            originalUrl: data.originalUrl ? String(data.originalUrl) : undefined,
            videoUrl: hasVideo ? String(data.videoUrl) : undefined,
            isVideo: isVideoGen && hasVideo,
            nodeId: id,
            data,
          })}
          onCompliance={handleCompliance}
          complianceStatus={complianceStatus}
        />
      )}

      {/* Generation panel for image-gen / video-gen */}
      {isGenerative && (
        <Suspense fallback={null}>
          {isVideoGen ? (
            <LazyVideoGenPanel
              prompt={String(data.prompt ?? "")} promptJson={data.prompt_json} modelId={String(data.model_id ?? "")}
              aspectRatio={String(data.aspect_ratio ?? "16:9")} durationS={Number(data.duration_s) || 5}
              generateAudio={data.generate_audio !== false} resolution={String(data.resolution ?? "720p")}
              fps={String(data.fps ?? "25")} videoRefMode={(data.video_ref_mode as VideoRefMode) ?? "imageRef"}
              videoRefOrder={(data.video_ref_order as number[]) ?? []}
              referenceImages={connectedRefs.images} referenceVideos={connectedRefs.videos} referenceAudios={connectedRefs.audios}
              imageNodes={connectedRefs.imageNodes} videoNodes={connectedRefs.videoNodes} audioNodes={connectedRefs.audioNodes}
              connectedTextNodes={connectedRefs.textNodes}
              onPromptChange={(v, json) => updaters.updateData({ prompt: v, prompt_json: json })}
              onModelChange={(v) => updaters.updateData({ model_id: v })}
              onAspectRatioChange={(v) => updaters.updateData({ aspect_ratio: v })}
              onDurationChange={(v) => updaters.updateData({ duration_s: v })}
              onAudioChange={(v) => updaters.updateData({ generate_audio: v })}
              onResolutionChange={(v) => updaters.updateData({ resolution: v })}
              onFpsChange={(v) => updaters.updateData({ fps: v })}
              onRefModeChange={(v) => updaters.updateData({ video_ref_mode: v })}
              onRefOrderChange={(order) => updaters.updateData({ video_ref_order: order })}
              onGenerate={handleGenerate} isGenerating={isGenerating} inverseZoom={inverseZoom}
              onRemoveRef={handleRemoveRef}
            />
          ) : (
            <LazyImageGenPanel
              prompt={String(data.prompt ?? "")} promptJson={data.prompt_json} modelId={String(data.model_id ?? "")}
              aspectRatio={String(data.aspect_ratio ?? "16:9")} imageSize={String(data.image_size ?? "2K")}
              count={Number(data.count) || 1}
              cameraSettings={(data.cameraSettings as CameraSettings) ?? null}
              lightingSettings={(data.lightingSettings as LightingSettings) ?? null}
              referenceImages={connectedRefs.images} imageNodes={connectedRefs.imageNodes} connectedTextNodes={connectedRefs.textNodes}
              onPromptChange={(v, json) => updaters.updateData({ prompt: v, prompt_json: json })}
              onModelChange={(v) => updaters.updateData({ model_id: v })}
              onAspectRatioChange={(v) => updaters.updateData({ aspect_ratio: v })}
              onImageSizeChange={(v) => updaters.updateData({ image_size: v })}
              onCountChange={(v) => updaters.updateData({ count: v })}
              onCameraChange={(s) => updaters.updateData({ cameraSettings: s })}
              onLightingChange={(s) => updaters.updateData({ lightingSettings: s })}
              onGenerate={handleGenerate} isGenerating={isGenerating} inverseZoom={inverseZoom}
              onFocusEdit={() => enterFocusEdit(id)}
              promptEditorRef={promptEditorRef}
              onElementsChange={(els) => { if (elementRefsRef) elementRefsRef.current = els; }}
              onRemoveRef={handleRemoveRef}
              imageRefOrder={(data.image_ref_order as number[]) ?? []}
              onImageRefOrderChange={(order) => updaters.updateData({ image_ref_order: order })}
              enablePro={!!data.enable_pro}
              onEnableProChange={(v) => updaters.updateData({ enable_pro: v })}
              negativePrompt={data.negative_prompt as string | undefined}
              guidanceScale={data.guidance_scale as number | undefined}
              numInferenceSteps={data.num_inference_steps as number | undefined}
              seed={data.seed as number | undefined}
              onNegativePromptChange={(v) => updaters.updateData({ negative_prompt: v })}
              onGuidanceScaleChange={(v) => updaters.updateData({ guidance_scale: v })}
              onNumInferenceStepsChange={(v) => updaters.updateData({ num_inference_steps: v })}
              onSeedChange={(v) => updaters.updateData({ seed: v })}
              outputQuality={data.output_quality as string | undefined}
              onOutputQualityChange={(v) => updaters.updateData({ output_quality: v })}
              thinkingLevel={data.thinking_level as string | undefined}
              onThinkingLevelChange={(v) => updaters.updateData({ thinking_level: v })}
              enableWebSearch={!!data.enable_web_search}
              onEnableWebSearchChange={(v) => updaters.updateData({ enable_web_search: v })}
              enableImageSearch={!!data.enable_image_search}
              onEnableImageSearchChange={(v) => updaters.updateData({ enable_image_search: v })}
            />
          )}
        </Suspense>
      )}

      <GenerateConflictModal
        open={generateConflictKind !== null}
        contentKind={generateConflictKind ?? "image"}
        onCancel={() => setGenerateConflictKind(null)}
        onOverwrite={() => {
          const kind = generateConflictKind;
          setGenerateConflictKind(null);
          if (kind === "video") void handleVideoGenerate();
          else void handleImageGenerate();
        }}
        onCreateNew={() => {
          const kind = generateConflictKind;
          setGenerateConflictKind(null);
          if (kind === "video") {
            const newId = createSiblingGenerationNode("video-gen");
            void runVideoGenerate(newId, data);
          } else {
            const newId = createSiblingGenerationNode("image-gen");
            void runImageGenerate(newId, data);
          }
        }}
      />

      {/* Enhance panel */}
      {isUpscale && (
        <EnhancePanel
          inverseZoom={inverseZoom}
          sourceImageUrl={connectedRefs.thumbnails[0] ?? connectedRefs.images[0] ?? null}
          sourceOriginalUrl={connectedRefs.images[0] ?? null}
          enhanceModel={String(data.enhance_model ?? "Standard V2")}
          upscaleFactor={Math.min(Math.max(Number(data.upscale_factor ?? 2), 2), 8)}
          faceEnhancement={data.face_enhancement !== false}
          faceStrength={Number(data.face_enhancement_strength ?? 0.8)}
          faceCreativity={Number(data.face_enhancement_creativity ?? 0)}
          onModelChange={(v) => updaters.updateData({ enhance_model: v })}
          onFactorChange={(v) => updaters.updateData({ upscale_factor: v })}
          onFaceChange={(v) => updaters.updateData({ face_enhancement: v })}
          onFaceStrengthChange={(v) => updaters.updateData({ face_enhancement_strength: v })}
          onFaceCreativityChange={(v) => updaters.updateData({ face_enhancement_creativity: v })}
          onGenerate={() => { const srcUrl = connectedRefs.images[0]; if (!srcUrl) return; handleEnhanceGenerate(id, srcUrl); }}
          isGenerating={isGenerating}
        />
      )}

      {/* Video Enhance panel */}
      {isVideoUpscale && (
        <VideoEnhancePanel
          inverseZoom={inverseZoom}
          sourceVideoUrl={connectedRefs.videos[0] ?? null}
          sourceThumbnailUrl={connectedRefs.thumbnails[0] ?? null}
          sourceHeight={(() => { const srcData = connectedRefs.videoNodes?.[0] ? useCanvasStore.getState()._nodeMap.get(connectedRefs.videoNodes[0].nodeId)?.data : null; return Number(srcData?.video_height ?? srcData?.height ?? 0); })()}
          durationS={(() => { const srcData = connectedRefs.videoNodes?.[0] ? useCanvasStore.getState()._nodeMap.get(connectedRefs.videoNodes[0].nodeId)?.data : null; return Number(srcData?.duration_s ?? data.duration_s ?? 5); })()}
          enhanceModel={String(data.enhance_model ?? "Starlight Precise 2.5")}
          targetResolution={Number(data.ve_target_resolution ?? 1080)}
          compression={Number(data.ve_compression ?? 0)}
          noise={Number(data.ve_noise ?? 0)}
          halo={Number(data.ve_halo ?? 0)}
          grain={Number(data.ve_grain ?? 0)}
          recoverDetail={Number(data.ve_recover_detail ?? 0)}
          targetFps={Number(data.ve_target_fps ?? 0)}
          onModelChange={(v) => updaters.updateData({ enhance_model: v })}
          onTargetResolutionChange={(v: number) => updaters.updateData({ ve_target_resolution: v })}
          onTargetFpsChange={(v) => updaters.updateData({ ve_target_fps: v })}
          onCompressionChange={(v) => updaters.updateData({ ve_compression: v })}
          onNoiseChange={(v) => updaters.updateData({ ve_noise: v })}
          onHaloChange={(v) => updaters.updateData({ ve_halo: v })}
          onGrainChange={(v) => updaters.updateData({ ve_grain: v })}
          onRecoverDetailChange={(v) => updaters.updateData({ ve_recover_detail: v })}
          onDurationDetected={(d) => updaters.updateData({ ve_detected_duration: d })}
          onGenerate={() => {
            const firstVideoRefNode = connectedRefs.videoNodes?.[0];
            const srcUrl = firstVideoRefNode
              ? String(
                  useCanvasStore.getState()._nodeMap.get(firstVideoRefNode.nodeId)?.data?.originalVideoUrl
                    ?? firstVideoRefNode.url,
                )
              : connectedRefs.videos[0];
            if (!srcUrl) return;
            handleVideoEnhanceGenerate(id, srcUrl);
          }}
          isGenerating={isGenerating}
        />
      )}

      {/* RemoveBg panel */}
      {isRembg && (
        <RemoveBgPanel
          inverseZoom={inverseZoom}
          sourceImageUrl={String(data.sourceImageUrl ?? connectedRefs.images[0] ?? "")}
          rembgModel={String(data.rembg_model ?? "General Use (Light)")}
          resolution={String(data.operating_resolution ?? "1024x1024")}
          refineForeground={data.refine_foreground !== false}
          outputMask={data.output_mask === true}
          onModelChange={(v) => updaters.updateData({ rembg_model: v })}
          onResolutionChange={(v) => updaters.updateData({ operating_resolution: v })}
          onRefineChange={(v) => updaters.updateData({ refine_foreground: v })}
          onOutputMaskChange={(v) => updaters.updateData({ output_mask: v })}
          onGenerate={handleRemoveBgSend}
          isGenerating={isGenerating}
        />
      )}

      {/* Lazy modals */}
      {isInpaintOpen && hasImage && (
        <Suspense fallback={null}>
          <InpaintModal imageUrl={String(data.imageUrl)} imageSize={String(data.image_size ?? "2K")} mode={inpaintMode} onClose={() => setIsInpaintOpen(false)} onGenerate={(prompt: string, compositeDataUrl: string, imageSize: string, mode: InpaintMode, modelId: string) => {
            const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth); const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
            const newId = updaters.addNodeWithData("image-gen", (thisNode?.position.x ?? 0) + nodeW + 80, thisNode?.position.y ?? 0, { label: mode === "erase" ? t("eraseLabel") : t("inpaintLabel"), prompt, model_id: modelId, image_size: imageSize, aspect_ratio: String(data.aspect_ratio ?? "16:9"), sourceImageUrl: String(data.imageUrl), status: "running" }, { w: nodeW, h: nodeH });
            updaters.addEdgeById(id, newId); setIsInpaintOpen(false);
            handleInpaintGenerate(newId, prompt, compositeDataUrl, mode, imageSize, String(data.aspect_ratio ?? "16:9"), modelId);
          }} isGenerating={isGenerating} />
        </Suspense>
      )}

      {isLightingToolOpen && hasImage && (
        <Suspense fallback={null}>
          <LightingToolModal imageUrl={String(data.imageUrl)} imageSize={String(data.image_size ?? "2K")} aspectRatio={String(data.aspect_ratio ?? "16:9")} initialModelId={String(data.model_id ?? "nano-banana-2")} initialSettings={(data.lightingToolSettings as LightingToolSettings) ?? undefined} onClose={() => setIsLightingToolOpen(false)} onSettingsChange={(s) => updaters.updateData({ lightingToolSettings: s })} onGenerate={(lightingPrompt: string, imageSize: string, selectedModelId: string) => {
            const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth); const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
            const newId = updaters.addNodeWithData("image-gen", (thisNode?.position.x ?? 0) + nodeW + 80, thisNode?.position.y ?? 0, { label: t("lightingLabel"), prompt: lightingPrompt, model_id: selectedModelId, image_size: imageSize, aspect_ratio: String(data.aspect_ratio ?? "16:9"), sourceImageUrl: String(data.imageUrl), status: "running" }, { w: nodeW, h: nodeH });
            updaters.addEdgeById(id, newId); setIsLightingToolOpen(false);
            handleLightingToolGenerate(newId, lightingPrompt, imageSize, String(data.aspect_ratio ?? "16:9"), String(data.imageUrl), selectedModelId);
          }} isGenerating={isGenerating} />
        </Suspense>
      )}

      {isMultiAngleToolOpen && hasImage && (
        <Suspense fallback={null}>
          <MultiAngleToolModal imageUrl={String(data.imageUrl)} imageSize={String(data.image_size ?? "2K")} aspectRatio={String(data.aspect_ratio ?? "16:9")} initialModelId={String(data.model_id ?? "nano-banana-2")} initialSettings={(data.multiAngleToolSettings as MultiAngleToolSettings) ?? undefined} onClose={() => setIsMultiAngleToolOpen(false)} onSettingsChange={(s) => updaters.updateData({ multiAngleToolSettings: s })} onGenerate={(anglePrompt: string, imgSize: string, selectedModelId: string, controlImage?: string) => {
            const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth); const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
            const newId = updaters.addNodeWithData("image-gen", (thisNode?.position.x ?? 0) + nodeW + 80, thisNode?.position.y ?? 0, { label: t("multiAngleLabel"), prompt: anglePrompt, model_id: selectedModelId, image_size: imgSize, aspect_ratio: String(data.aspect_ratio ?? "16:9"), sourceImageUrl: String(data.imageUrl), status: "running" }, { w: nodeW, h: nodeH });
            updaters.addEdgeById(id, newId); setIsMultiAngleToolOpen(false);
            handleLightingToolGenerate(newId, anglePrompt, imgSize, String(data.aspect_ratio ?? "16:9"), String(data.imageUrl), selectedModelId, controlImage);
          }} isGenerating={isGenerating} />
        </Suspense>
      )}

      {isOutpaintOpen && hasImage && (
        <Suspense fallback={null}>
          <OutpaintModal imageUrl={String(data.imageUrl)} onClose={() => setIsOutpaintOpen(false)} onGenerate={(expand, prompt, quality, model) => { setIsOutpaintOpen(false); handleOutpaintGenerate(id, String(data.imageUrl), expand, prompt, quality, model); }} isGenerating={isGenerating} />
        </Suspense>
      )}

      {isCropOpen && hasImage && (
        <Suspense fallback={null}>
          <CropModal imageUrl={String(data.imageUrl)} onClose={() => setIsCropOpen(false)} onCrop={handleCrop} />
        </Suspense>
      )}

      {isFrameCaptureOpen && hasVideo && (
        <Suspense fallback={null}>
          <FrameCaptureModal
            videoUrl={originalVideoUrl}
            onClose={() => setIsFrameCaptureOpen(false)}
            onCapture={async (blob, w, h) => {
              setIsFrameCaptureOpen(false);
              try {
                const file = new File([blob], `frame-${Date.now()}.jpg`, { type: "image/jpeg" });
                const result = await uploadImageFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined, nodeId: id });
                const pos = thisNode?.position ?? { x: 0, y: 0 };
                const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
                const nodeH = Number(thisNode?.style?.height ?? config.defaultHeight);
                const newId = updaters.addNodeWithData(
                  "source-image",
                  pos.x + nodeW + 80,
                  pos.y,
                  {
                    label: t("frameCaptureLabel"),
                    imageUrl: result.url,
                    originalUrl: result.originalUrl ?? result.url,
                    thumbnailUrl: result.thumbnailUrl,
                    thumbnailLevels: result.thumbnailLevels,
                    aspect_ratio: `${w}:${h}`,
                  },
                  { w: nodeW, h: nodeH },
                );
                updaters.addEdgeById(id, newId);
              } catch (err) {
                console.error("[FrameCapture] upload failed:", err);
              }
            }}
          />
        </Suspense>
      )}

      {isAnnotateOpen && hasImage && (
        <Suspense fallback={null}>
          <AnnotateModal imageUrl={String(data.imageUrl)} annotations={(data.annotations as import("../../../AnnotateModal").AnnotationStroke[]) ?? []} onClose={() => setIsAnnotateOpen(false)} onSave={(annotations) => updaters.updateData({ annotations })} />
        </Suspense>
      )}

      {isGridSplitOpen && hasImage && (
        <Suspense fallback={null}>
          <GridSplitModal
            imageUrl={String(data.imageUrl)}
            nodeData={data as Record<string, unknown>}
            nodeId={id}
            onClose={() => setIsGridSplitOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

