"use client";

import { useState, useCallback, useEffect, Suspense, lazy } from "react";
import { useStore, useReactFlow } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { showToast } from "@/components/ui/GlobalToast";
import { useCanvasStore } from "@/stores/canvas-store";
import { toErrorKey } from "@/lib/error-keys";
import { uploadFile } from "@/lib/upload-client";
import type { ActiveViewProps } from "../../plugin-types";
import type { NodeData, CanvasNode } from "@/types/canvas";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { AudioGenPanel } from "../../panels/AudioGenPanel";
import { AudioToolbar, type ComplianceStatus } from "../../NodeToolbars";
import { GenerateConflictModal } from "../../GenerateConflictModal";
import { DEFAULT_VOICE_ID } from "@/lib/kie-audio";

const LazyAudioTrimModal = lazy(() => import("../../../AudioTrimModal").then((m) => ({ default: m.AudioTrimModal })));

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

export function AudioActiveView({ id, data, updaters }: ActiveViewProps) {
  const t = useTranslations("canvas");
  const tAudio = useTranslations("audioGen");
  const inverseZoom = 1 / useStore(zoomSelector);

  const tToolbar = useTranslations("audioToolbar");

  const [isGenerating, setIsGenerating] = useState(String(data.status) === "running");
  const [isTrimOpen, setIsTrimOpen] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus>(
    (data.complianceStatus as ComplianceStatus) ?? "idle",
  );

  const { getNode } = useReactFlow<CanvasNode>();
  const config = NODE_TYPE_CONFIGS["source-audio"];

  useEffect(() => {
    const s = (data.complianceStatus as ComplianceStatus) ?? "idle";
    setComplianceStatus(s);
  }, [data.complianceStatus]);

  const handleCompliance = useCallback(async () => {
    const url = String(data.audioUrl ?? "");
    if (!url) return;
    setComplianceStatus("checking");
    updaters.updateData({ complianceStatus: "checking" });
    try {
      const res = await fetch("/api/assets/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        if (err.error === "COMPLIANCE_REJECTED") {
          setComplianceStatus("failed");
          updaters.updateData({ complianceStatus: "failed" });
          showToast(tToolbar("complianceRejectedToast"), "warning");
          return;
        }
        if (err.error === "URL_NOT_REACHABLE") {
          setComplianceStatus("error");
          updaters.updateData({ complianceStatus: "error" });
          showToast(tToolbar("complianceUrlUnreachableToast"), "warning");
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
  }, [data.audioUrl, updaters, tToolbar]);

  // Audio gen state (persisted in node data)
  const prompt = String(data.prompt ?? "");
  const voice = String(data.audio_voice ?? DEFAULT_VOICE_ID);
  const languageCode = String(data.audio_language ?? "");
  const speed = Number(data.audio_speed) || 1;
  const stability = Number(data.audio_stability ?? 0.5);

  const handlePromptChange = useCallback((v: string) => {
    updaters.updateData({ prompt: v });
  }, [updaters]);

  const handleVoiceChange = useCallback((v: string) => {
    updaters.updateData({ audio_voice: v } as Partial<NodeData>);
  }, [updaters]);

  const handleLanguageChange = useCallback((v: string) => {
    updaters.updateData({ audio_language: v } as Partial<NodeData>);
  }, [updaters]);

  const handleSpeedChange = useCallback((v: number) => {
    updaters.updateData({ audio_speed: v } as Partial<NodeData>);
  }, [updaters]);

  const handleStabilityChange = useCallback((v: number) => {
    updaters.updateData({ audio_stability: v } as Partial<NodeData>);
  }, [updaters]);

  const runAudioGenerate = useCallback(async (targetId: string, targetUpdaters: { updateData: (d: Partial<NodeData>) => void }) => {
    const text = prompt.trim();
    if (!text || isGenerating) return;

    setIsGenerating(true);
    targetUpdaters.updateData({ status: "running", errorMessage: undefined });

    try {
      const res = await fetch("/api/generate/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice,
          language_code: languageCode,
          model_id: "elevenlabs/text-to-dialogue-v3",
          stability,
          speed,
          node_id: targetId,
          project_id: useCanvasStore.getState().projectId,
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
      targetUpdaters.updateData({ jobId, status: "running" } as Partial<NodeData>);
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));

      // Listen via SSE
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.status === "SUCCEEDED") {
                es.close();
                const audioUrl = msg.audioUrl ?? "";
                targetUpdaters.updateData({
                  audioUrl,
                  status: "succeeded",
                  generatedAt: new Date().toISOString(),
                } as Partial<NodeData>);
                window.dispatchEvent(new Event("xinyu:balance-changed"));
                window.dispatchEvent(new Event("xinyu:save-now"));
                showToast(tAudio("generateSuccess"), "success");
                resolve();
              } else if (msg.status === "FAILED") {
                es.close();
                reject(new Error(msg.error || "Audio generation failed"));
              }
            } catch { /* ignore */ }
          };
          es.onerror = () => {
            es.close();
            if (retries < 10) {
              retries++;
              setTimeout(connectSSE, 2000 * retries);
            } else {
              reject(new Error("SSE connection lost"));
            }
          };
        }
        connectSSE();
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : "";
      const errKey = toErrorKey(rawMsg || "");
      targetUpdaters.updateData({
        status: "failed",
        errorMessage: errKey,
        errorDetail: rawMsg || undefined,
      } as Partial<NodeData>);
      showToast(tAudio("generateFailed"), "warning");
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, voice, languageCode, speed, stability, isGenerating, t, tAudio]);

  const hasAudio = Boolean(data.audioUrl && String(data.audioUrl).length > 0);

  const handleGenerate = useCallback(async () => {
    if (hasAudio) {
      setShowConflict(true);
      return;
    }
    await runAudioGenerate(id, updaters);
  }, [hasAudio, id, updaters, runAudioGenerate]);

  const createSiblingAudioNode = useCallback(() => {
    const thisNode = getNode(id);
    const pos = thisNode?.position ?? { x: 0, y: 0 };
    const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
    const newId = updaters.addNodeWithData(
      "audio-gen",
      pos.x + nodeW + 80,
      pos.y,
      {
        label: String(data.label ?? config.label),
        prompt: String(data.prompt ?? ""),
        audio_voice: voice,
        audio_language: languageCode,
        audio_speed: speed,
        audio_stability: stability,
        status: "idle",
      },
    );
    return newId;
  }, [id, data, config, voice, languageCode, speed, stability, getNode, updaters]);

  const handleTrim = useCallback(async (blob: Blob, trimDuration: number) => {
    try {
      const file = new File([blob], `trimmed-${Date.now()}.wav`, { type: "audio/wav" });
      const result = await uploadFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined, nodeId: id });
      if ("audioUrl" in result && result.audioUrl) {
        const thisNode = getNode(id);
        const pos = thisNode?.position ?? { x: 0, y: 0 };
        const nodeW = Number(thisNode?.style?.width ?? config.defaultWidth);
        const newId = updaters.addNodeWithData(
          "source-audio",
          pos.x + nodeW + 80,
          pos.y,
          {
            label: t("trimmedAudioLabel"),
            audioUrl: result.audioUrl,
            audioDuration: trimDuration,
          },
        );
        updaters.addEdgeById(id, newId);
        window.dispatchEvent(new Event("xinyu:save-now"));
      }
    } catch (err) {
      console.error("[AudioTrim] upload failed:", err);
    }
    setIsTrimOpen(false);
  }, [id, getNode, config, updaters, t]);

  return (
    <>
      {hasAudio && (
        <AudioToolbar
          inverseZoom={inverseZoom}
          audioUrl={String(data.audioUrl)}
          onTrim={() => setIsTrimOpen(true)}
          onCompliance={handleCompliance}
          complianceStatus={complianceStatus}
        />
      )}
      <AudioGenPanel
        prompt={prompt}
        voice={voice}
        languageCode={languageCode}
        speed={speed}
        stability={stability}
        onPromptChange={handlePromptChange}
        onVoiceChange={handleVoiceChange}
        onLanguageChange={handleLanguageChange}
        onSpeedChange={handleSpeedChange}
        onStabilityChange={handleStabilityChange}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        inverseZoom={inverseZoom}
      />
      {isTrimOpen && hasAudio && (
        <Suspense fallback={null}>
          <LazyAudioTrimModal
            audioUrl={String(data.audioUrl)}
            onClose={() => setIsTrimOpen(false)}
            onTrim={handleTrim}
          />
        </Suspense>
      )}
      <GenerateConflictModal
        open={showConflict}
        contentKind="audio"
        onCancel={() => setShowConflict(false)}
        onOverwrite={() => {
          setShowConflict(false);
          void runAudioGenerate(id, updaters);
        }}
        onCreateNew={() => {
          setShowConflict(false);
          const newId = createSiblingAudioNode();
          const newUpdaters = { updateData: (d: Partial<NodeData>) => useCanvasStore.getState().updateNodeData(newId, d) };
          void runAudioGenerate(newId, newUpdaters);
        }}
      />
    </>
  );
}
