import { StrictMode, useState, useCallback, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./src/app/globals.css";

import { CanvasEditor } from "./src/components/canvas/CanvasEditor";
import { CanvasTopBar } from "./src/components/canvas/CanvasTopBar";
import { DockToolbar } from "./src/components/canvas/DockToolbar";
import { ContextMenu } from "./src/components/canvas/ContextMenu";
import { ConnectionDropMenu } from "./src/components/canvas/ConnectionDropMenu";
import { HandleMenu } from "./src/components/canvas/HandleMenu";
import { SelectionToolbar } from "./src/components/canvas/SelectionToolbar";
import { MultiDragLines } from "./src/components/canvas/MultiDragLines";
import { CanvasControls } from "./src/components/canvas/CanvasControls";
import { ShortcutsHelp } from "./src/components/canvas/ShortcutsHelp";
import { StoryboardPanel } from "./src/components/canvas/StoryboardPanel";
import { AssetPanel } from "./src/components/canvas/AssetPanel";
import { MaterialPanel } from "./src/components/canvas/MaterialPanel";
import { MarketingStudioPanel } from "./src/components/canvas/MarketingStudioPanel";
import { CanvasApiSettingsModal } from "./src/components/canvas/CanvasApiSettingsModal";

import { useCanvasStore } from "./src/stores/canvas-store";
import { useCommentModeStore } from "./src/stores/comment-mode-store";
import type { SerializedCanvas, NodeType } from "./src/types/canvas";
import { CANVAS_MIN_ZOOM } from "./src/components/canvas/zoom-config";
import { uploadFile } from "./mocks/upload-client";

// ─── Project-level canvas configuration & storage keys ───
const urlParams = new URLSearchParams(window.location.search);
const PROJECT_ID = urlParams.get("projectId") || "ps-local";

const STORAGE_KEY = `ps_canvas_current_${PROJECT_ID}`;
const VIEWPORT_KEY = `ps_canvas_viewport_${PROJECT_ID}`;
const MARKETING_KEY = `ps_canvas_marketing_studio_${PROJECT_ID}`;

// ─── Mock Job Tracking for Image Generation ───
interface MockJob {
  id: string;
  modelId: string;
  type: "image" | "video" | "audio";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number;
  url?: string;
  error?: string;
  apiKey: string;
  apiBase: string;
  isNanoBanana: boolean;
  apiFormat?: string;
  projectId?: string;
}

const mockJobs = new Map<string, MockJob>();

const SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024", "4:3": "1152x864", "3:4": "864x1152",
    "16:9": "1280x720", "9:16": "720x1280", "3:2": "1248x832",
    "2:3": "832x1248", "5:4": "1120x896", "4:5": "896x1120",
    "21:9": "1456x624", "2:1": "2048x1024", "1:2": "1024x2048",
  },
  "2K": {
    "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304",
    "16:9": "2560x1440", "9:16": "1440x2560", "3:2": "2496x1664",
    "2:3": "1664x2496", "5:4": "2240x1792", "4:5": "1792x2240",
    "21:9": "3024x1296", "2:1": "2688x1344", "1:2": "1344x2688",
  },
  "4K": {
    "1:1": "2880x2880", "4:3": "3264x2448", "3:4": "2448x3264",
    "16:9": "3840x2160", "9:16": "2160x3840", "3:2": "3504x2336",
    "2:3": "3504x2336", "5:4": "3200x2560", "4:5": "2560x3200",
    "21:9": "3696x1584", "2:1": "3840x1920", "1:2": "1920x3840",
  },
};

// ─── Monkeypatch window.EventSource to support mock SSE ───
const originalEventSource = window.EventSource;
class MockEventSource extends EventTarget {
  url: string;
  readyState: number;
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  private timer: any = null;

  constructor(url: string) {
    super();
    this.url = url;
    this.readyState = 0; // CONNECTING

    const match = url.match(/\/api\/jobs\/([a-zA-Z0-9-]+)\/sse/);
    if (match) {
      const jobId = match[1];
      setTimeout(() => {
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen(new Event("open"));
        this.dispatchEvent(new Event("open"));
        this.startPolling(jobId);
      }, 100);
    } else {
      const nativeES = new (window as any)._originalEventSource(url);
      this.readyState = nativeES.readyState;
      nativeES.onopen = (e: any) => {
        this.readyState = nativeES.readyState;
        if (this.onopen) this.onopen(e);
        this.dispatchEvent(new Event("open"));
      };
      nativeES.onmessage = (e: any) => {
        if (this.onmessage) this.onmessage(e);
        const me = new MessageEvent("message", { data: e.data, origin: e.origin, lastEventId: e.lastEventId });
        this.dispatchEvent(me);
      };
      nativeES.onerror = (e: any) => {
        this.readyState = nativeES.readyState;
        if (this.onerror) this.onerror(e);
        this.dispatchEvent(new Event("error"));
      };
      (this as any)._nativeES = nativeES;
    }
  }

  private startPolling(jobId: string) {
    const poll = async () => {
      if (this.readyState === 2) return;
      const job = mockJobs.get(jobId);
      if (!job) { this.triggerError("Job not found"); return; }

      try {
        if (job.type === "audio") {
          const res = await originalFetch(`${job.apiBase}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const record = json.data ?? {};
          const state = (record.state ?? "").toLowerCase();
          if (state === "success" || state === "succeeded" || state === "completed") {
            let audioUrl = "";
            if (record.resultJson) {
              try { const r = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson; const urls = r.resultUrls ?? r.result_urls ?? []; audioUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : (r.audio_url ?? ""); } catch {}
            }
            this.triggerMessage({ status: "SUCCEEDED", audioUrl });
            this.close();
          } else if (state === "waiting" || state === "running" || state === "processing" || state === "queued" || state === "pending") {
            this.triggerMessage({ status: "RUNNING", progress: 50 });
            this.timer = setTimeout(poll, 5000);
          } else {
            this.triggerMessage({ status: "FAILED", error: record.failMsg || "Audio generation failed" });
            this.close();
          }
        } else if (job.type === "video") {
          const fmt = job.apiFormat || "t8star-v2";
          if (fmt === "jimeng-cli") {
            const res = await originalFetch(`/api/jimeng-cli/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ submit_id: jobId, project_id: job.projectId || PROJECT_ID }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const status = String(data.status || "RUNNING").toUpperCase();
            if (status === "SUCCEEDED" || status === "SUCCESS") {
              const videoUrl = data.videoUrl || data.url || "";
              const originalVideoUrl = data.originalVideoUrl || videoUrl;
              this.triggerMessage({ status: "SUCCEEDED", videoUrl, originalVideoUrl });
              this.close();
            } else if (status === "FAILED" || status === "ERROR") {
              this.triggerMessage({ status: "FAILED", error: data.error || "Video generation failed" });
              this.close();
            } else {
              this.triggerMessage({ status: "RUNNING", progress: 50 });
              this.timer = setTimeout(poll, 8000);
            }
          } else if (fmt === "kie") {
            const res = await originalFetch(`${job.apiBase}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const record = json.data ?? {};
            const state = (record.state ?? "").toLowerCase();
            if (state === "success" || state === "succeeded" || state === "completed") {
              let videoUrl = "";
              if (record.resultJson) {
                try { const r = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson; const urls = r.resultUrls ?? r.result_urls ?? []; videoUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : (r.video_url ?? ""); } catch {}
              }
              this.triggerMessage({ status: "SUCCEEDED", videoUrl, originalVideoUrl: videoUrl });
              this.close();
            } else if (state === "waiting" || state === "running" || state === "processing" || state === "queued" || state === "pending") {
              this.triggerMessage({ status: "RUNNING", progress: 50 });
              this.timer = setTimeout(poll, 8000);
            } else {
              this.triggerMessage({ status: "FAILED", error: record.failMsg || "Video generation failed" });
              this.close();
            }
          } else if (fmt === "t8star-seedance") {
            const res = await originalFetch(`${job.apiBase}/seedance/v3/contents/generations/tasks/${jobId}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const status = (data.status ?? "").toLowerCase();
            if (status === "succeeded" || status === "success" || status === "completed") {
              const videoUrl = data.content?.video_url ?? data.video_url ?? "";
              this.triggerMessage({ status: "SUCCEEDED", videoUrl, originalVideoUrl: videoUrl });
              this.close();
            } else if (status === "failed" || status === "error") {
              this.triggerMessage({ status: "FAILED", error: data.error?.message || "Video generation failed" });
              this.close();
            } else {
              this.triggerMessage({ status: "RUNNING", progress: 50 });
              this.timer = setTimeout(poll, 8000);
            }
          } else if (fmt === "opencrow-wan") {
            const res = await originalFetch(`${job.apiBase}/v1/videos/generations/${jobId}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const status = (data.status ?? "").toUpperCase();
            if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") {
              const videoUrl = data.output?.video ?? data.video_url ?? data.url ?? "";
              this.triggerMessage({ status: "SUCCEEDED", videoUrl, originalVideoUrl: videoUrl });
              this.close();
            } else if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
              this.triggerMessage({ status: "FAILED", error: data.error?.message || "Video generation failed" });
              this.close();
            } else {
              this.triggerMessage({ status: "RUNNING", progress: 50 });
              this.timer = setTimeout(poll, 8000);
            }
          } else {
            // T8Star v2 default (Kling / Grok)
            const res = await originalFetch(`${job.apiBase}/v2/videos/generations/${jobId}`, { headers: { Authorization: `Bearer ${job.apiKey}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const status = (data.status ?? "").toUpperCase();
            if (status === "SUCCESS" || status === "SUCCEEDED") {
              const videoUrl = data.data?.output ?? data.output ?? data.video_url ?? "";
              this.triggerMessage({ status: "SUCCEEDED", videoUrl, originalVideoUrl: videoUrl });
              this.close();
            } else if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
              this.triggerMessage({ status: "FAILED", error: data.fail_reason || "Video generation failed" });
              this.close();
            } else {
              this.triggerMessage({ status: "RUNNING", progress: 50 });
              this.timer = setTimeout(poll, 8000);
            }
          }
        } else {
          // Image polling
          const endpoint = job.isNanoBanana ? `${job.apiBase}/api/gemini/nano-banana/${jobId}` : `${job.apiBase}/v1/tasks/${jobId}`;
          const res = await originalFetch(endpoint, { headers: { Authorization: job.apiKey } });
          if (!res.ok) throw new Error(`Upstream returned HTTP ${res.status}`);
          const json = await res.json();
          const record = job.isNanoBanana ? (json.data ?? json) : json;
          const state = record.state ?? "";
          if (state === "succeeded") {
            const imageUrl = record.data?.images?.[0]?.url;
            if (!imageUrl) throw new Error("Succeeded but no image URL");
            job.status = "SUCCEEDED"; job.url = imageUrl; mockJobs.set(jobId, job);
            this.triggerMessage({ status: "SUCCEEDED", url: imageUrl, thumbnailUrl: record.data?.images?.[0]?.thumbnailUrl || imageUrl, width: record.data?.images?.[0]?.width || 1024, height: record.data?.images?.[0]?.height || 1024, progress: 100, assets: (record.data?.images || []).map((img: any) => ({ url: img.url, thumbnailUrl: img.thumbnailUrl || img.url })) });
            this.close();
          } else if (state === "failed" || state === "error") {
            const failMsg = record.data?.description || record.msg || "Unknown error";
            job.status = "FAILED"; job.error = failMsg; mockJobs.set(jobId, job);
            this.triggerMessage({ status: "FAILED", error: failMsg });
            this.close();
          } else {
            this.triggerMessage({ status: "RUNNING", progress: record.progress || 50 });
            this.timer = setTimeout(poll, 3000);
          }
        }
      } catch (err: any) {
        console.error("[MockEventSource] Poll error:", err);
        this.timer = setTimeout(poll, 4000);
      }
    };
    poll();
  }

  private triggerMessage(data: any) {
    const me = new MessageEvent("message", {
      data: JSON.stringify(data)
    });
    if (this.onmessage) this.onmessage(me);
    this.dispatchEvent(me);
  }

  private triggerError(msg: string) {
    this.readyState = 2; // CLOSED
    if (this.onerror) this.onerror(new Event("error"));
    this.dispatchEvent(new Event("error"));
  }

  close() {
    this.readyState = 2; // CLOSED
    if (this.timer) clearTimeout(this.timer);
    if ((this as any)._nativeES) {
      (this as any)._nativeES.close();
    }
  }
}

(window as any)._originalEventSource = originalEventSource;
(window as any).EventSource = MockEventSource as any;

// ─── Helper: upload local/blob/localhost URL to a public image host ───
// Duomi GPT Image 2 API only accepts public HTTPS URLs, NOT base64 Data URIs.
// We must upload local images to a public host and return the URL.
async function ensurePublicRefUrl(url: string): Promise<string> {
  if (!url) return url;
  // Treat as public only if it's an absolute http(s) URL NOT pointing to local
  const isPublic = (url.startsWith("http://") || url.startsWith("https://")) && !url.includes("localhost") && !url.includes("127.0.0.1");
  if (isPublic) return url;

  console.log("[ref-upload] Local URL detected, must upload to public host:", url.substring(0, 80));

  try {
    // For relative paths, pass directly to Python proxy which can read from disk
    if (url.startsWith("/")) {
      console.log("[ref-upload] Relative path → sending to Python proxy for disk read + public upload");
      const proxyRes = await originalFetch("/api/upload-to-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(120000),
      });
      if (!proxyRes.ok) {
        const errText = await proxyRes.text().catch(() => "");
        throw new Error(`代理接口响应错误 (HTTP ${proxyRes.status}): ${errText}`);
      }
      const proxyJson = await proxyRes.json();
      if (proxyJson.ok && proxyJson.public_url) {
        console.log("[ref-upload] Public URL obtained:", proxyJson.public_url);
        return proxyJson.public_url;
      }
      throw new Error(proxyJson.error || "图床上传返回了空地址");
    }

    // For blob: / data: / localhost URLs, fetch → base64 → send to Python proxy
    const clientRes = await originalFetch(url);
    if (!clientRes.ok) {
      throw new Error(`读取本地参考图数据失败: HTTP ${clientRes.status}`);
    }
    const blob = await clientRes.blob();
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    console.log("[ref-upload] Converted to base64, size:", Math.round(base64Data.length / 1024), "KB, uploading to public host...");

    const proxyRes = await originalFetch("/api/upload-to-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Data }),
      signal: AbortSignal.timeout(120000),
    });
    if (!proxyRes.ok) {
      const errText = await proxyRes.text().catch(() => "");
      throw new Error(`代理接口响应错误 (HTTP ${proxyRes.status}): ${errText}`);
    }
    const proxyJson = await proxyRes.json();
    if (proxyJson.ok && proxyJson.public_url) {
      console.log("[ref-upload] Public URL obtained:", proxyJson.public_url);
      return proxyJson.public_url;
    }
    throw new Error(proxyJson.error || "图床上传返回了空地址");
  } catch (e: any) {
    const errorMsg = `参考图上传公网失败: ${e?.message || e}`;
    console.error(`[ref-upload] ${errorMsg}`);
    throw new Error(errorMsg);
  }
}

// ─── Global Fetch Interceptor to Mock Server-Side APIs ───
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  // Intercept billing & pricing to avoid 404s
  if (url.includes("/api/pricing/active")) {
    return new Response(JSON.stringify({
      billing_mode: "free",
      concurrency_limit: 10,
      price: 0
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (url.includes("/api/billing/balance")) {
    return new Response(JSON.stringify({
      balance: 999999,
      total_deposited: 999999,
      total_debited: 0
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Intercept POST /api/generate/text → OpenAI-compatible streaming
  if (url.includes("/api/generate/text") && init?.method === "POST") {
    try {
      const body = JSON.parse(init.body as string);
      const { model, prompt, media } = body;

      let configKey = "deepseek_v4_flash";
      if (model?.includes("gemini")) configKey = "gemini_2_5_flash";
      else if (model?.includes("deepseek")) configKey = "deepseek_v4_flash";
      else if (model?.includes("gpt") || model?.includes("chatgpt") || model?.includes("o1") || model?.includes("o3")) configKey = "chatgpt_5_5";

      const savedCfgStr = localStorage.getItem("ps_canvas_individual_models_config");
      let txtApiKey = "", txtApiBase = "", txtModelName = "";
      if (savedCfgStr) {
        const cfg = JSON.parse(savedCfgStr);
        const m = cfg[configKey];
        if (m) { txtApiKey = m.apiKey || ""; txtApiBase = (m.apiBase || "").trim().replace(/\/$/, ""); txtModelName = m.modelName || model; }
      }

      if (!txtApiKey) {
        return new Response(JSON.stringify({ error: `缺少 ${configKey} 的 API Key，请在右上角设置中配置。` }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const isGeminiNative = txtApiBase.includes("generativelanguage.googleapis.com");

      // Build user message content (supports media attachments)
      let userContent: any = prompt;
      if (media && (media as any[]).length > 0) {
        const parts: any[] = [];
        for (const item of (media as Array<{ url: string; type: string }>) ) {
          try {
            const mRes = await originalFetch(item.url);
            const blob = await mRes.blob();
            const dataUri = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
            parts.push({ type: "image_url", image_url: { url: dataUri } });
          } catch {}
        }
        parts.push({ type: "text", text: prompt });
        userContent = parts;
      }

      let upstreamTxtRes: Response;
      if (isGeminiNative) {
        const geminiUrl = `${txtApiBase}/models/${txtModelName || model}:streamGenerateContent?key=${txtApiKey}&alt=sse`;
        const gParts = Array.isArray(userContent)
          ? (userContent as any[]).map((p: any) => p.type === "text" ? { text: p.text } : { inlineData: { mimeType: "image/webp", data: (p.image_url?.url ?? "").split(",")[1] || "" } })
          : [{ text: prompt }];
        upstreamTxtRes = await originalFetch(geminiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: gParts }] }) });
      } else {
        const endpointBase = /\/v\d+\b/.test(txtApiBase) ? txtApiBase : `${txtApiBase}/v1`;
        upstreamTxtRes = await originalFetch(`${endpointBase}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${txtApiKey}` },
          body: JSON.stringify({ model: txtModelName || model, messages: [{ role: "system", content: "You are a helpful assistant. Always respond in plain text only. Do NOT use any Markdown formatting." }, { role: "user", content: userContent }], stream: true, max_tokens: 3000 })
        });
      }

      if (!upstreamTxtRes.ok) {
        const errText = await upstreamTxtRes.text().catch(() => "Unknown error");
        return new Response(JSON.stringify({ error: `文本生成失败: ${errText.slice(0, 500)}` }), { status: upstreamTxtRes.status, headers: { "Content-Type": "application/json" } });
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      (async () => {
        const reader = upstreamTxtRes.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n"); buf = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data: ")) continue;
              const d = t.slice(6);
              if (d === "[DONE]") { await writer.write(encoder.encode("data: [DONE]\n\n")); continue; }
              try {
                const parsed = JSON.parse(d);
                const deltaText = parsed.choices?.[0]?.delta?.content;
                if (deltaText) await writer.write(encoder.encode(`data: ${JSON.stringify({ text: deltaText })}\n\n`));
                const geminiText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (geminiText) await writer.write(encoder.encode(`data: ${JSON.stringify({ text: geminiText })}\n\n`));
              } catch {}
            }
          }
        } catch (e) { console.error("[text-gen] stream error:", e); }
        finally { try { await writer.close(); } catch {} }
      })();

      return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `文本生成失败: ${e?.message || e}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // Intercept direct local image generation endpoint to proxy to Duomi / T8Star
  if (url.includes("/api/generate/image") && init && init.method === "POST") {
    try {
      const body = JSON.parse(init.body as string);
      const { prompt, model_id, aspect_ratio, image_size, reference_images, output_quality, count } = body;

      console.log("[ref-upload] === Intercepted Generate Image ===");
      console.log("[ref-upload] Model ID:", model_id);
      console.log("[ref-upload] Raw reference_images from frontend:", reference_images);

      const savedConfigStr = localStorage.getItem("ps_canvas_individual_models_config");
      let apiKey = "";
      let apiBase = "https://duomiapi.com";
      let isNanoBanana = false;

      if (savedConfigStr) {
        const config = JSON.parse(savedConfigStr);
        let modelSettings = null;
        if (model_id?.startsWith("nano-banana")) {
          isNanoBanana = true;
          modelSettings = config.nano_banana_2 || config.nano_banana_pro;
        } else {
          modelSettings = config.gpt_image_2 || config.gpt_image_2_lite;
        }
        if (modelSettings) {
          apiKey = modelSettings.apiKey || "";
          if (modelSettings.apiBase && modelSettings.apiBase.trim()) {
            apiBase = modelSettings.apiBase.trim().replace(/\/$/, "");
          }
        }
      }

      if (!apiKey) {
        return new Response(JSON.stringify({ error: `缺少模型 ${model_id} 的 API Key，请在右上角设置中进行配置。` }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      let upstreamRes;
      let finalJobId = "";

      if (isNanoBanana) {
        const duomiModel = model_id === "nano-banana-pro" ? "gemini-3-pro-image-preview" : "gemini-3.1-flash-image-preview";
        const hasRefs = reference_images && reference_images.length > 0;
        const endpoint = hasRefs
          ? `${apiBase}/api/gemini/nano-banana-edit`
          : `${apiBase}/api/gemini/nano-banana`;

        const bodyObj: any = {
          model: duomiModel,
          prompt,
          image_size: image_size || "1K",
          aspect_ratio: aspect_ratio || "16:9",
        };
        if (hasRefs) {
          console.log("[ref-upload] Converting Nano Banana reference images...");
          const publicNbRefs = await Promise.all((reference_images as string[]).map(ensurePublicRefUrl));
          console.log("[ref-upload] Nano Banana references converted:", publicNbRefs);
          bodyObj.image_urls = publicNbRefs;
        }

        console.log("[ref-upload] Sending to Nano Banana endpoint:", endpoint);
        console.log("[ref-upload] Nano Banana Payload:", bodyObj);

        upstreamRes = await originalFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify(bodyObj),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text().catch(() => "Unknown error");
          return new Response(JSON.stringify({ error: `Duomi Nano Banana 提交错误: ${errText}` }), { status: upstreamRes.status, headers: { "Content-Type": "application/json" } });
        }

        const resJson = await upstreamRes.json();
        finalJobId = resJson.data?.task_id || resJson.task_id;
      } else {
        const ratioVal = aspect_ratio && aspect_ratio !== "auto" ? aspect_ratio : "1:1";
        // Duomi GPT Image 2 requires ratio format like "16:9", "1:1", not resolution pixels
        const sizeValue = ratioVal;
        const gptQuality = output_quality || "auto";

        const bodyObj: any = {
          model: "gpt-image-2",
          prompt,
          n: count || 1,
          quality: gptQuality,
          size: sizeValue,
        };
        if (reference_images && reference_images.length > 0) {
          console.log("[ref-upload] Converting GPT Image 2 reference images...");
          const publicRefs = await Promise.all((reference_images as string[]).map(ensurePublicRefUrl));
          console.log("[ref-upload] GPT Image 2 references converted:", publicRefs);
          bodyObj.image = publicRefs;
        }

        const duomiUrl = `${apiBase}/v1/images/generations?async=true`;
        console.log("[ref-upload] Sending to Duomi GPT Image 2 endpoint:", duomiUrl);
        console.log("[ref-upload] GPT Image 2 Payload:", bodyObj);

        upstreamRes = await originalFetch(duomiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify(bodyObj),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text().catch(() => "Unknown error");
          return new Response(JSON.stringify({ error: `Duomi GPT Image 2 提交错误: ${errText}` }), { status: upstreamRes.status, headers: { "Content-Type": "application/json" } });
        }

        const resJson = await upstreamRes.json();
        finalJobId = resJson.id;
      }

      if (!finalJobId) {
        return new Response(JSON.stringify({ error: "接口提交成功但未返回 task_id" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      mockJobs.set(finalJobId, {
        id: finalJobId,
        modelId: model_id,
        type: "image",
        status: "RUNNING",
        progress: 10,
        apiKey,
        apiBase,
        isNanoBanana
      });

      return new Response(JSON.stringify({ jobId: finalJobId, price: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `生成失败: ${e?.message || e}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // Intercept POST /api/generate/video → call video generation API directly
  if (url.includes("/api/generate/video") && !url.includes("video-edit") && init?.method === "POST") {
    try {
      const body = JSON.parse(init.body as string);
      const { model_id, prompt, aspect_ratio, duration_s, generate_audio, resolution, start_image_url, end_image_url, element_images, ref_video_urls, ref_audio_urls, video_ref_mode, project_id } = body;

      const isJimengCli = model_id === "seedance-2-fast-cli" || model_id === "seedance-2-cli";
      if (isJimengCli) {
        const jmRes = await originalFetch(`/api/jimeng-cli/generate-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model_id,
            aspect_ratio,
            duration_s,
            generate_audio,
            resolution,
            video_ref_mode,
            start_image_url,
            end_image_url,
            element_images,
            ref_video_urls,
            ref_audio_urls,
            project_id: project_id || PROJECT_ID,
          }),
        });
        const jmJson = await jmRes.json().catch(() => ({}));
        if (!jmRes.ok || jmJson?.ok === false) {
          const errMsg = jmJson?.error || jmJson?.raw || `HTTP ${jmRes.status}`;
          return new Response(JSON.stringify({ error: `即梦 CLI 视频生成失败: ${String(errMsg).slice(0, 500)}` }), { status: jmRes.status || 500, headers: { "Content-Type": "application/json" } });
        }
        const jmJobId = jmJson.submit_id || jmJson.jobId || jmJson.id;
        if (!jmJobId) {
          return new Response(JSON.stringify({ error: "即梦 CLI 提交成功但未返回任务 ID" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
        mockJobs.set(jmJobId, {
          id: jmJobId,
          modelId: model_id,
          type: "video",
          status: "RUNNING",
          progress: 10,
          apiKey: "",
          apiBase: "",
          isNanoBanana: false,
          apiFormat: "jimeng-cli",
          projectId: String(project_id || PROJECT_ID),
        });
        return new Response(JSON.stringify({ jobId: jmJobId, price: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      let vidConfigKey = "kling_video";
      if (model_id?.includes("grok-video") || model_id?.includes("grok_video")) vidConfigKey = "grok_video";
      else if (model_id?.includes("seedance")) vidConfigKey = "seedance_video";
      else if (model_id?.includes("wan")) vidConfigKey = "wan_video";

      const vidCfgStr = localStorage.getItem("ps_canvas_individual_models_config");
      let vidApiKey = "", vidApiBase = "", vidModelName = "";
      if (vidCfgStr) {
        const cfg = JSON.parse(vidCfgStr);
        const m = cfg[vidConfigKey];
        if (m) { vidApiKey = m.apiKey || ""; vidApiBase = (m.apiBase || "").trim().replace(/\/$/, ""); vidModelName = m.modelName || model_id; }
      }

      if (!vidApiKey) {
        return new Response(JSON.stringify({ error: `缺少 ${vidConfigKey} 的 API Key，请在右上角设置中配置。` }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      let vidFmt = "t8star-v2";
      if (vidApiBase.includes("kie.ai")) vidFmt = "kie";
      else if (vidConfigKey === "seedance_video" && (vidApiBase.includes("t8star") || vidApiBase.includes("bytepluses"))) vidFmt = "t8star-seedance";
      else if (vidApiBase.includes("router.ai")) vidFmt = "opencrow-wan";

      const vidRatio = aspect_ratio || "16:9";
      const vidDur = Number(duration_s) || 5;
      const vidRes = resolution || "720p";
      let vidJobId = "";

      if (vidFmt === "kie") {
        const kieInput: Record<string, unknown> = { prompt, aspect_ratio: vidRatio, duration: String(vidDur), resolution: vidRes, generate_audio: generate_audio !== false, mode: "normal" };
        if (start_image_url) kieInput.first_frame_url = start_image_url;
        if (end_image_url) kieInput.last_frame_url = end_image_url;
        if (element_images?.length) kieInput.reference_image_urls = element_images;
        if (ref_video_urls?.length) kieInput.reference_video_urls = ref_video_urls;
        const kieVRes = await originalFetch(`${vidApiBase}/api/v1/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${vidApiKey}` }, body: JSON.stringify({ model: vidModelName, input: kieInput }) });
        if (!kieVRes.ok) { const t = await kieVRes.text().catch(() => ""); return new Response(JSON.stringify({ error: `视频生成失败: ${t.slice(0, 500)}` }), { status: kieVRes.status, headers: { "Content-Type": "application/json" } }); }
        const kieVJson = await kieVRes.json();
        vidJobId = kieVJson.data?.taskId ?? kieVJson.data?.recordId ?? "";
      } else if (vidFmt === "t8star-seedance") {
        const scContent: any[] = [{ type: "text", text: prompt }];
        if (start_image_url) scContent.push({ type: "image_url", image_url: { url: start_image_url }, role: "first_frame" });
        if (end_image_url) scContent.push({ type: "image_url", image_url: { url: end_image_url }, role: "last_frame" });
        if (element_images?.length) (element_images as string[]).forEach((img) => scContent.push({ type: "image_url", image_url: { url: img } }));
        if (ref_video_urls?.length) (ref_video_urls as string[]).forEach((vid) => scContent.push({ type: "video_url", video_url: { url: vid } }));
        const scRes = await originalFetch(`${vidApiBase}/seedance/v3/contents/generations/tasks`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${vidApiKey}` }, body: JSON.stringify({ model: vidModelName, content: scContent, ratio: vidRatio, duration: vidDur, resolution: vidRes, generate_audio: generate_audio !== false }) });
        if (!scRes.ok) { const t = await scRes.text().catch(() => ""); return new Response(JSON.stringify({ error: `视频生成失败: ${t.slice(0, 500)}` }), { status: scRes.status, headers: { "Content-Type": "application/json" } }); }
        const scJson = await scRes.json();
        vidJobId = scJson.id ?? scJson.data?.task_id ?? scJson.data?.id ?? "";
      } else if (vidFmt === "opencrow-wan") {
        const ocRes = await originalFetch(`${vidApiBase}/v1/videos/generations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${vidApiKey}` }, body: JSON.stringify({ model: vidModelName, duration: vidDur, resolution: vidRes, aspect_ratio: vidRatio, input: { prompt } }) });
        if (!ocRes.ok) { const t = await ocRes.text().catch(() => ""); return new Response(JSON.stringify({ error: `视频生成失败: ${t.slice(0, 500)}` }), { status: ocRes.status, headers: { "Content-Type": "application/json" } }); }
        const ocJson = await ocRes.json();
        vidJobId = ocJson.id ?? ocJson.task_id ?? ocJson.data?.id ?? "";
      } else {
        // T8Star v2 (Kling / Grok via T8Star)
        const t8Body: Record<string, unknown> = { model: vidModelName, prompt, ratio: vidRatio, duration: vidDur, resolution: vidRes, generate_audio: generate_audio !== false };
        if (start_image_url) t8Body.start_frame_image = start_image_url;
        if (end_image_url) t8Body.end_frame_image = end_image_url;
        if (element_images?.length) t8Body.images = element_images;
        const t8Res = await originalFetch(`${vidApiBase}/v2/videos/generations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${vidApiKey}` }, body: JSON.stringify(t8Body) });
        if (!t8Res.ok) { const t = await t8Res.text().catch(() => ""); return new Response(JSON.stringify({ error: `视频生成失败: ${t.slice(0, 500)}` }), { status: t8Res.status, headers: { "Content-Type": "application/json" } }); }
        const t8Json = await t8Res.json();
        vidJobId = t8Json.task_id ?? t8Json.id ?? t8Json.data?.task_id ?? "";
      }

      if (!vidJobId) {
        return new Response(JSON.stringify({ error: "视频接口提交成功但未返回任务 ID" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      mockJobs.set(vidJobId, { id: vidJobId, modelId: model_id, type: "video", status: "RUNNING", progress: 10, apiKey: vidApiKey, apiBase: vidApiBase, isNanoBanana: false, apiFormat: vidFmt });
      return new Response(JSON.stringify({ jobId: vidJobId, price: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `视频生成失败: ${e?.message || e}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // 1. Intercept marketing studio persistence (GET)
  if (url.includes("/marketing-studio") && (!init || init.method === "GET")) {
    const localData = localStorage.getItem(MARKETING_KEY);
    return new Response(JSON.stringify({
      marketing_studio_data: localData ? JSON.parse(localData) : { sessions: [] },
      version: 1
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // 2. Intercept marketing studio persistence (PUT or POST)
  if (url.includes("/marketing-studio") && init && (init.method === "PUT" || init.method === "POST")) {
    try {
      const payload = JSON.parse(init.body as string);
      if (payload?.marketing_studio_data) {
        localStorage.setItem(MARKETING_KEY, JSON.stringify(payload.marketing_studio_data));
      }
      return new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }

  // 3. Intercept script generation
  if (url.endsWith("/marketing-studio/script") && init && init.method === "POST") {
    try {
      const payload = JSON.parse(init.body as string);
      const name = payload.productName || "产品";
      const desc = payload.productDescription || "美味健康的高品质产品";
      const isZh = payload.locale === "zh";

      const script = {
        hook: isZh 
          ? `【视频开头钩子】你敢信吗？最近火爆全网的 ${name} 居然被我淘到了，它简直是我用过最惊艳的东西，绝不夸张！` 
          : `[Hook] Can you believe it? I finally got my hands on the viral ${name}, and it is hands down the most amazing thing I've ever used!`,
        body: isZh 
          ? `【主干内容细节】作为强推主力，${name} 采用极致用料与纯天然配方：${desc}。它的细节做工和温润手感都无可挑剔，每一处人性化设计都在替用户考虑，温和好用，品质真的非常在线。` 
          : `[Body] As our top recommendation, ${name} features premium materials and organic design: ${desc}. Its build quality and tactile feel are flawless, with every detail thoughtfully tailored for the user. Mild yet highly effective.`,
        cta: isZh 
          ? `【行动呼吁】这么好用的神器你还在犹豫什么？赶紧点击下方链接，今天下单享受专属折扣，限时限量先到先得哦！` 
          : `[CTA] Don't wait on this essential daily companion! Click the link below to grab yours today with an exclusive limited-time discount!`,
        fullText: ""
      };
      script.fullText = `${script.hook}\n\n${script.body}\n\n${script.cta}`;

      return new Response(JSON.stringify({ script, suggestedPrompt: "" }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }

  // 4. Intercept prompt composition
  if (url.endsWith("/marketing-studio/compose-prompt") && init && init.method === "POST") {
    try {
      const payload = JSON.parse(init.body as string);
      const name = payload.productName || "产品";
      const script = payload.script || {};
      const isZh = payload.locale === "zh";

      const prompt = isZh
        ? `高质感电影级画面，特写微距，展示 ${name} 的细节与优雅光泽。温暖柔和的自然光线穿透窗户，环境背景略微虚化。${script.hook || ""}`
        : `High-end cinematic footage, ultra close-up macro shot showcasing elegant textures and glossy finish of ${name}. Warm soft natural morning light, moody professional shallow depth of field. ${script.hook || ""}`;

      return new Response(JSON.stringify({ prompt }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }

  // 5. Intercept material folders GET -> map real projects from local server
  if (url.includes("/api/materials/folders") && (!init || init.method === "GET")) {
    try {
      const projsRes = await originalFetch("/api/projects");
      if (!projsRes.ok) return projsRes;
      const projs = await projsRes.json();
      
      const folders = projs.map((p: any) => {
        let count = Array.isArray(p.materials) ? p.materials.length : 0;
        
        // Count generated assets from prompt histories
        ["image_prompts", "video_prompts", "skill_prompts", "audio_prompts"].forEach((cat) => {
          if (Array.isArray(p[cat])) {
            p[cat].forEach((item: any) => {
              if (item.image) count++;
              if (item.video) count++;
              if (item.audio || item.audioUrl) count++;
            });
          }
        });

        return {
          id: p.id,
          name: p.name || "未命名项目",
          material_count: count
        };
      });
      
      return new Response(JSON.stringify({ folders }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ folders: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }

  // 6. Intercept material items GET -> map real materials from the selected project (or all projects)
  if (url.includes("/api/materials") && !url.includes("/folders") && (!init || init.method === "GET")) {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      const folderId = parsedUrl.searchParams.get("folder_id") || "";
      const search = (parsedUrl.searchParams.get("q") || "").toLowerCase();
      
      const projsRes = await originalFetch("/api/projects");
      if (!projsRes.ok) return projsRes;
      const projs = await projsRes.json();
      
      let targetProjs = projs;
      if (folderId) {
        targetProjs = projs.filter((p: any) => p.id === folderId);
      }
      
      const materials: any[] = [];
      targetProjs.forEach((p: any) => {
        // 1. Map uploaded materials
        if (Array.isArray(p.materials)) {
          p.materials.forEach((m: any) => {
            if (search && !m.name.toLowerCase().includes(search)) return;
            materials.push({
              id: m.id || Math.random().toString(),
              name: m.name || "未命名素材",
              type: m.type || "IMAGE",
              storage_key: m.storage_key || m.url,
              thumbnail_url: m.thumbnail_url || m.url
            });
          });
        }

        // 2. Map generated assets from prompt histories
        ["image_prompts", "video_prompts", "skill_prompts", "audio_prompts"].forEach((cat) => {
          if (Array.isArray(p[cat])) {
            p[cat].forEach((item: any) => {
              const label = item.title || item.prompt || "生成素材";
              
              if (item.image) {
                if (search && !label.toLowerCase().includes(search)) return;
                materials.push({
                  id: `img-${item.id || Math.random().toString()}`,
                  name: label.length > 25 ? label.slice(0, 25) + "..." : label,
                  type: "IMAGE",
                  storage_key: item.image,
                  thumbnail_url: item.image
                });
              }
              
              if (item.video) {
                if (search && !label.toLowerCase().includes(search)) return;
                materials.push({
                  id: `vid-${item.id || Math.random().toString()}`,
                  name: label.length > 25 ? label.slice(0, 25) + "..." : label,
                  type: "VIDEO",
                  storage_key: item.video,
                  thumbnail_url: item.video
                });
              }
              
              const audioUrl = item.audio || item.audioUrl;
              if (audioUrl) {
                if (search && !label.toLowerCase().includes(search)) return;
                materials.push({
                  id: `aud-${item.id || Math.random().toString()}`,
                  name: label.length > 25 ? label.slice(0, 25) + "..." : label,
                  type: "AUDIO",
                  storage_key: audioUrl,
                  thumbnail_url: ""
                });
              }
            });
          }
        });
      });
      
      return new Response(JSON.stringify({ materials }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ materials: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }

  // 7. Intercept POST /api/generate/audio → call KIE audio task API directly
  if (url.includes("/api/generate/audio") && init?.method === "POST") {
    try {
      const body = JSON.parse(init.body as string);
      const { text, voice, language_code, stability, dialogue } = body;

      const audCfgStr = localStorage.getItem("ps_canvas_individual_models_config");
      let audApiKey = "", audApiBase = "https://api.kie.ai", audModelName = "elevenlabs/text-to-dialogue-v3";
      if (audCfgStr) {
        const cfg = JSON.parse(audCfgStr);
        const m = cfg.elevenlabs_audio;
        if (m) { audApiKey = m.apiKey || ""; audApiBase = (m.apiBase || "https://api.kie.ai").trim().replace(/\/$/, ""); audModelName = m.modelName || "elevenlabs/text-to-dialogue-v3"; }
      }

      if (!audApiKey) {
        return new Response(JSON.stringify({ error: "缺少 ElevenLabs Audio 的 API Key，请在右上角设置中配置。" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      const dialogueArr: Array<{ text: string; voice: string }> = Array.isArray(dialogue) && dialogue.length > 0
        ? dialogue
        : [{ text: text || "", voice: voice || "Rachel" }];

      const audRes = await originalFetch(`${audApiBase}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${audApiKey}` },
        body: JSON.stringify({ model: audModelName, input: { dialogue: dialogueArr, stability: stability ?? 0.5, ...(language_code ? { language_code } : {}) } })
      });

      if (!audRes.ok) {
        const errText = await audRes.text().catch(() => "Unknown error");
        return new Response(JSON.stringify({ error: `音频生成失败: ${errText.slice(0, 500)}` }), { status: audRes.status, headers: { "Content-Type": "application/json" } });
      }

      const audJson = await audRes.json();
      const audJobId = audJson.data?.taskId ?? audJson.data?.recordId ?? "";
      if (!audJobId) {
        return new Response(JSON.stringify({ error: "音频接口提交成功但未返回任务 ID" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      mockJobs.set(audJobId, { id: audJobId, modelId: audModelName, type: "audio", status: "RUNNING", progress: 10, apiKey: audApiKey, apiBase: audApiBase, isNanoBanana: false });
      return new Response(JSON.stringify({ jobId: audJobId, price: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `音频生成失败: ${e?.message || e}` }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  // 8. Intercept canvas AI model generations to apply individual model API keys, Base URLs and Model Names dynamically!
  if (url.startsWith("http") && (
    url.includes("generativelanguage.googleapis.com") ||
    url.includes("api.deepseek.com") ||
    url.includes("api.openai.com") ||
    url.includes("api.kie.ai") ||
    url.includes("ai.t8star.cn") ||
    url.includes("ai.t8star.org") ||
    url.includes("duomiapi.com")
  )) {
    try {
      const savedConfigStr = localStorage.getItem("ps_canvas_individual_models_config");
      if (savedConfigStr) {
        const config = JSON.parse(savedConfigStr);
        let modelSettings = null;
        let modelKey = "";

        // Determine which model is being executed
        let bodyObj = null;
        if (init && init.body && typeof init.body === "string") {
          try {
            bodyObj = JSON.parse(init.body);
          } catch (e) {}
        }

        const modelId = bodyObj?.model || "";

        if (modelId === "gemini-2.5-flash-preview-05-20" || url.includes("generativelanguage.googleapis.com")) {
          modelSettings = config.gemini_2_5_flash;
          modelKey = "gemini_2_5_flash";
        } else if (modelId === "deepseek-v4-flash" || url.includes("api.deepseek.com")) {
          modelSettings = config.deepseek_v4_flash;
          modelKey = "deepseek_v4_flash";
        } else if (modelId === "gpt-5.5" || (url.includes("api.openai.com") && !url.includes("images"))) {
          modelSettings = config.chatgpt_5_5;
          modelKey = "chatgpt_5_5";
        } else if (modelId === "nano-banana-2") {
          modelSettings = config.nano_banana_2;
          modelKey = "nano_banana_2";
        } else if (modelId === "nano-banana-pro") {
          modelSettings = config.nano_banana_pro;
          modelKey = "nano_banana_pro";
        } else if (modelId === "nano-banana-pro-ultra") {
          modelSettings = config.nano_banana_pro_ultra;
          modelKey = "nano_banana_pro_ultra";
        } else if (modelId === "gpt-image-2" || url.includes("duomiapi.com")) {
          modelSettings = config.gpt_image_2;
          modelKey = "gpt_image_2";
        } else if (modelId === "gpt-image-2-lite") {
          modelSettings = config.gpt_image_2_lite;
          modelKey = "gpt_image_2_lite";
        } else if (modelId === "grok-imagine" || url.includes("api.kie.ai")) {
          modelSettings = config.grok_imagine;
          modelKey = "grok_imagine";
        }

        if (modelSettings && modelSettings.apiKey) {
          const headers = new Headers(init?.headers || {});
          const token = url.includes("duomiapi.com") ? modelSettings.apiKey : `Bearer ${modelSettings.apiKey}`;
          headers.set("Authorization", token);
          
          const newInit = { ...(init || {}), headers };

          // Handle custom API Base URL rewriting
          if (modelSettings.apiBase && modelSettings.apiBase.trim()) {
            let customBase = modelSettings.apiBase.trim().replace(/\/$/, "");
            const originalOrigin = new URL(url).origin;
            url = url.replace(originalOrigin, customBase);
          }

          // Handle custom Model Name override
          if (modelSettings.modelName && modelSettings.modelName.trim() && bodyObj) {
            bodyObj.model = modelSettings.modelName.trim();
            newInit.body = JSON.stringify(bodyObj);
          }

          console.log(`[API Interceptor] Proxied ${modelKey} request to custom base URL: ${url}`);
          return originalFetch(url, newInit);
        }
      }
    } catch (e) {
      console.error("[API Interceptor] Error rewriting external fetch:", e);
    }
  }

  // Fallback to original fetch
  return originalFetch.apply(this, arguments as any);
};

type InteractionMode = "select" | "pan";

interface ContextMenuState {
  x: number; y: number;
  target: { type: "node" | "edge" | "canvas"; id?: string };
}

function readLocalViewport() {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { x: number; y: number; zoom: number };
    return { x: Number(p.x) || 0, y: Number(p.y) || 0, zoom: Math.max(CANVAS_MIN_ZOOM, Number(p.zoom) || 1) };
  } catch { return undefined; }
}

function CanvasApp() {
  const [projectName, setProjectName] = useState("未命名画布");
  const [loaded, setLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [handleMenu, setHandleMenu] = useState<{ x: number; y: number } | null>(null);
  const [connDropMenu, setConnDropMenu] = useState<{ x: number; y: number; sourceNodeId: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showMarketing, setShowMarketing] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("select");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFromSerialized = useCanvasStore((s) => s.loadFromSerialized);
  const getSerializableState = useCanvasStore((s) => s.getSerializableState);
  const addNode = useCanvasStore((s) => s.addNode);
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const setProjectId = useCanvasStore((s) => s.setProjectId);
  const isDirty = useCanvasStore((s) => s.isDirty);

  // Sync PROJECT_ID to store on mount
  useEffect(() => {
    setProjectId(PROJECT_ID);
  }, [setProjectId]);

  // ─── Load from localStorage & Fetch real Project Name ───
  useEffect(() => {
    try {
      const savedVp = readLocalViewport();
      if (savedVp) viewportRef.current = savedVp;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as SerializedCanvas;
        loadFromSerialized(data);
        if (data.viewport) viewportRef.current = data.viewport;
      }
      
      const nameRaw = localStorage.getItem("ps_canvas_name");
      if (nameRaw) setProjectName(nameRaw);

      if (PROJECT_ID && PROJECT_ID !== "ps-local") {
        fetch("/api/projects")
          .then((res) => (res.ok ? res.json() : []))
          .then((projs) => {
            const proj = projs.find((p: any) => p.id === PROJECT_ID);
            if (proj && proj.name) {
              setProjectName(proj.name);
              try { localStorage.setItem("ps_canvas_name", proj.name); } catch {}
            }
          })
          .catch((err) => console.error("Failed to fetch project name:", err));
      }
    } catch {}
    setLoaded(true);
  }, [loadFromSerialized]);

  // ─── Auto-save to localStorage & Sync to Prompt Studio Database ───
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const state = getSerializableState(viewportRef.current);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}

      // Dual-sync to Prompt Studio local database
      if (PROJECT_ID && PROJECT_ID !== "ps-local") {
        try {
          const nodesList = state.nodes || [];
          for (const n of nodesList) {
            const isImage = n.type === "image-gen";
            const isVideo = n.type === "video-gen";
            const isAudio = n.type === "audio-gen" || n.type === "source-audio";
            const isPrompt = n.type === "prompt";
            
            if (isImage || isVideo || isAudio || isPrompt) {
              const promptText = n.data?.prompt || n.data?.text || "";
              if (!promptText) continue;
              
              const category = isImage ? "image_prompts" : isVideo ? "video_prompts" : "skill_prompts";
              
              await fetch("/api/save-prompt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: n.id, // Use node ID for 1:1 sync mapping
                  projectId: PROJECT_ID,
                  category,
                  title: n.data?.label || n.data?.title || "",
                  prompt: promptText,
                  model: n.data?.model || "",
                  tags: n.data?.tags || []
                })
              });
            }
          }
        } catch (e) {
          console.error("Failed to sync prompts to local DB:", e);
        }
      }
    }, 1500);
  }, [getSerializableState]);

  useEffect(() => { if (loaded && isDirty) scheduleSave(); }, [isDirty, loaded, scheduleSave]);

  // ─── Instant save on Page unload/exit ───
  useEffect(() => {
    const handleUnload = () => {
      const isDirtyState = useCanvasStore.getState().isDirty;
      if (isDirtyState) {
        const state = getSerializableState(viewportRef.current);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
          console.error("Failed to save state on page unload:", e);
        }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [getSerializableState]);

  // ─── Direct Synchronous Theme Check and Sync + Messages Integration ───
  useEffect(() => {
    const syncTheme = () => {
      try {
        if (window.parent && window.parent.document) {
          const pBody = window.parent.document.body;
          const isDark = pBody.classList.contains("dark") || pBody.classList.contains("dark2");
          document.documentElement.classList.toggle("dark", isDark);
          document.body.classList.toggle("dark", isDark);
        }
      } catch (e) {}

      try {
        window.parent.postMessage({ type: "PS_GET_THEME" }, "*");
      } catch (e) {}
    };

    // Sync immediately on mount
    syncTheme();

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "PS_THEME") {
        const isDark = e.data.theme === "dark";
        document.documentElement.classList.toggle("dark", isDark);
        document.body.classList.toggle("dark", isDark);
      }
      if (e.data?.type === "THEME_CHANGED") {
        document.body.className = e.data.theme === "light" ? "theme-light" : e.data.theme === "light2" ? "theme-light2" : "";
        try { localStorage.setItem("ps_canvas_theme", e.data.theme); } catch {}
      }
      if (e.data?.type === "ASSET_TO_CANVAS") {
        const asset = e.data.asset;
        if (!asset) return;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const vp = viewportRef.current;
        const fx = (cx - vp.x) / vp.zoom;
        const fy = (cy - vp.y) / vp.zoom;
        const nodeType: NodeType = asset.type === "video" ? "source-image" : asset.type === "audio" ? "source-audio" : "source-image";
        addNodeWithData(nodeType, fx - 150, fy - 100, {
          imageUrl: asset.url, label: asset.name, status: "succeeded",
        });
      }
      if (e.data?.type === "CANVAS_RENAME") {
        setProjectName(e.data.name || "未命名画布");
        try { localStorage.setItem("ps_canvas_name", e.data.name); } catch {}
      }
    };

    window.addEventListener("message", handler);
    const interval = setInterval(syncTheme, 1000);

    return () => {
      window.removeEventListener("message", handler);
      clearInterval(interval);
    };
  }, [addNodeWithData]);

  // ─── Restore theme from localStorage ───
  useEffect(() => {
    try {
      const theme = localStorage.getItem("ps_canvas_theme") || "";
      if (theme === "light") document.body.className = "theme-light";
      else if (theme === "light2") document.body.className = "theme-light2";
    } catch {}
  }, []);

  // ─── File drop handler ───
  const handleFileDrop = useCallback(async (files: File[], flowX: number, flowY: number) => {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        try {
          const result = await uploadFile(file);
          if ("url" in result) {
            const rawW = Number((result as any).width || 0);
            const rawH = Number((result as any).height || 0);

            let finalSize: { w: number; h: number } | undefined = undefined;
            if (rawW > 0 && rawH > 0) {
              const BASE = 280;
              const ratio = rawW / rawH;
              finalSize = {
                w: ratio >= 1 ? Math.round(BASE * ratio) : BASE,
                h: ratio >= 1 ? BASE : Math.round(BASE / ratio)
              };
            }

            addNodeWithData("source-image", flowX, flowY, {
              imageUrl: result.url, label: file.name, status: "succeeded",
              width: rawW, height: rawH,
            }, finalSize);
            flowX += 20; flowY += 20;
          }
        } catch {}
      } else if (file.type.startsWith("audio/")) {
        try {
          const result = await uploadFile(file);
          if ("audioUrl" in result) {
            addNodeWithData("source-audio", flowX, flowY, {
              audioUrl: result.audioUrl, audioDuration: result.audioDuration, label: file.name,
            });
          }
        } catch {}
      } else if (file.type.startsWith("video/")) {
        try {
          const result = await uploadFile(file);
          if ("videoUrl" in result) {
            const vr = result as any;
            const rawW = Number(vr.width || 0);
            const rawH = Number(vr.height || 0);

            let finalSize: { w: number; h: number } | undefined = undefined;
            if (rawW > 0 && rawH > 0) {
              const BASE = 280;
              const ratio = rawW / rawH;
              finalSize = {
                w: ratio >= 1 ? Math.round(BASE * ratio) : BASE,
                h: ratio >= 1 ? BASE : Math.round(BASE / ratio)
              };
            }

            addNodeWithData("source-image", flowX, flowY, {
              videoUrl: vr.videoUrl,
              originalVideoUrl: vr.originalVideoUrl ?? vr.videoUrl,
              thumbnailUrl: vr.thumbnailUrl,
              label: file.name,
              status: "succeeded",
              width: rawW,
              height: rawH,
            }, finalSize);
            flowX += 20; flowY += 20;
          }
        } catch {}
      }
    }
  }, [addNodeWithData]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !contextMenu) return;
    const vp = viewportRef.current;
    const flowX = (contextMenu.x - vp.x) / vp.zoom - 150;
    const flowY = (contextMenu.y - vp.y) / vp.zoom - 100;
    await handleFileDrop(Array.from(files), flowX, flowY);
    e.target.value = "";
  }, [contextMenu, handleFileDrop]);

  // ─── Connection drop: show connection drop menu ───
  const handleConnectionDrop = useCallback((sourceNodeId: string, screenX: number, screenY: number) => {
    setConnDropMenu({ x: screenX, y: screenY, sourceNodeId });
  }, []);

  // ─── Add node via pane double-click ───
  const handlePaneDoubleClick = useCallback((_screen: { x: number; y: number }, flow: { x: number; y: number }) => {
    addNodeWithData("text", flow.x - 150, flow.y - 100, {});
  }, [addNodeWithData]);

  const handleViewportChange = useCallback((vp: { x: number; y: number; zoom: number }) => {
    viewportRef.current = vp;
    try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(vp)); } catch {}
  }, []);

  // ─── Handle rename ───
  const handleRename = useCallback(async (name: string) => {
    setProjectName(name);
    try { localStorage.setItem("ps_canvas_name", name); } catch {}
    if (PROJECT_ID && PROJECT_ID !== "ps-local") {
      try {
        await fetch("/api/rename-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: PROJECT_ID, name }),
        });
      } catch (e) {
        console.error("Failed to rename project on server:", e);
      }
    }
    window.parent?.postMessage({ type: "CANVAS_RENAMED", name }, "*");
  }, []);

  const defaultViewport = readLocalViewport();

  if (!loaded) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#10151c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#91a0b2", fontSize: 14 }}>加载中…</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <CanvasTopBar
        projectName={projectName}
        onRename={handleRename}
        saveStatus="saved"
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {!showMaterials && !showAssets && (
          <DockToolbar
            onOpenAddMenu={(x, y) => setHandleMenu({ x, y })}
            storyboardOpen={showStoryboard}
            onToggleStoryboard={() => setShowStoryboard((v) => !v)}
            assetsOpen={showAssets}
            onToggleAssets={() => setShowAssets((v) => !v)}
            materialsOpen={showMaterials}
            onToggleMaterials={() => setShowMaterials((v) => !v)}
            marketingOpen={showMarketing}
            onToggleMarketing={() => setShowMarketing((v) => !v)}
            onOpenSettings={() => setShowApiSettings(true)}
          />
        )}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <ReactFlowProvider>
            <CanvasEditor
              onContextMenu={(x, y, target) => setContextMenu({ x, y, target })}
              onPaneDoubleClick={handlePaneDoubleClick}
              onPaneClick={() => setContextMenu(null)}
              onNodeClick={() => setContextMenu(null)}
              onViewportChange={handleViewportChange}
              onViewportMove={(vp) => { viewportRef.current = vp; }}
              onFileDrop={handleFileDrop}
              onConnectionDrop={handleConnectionDrop}
              onCommentPlace={(fx, fy) => {
                addNodeWithData("comment", fx, fy, {});
                useCommentModeStore.getState().exit();
              }}
              snapToGrid={snapToGrid}
              showGrid={showGrid}
              viewportRef={viewportRef}
              defaultViewport={defaultViewport}
              interactionMode={interactionMode}
            />
            <SelectionToolbar />
            <MultiDragLines />
            <CanvasControls
              showMiniMap={showMiniMap}
              onToggleMiniMap={() => setShowMiniMap((v) => !v)}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid((v) => !v)}
              snapToGrid={snapToGrid}
              interactionMode={interactionMode}
              onToggleInteractionMode={() => setInteractionMode((m) => m === "select" ? "pan" : "select")}
              onShowShortcuts={() => setShowShortcuts(true)}
            />
            <StoryboardPanel open={showStoryboard} projectId={PROJECT_ID} onClose={() => setShowStoryboard(false)} />
            <AssetPanel open={showAssets} projectId={PROJECT_ID} onClose={() => setShowAssets(false)} />
            <MaterialPanel open={showMaterials} onClose={() => setShowMaterials(false)} />
            <MarketingStudioPanel open={showMarketing} onClose={() => setShowMarketing(false)} projectId={PROJECT_ID} />
          </ReactFlowProvider>
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          onDelete={(nodeId) => useCanvasStore.getState().onNodesChange([{ id: nodeId, type: "remove" }])}
          onDeleteSelected={() => useCanvasStore.getState().deleteSelected()}
          onDuplicate={(nodeId) => {
            useCanvasStore.getState().onNodesChange([{ id: nodeId, type: "select", selected: true }]);
            useCanvasStore.getState().duplicateSelected();
          }}
          onDuplicateSelected={() => useCanvasStore.getState().duplicateSelected()}
          onCopy={() => useCanvasStore.getState().copySelected()}
          onPaste={() => useCanvasStore.getState().pasteClipboard()}
          onOpenAddNodeMenu={() => setHandleMenu({ x: contextMenu.x, y: contextMenu.y })}
          onUploadAsset={() => fileInputRef.current?.click()}
        />
      )}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelect}
        accept="image/*,audio/*,video/*"
      />
      {connDropMenu && (
        <ConnectionDropMenu
          x={connDropMenu.x}
          y={connDropMenu.y}
          sourceNodeId={connDropMenu.sourceNodeId}
          onSelect={(type: NodeType) => {
            const vp = viewportRef.current;
            const fx = (connDropMenu.x - vp.x) / vp.zoom - 150;
            const fy = (connDropMenu.y - vp.y) / vp.zoom - 100;
            const newId = addNodeWithData(type, fx, fy, {});
            useCanvasStore.getState().addEdgeById(connDropMenu.sourceNodeId, newId);
            setConnDropMenu(null);
          }}
          onClose={() => setConnDropMenu(null)}
        />
      )}
      {handleMenu && (
        <HandleMenu
          x={handleMenu.x}
          y={handleMenu.y}
          onSelect={(type: NodeType) => {
            const vp = viewportRef.current;
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            addNodeWithData(type, (cx - vp.x) / vp.zoom - 150, (cy - vp.y) / vp.zoom - 100, {});
            setHandleMenu(null);
          }}
          onClose={() => setHandleMenu(null)}
        />
      )}
      <ShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <CanvasApiSettingsModal open={showApiSettings} onClose={() => setShowApiSettings(false)} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CanvasApp />
  </StrictMode>
);



