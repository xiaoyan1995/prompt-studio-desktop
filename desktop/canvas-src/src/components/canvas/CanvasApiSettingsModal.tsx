"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Settings, Music, Loader2, Save, Sparkles } from "lucide-react";
import { showToast } from "@/components/ui/GlobalToast";
import {
  GeminiIcon,
  DeepSeekIcon,
  OpenAIIcon,
  GrokIcon,
  KlingIcon,
  SeedreamIcon,
  WanIcon,
} from "./nodes/panel-shared";

interface CanvasApiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type ModelKey = 
  | "gemini_2_5_flash"
  | "deepseek_v4_flash"
  | "chatgpt_5_5"
  | "nano_banana_2"
  | "nano_banana_pro"
  | "nano_banana_pro_ultra"
  | "gpt_image_2"
  | "gpt_image_2_lite"
  | "grok_imagine"
  | "kling_video"
  | "grok_video"
  | "seedance_video"
  | "wan_video"
  | "elevenlabs_audio";

interface ModelConfig {
  apiBase: string;
  apiKey: string;
  modelName: string;
}

type JimengModel = "seedance-2-fast-cli" | "seedance-2-cli";
type JimengStatusTone = "neutral" | "info" | "success" | "danger";

const DEFAULT_CONFIGS: Record<ModelKey, ModelConfig> = {
  gemini_2_5_flash: {
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "",
    modelName: "gemini-2.5-flash-preview-05-20",
  },
  deepseek_v4_flash: {
    apiBase: "https://api.deepseek.com",
    apiKey: "",
    modelName: "deepseek-v4-flash",
  },
  chatgpt_5_5: {
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
    modelName: "gpt-5.5",
  },
  nano_banana_2: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "nano-banana-2",
  },
  nano_banana_pro: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "nano-banana-pro",
  },
  nano_banana_pro_ultra: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "nano-banana-pro-ultra",
  },
  gpt_image_2: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "gpt-image-2",
  },
  gpt_image_2_lite: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "gpt-image-2-lite",
  },
  grok_imagine: {
    apiBase: "https://api.kie.ai",
    apiKey: "",
    modelName: "grok-imagine",
  },
  kling_video: {
    apiBase: "https://ai.t8star.cn",
    apiKey: "",
    modelName: "kling-video",
  },
  grok_video: {
    apiBase: "https://api.kie.ai",
    apiKey: "",
    modelName: "grok-video",
  },
  seedance_video: {
    apiBase: "https://ai.t8star.org",
    apiKey: "",
    modelName: "seedance-2",
  },
  wan_video: {
    apiBase: "https://api.kie.ai",
    apiKey: "",
    modelName: "wan-2.7-video",
  },
  elevenlabs_audio: {
    apiBase: "https://api.elevenlabs.io",
    apiKey: "",
    modelName: "elevenlabs/text-to-dialogue-v3",
  },
};

function getModelIcon(id: ModelKey) {
  const sizeClass = "size-4 flex-shrink-0 text-current opacity-80";
  if (id === "gemini_2_5_flash" || id === "nano_banana_2" || id === "nano_banana_pro" || id === "nano_banana_pro_ultra") {
    return <GeminiIcon className={sizeClass} />;
  }
  if (id === "deepseek_v4_flash") {
    return <DeepSeekIcon className={sizeClass} />;
  }
  if (id === "chatgpt_5_5" || id === "gpt_image_2" || id === "gpt_image_2_lite") {
    return <OpenAIIcon className={sizeClass} />;
  }
  if (id === "grok_imagine" || id === "grok_video") {
    return <GrokIcon className={sizeClass} />;
  }
  if (id === "kling_video") {
    return <KlingIcon />;
  }
  if (id === "seedance_video") {
    return <SeedreamIcon className={sizeClass} />;
  }
  if (id === "wan_video") {
    return <WanIcon className={sizeClass} />;
  }
  return <Music className={sizeClass} size={16} />;
}

export function CanvasApiSettingsModal({ open, onClose }: CanvasApiSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<ModelKey | "runware">("gemini_2_5_flash");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoUploadUrls, setAutoUploadUrls] = useState<boolean>(true);

  const [jimengDefaultModel, setJimengDefaultModel] = useState<JimengModel>("seedance-2-fast-cli");
  const [jimengDeviceCode, setJimengDeviceCode] = useState("");
  const [jimengUserCode, setJimengUserCode] = useState("");
  const [jimengAuthLink, setJimengAuthLink] = useState("");
  const [jimengStatus, setJimengStatus] = useState("状态：未检测");
  const [jimengStatusTone, setJimengStatusTone] = useState<JimengStatusTone>("neutral");
  const [jimengLoginLoading, setJimengLoginLoading] = useState(false);
  const [jimengReloginLoading, setJimengReloginLoading] = useState(false);
  const [jimengChecking, setJimengChecking] = useState(false);
  const [jimengCreditLoading, setJimengCreditLoading] = useState(false);

  const jimengPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jimengPollBusyRef = useRef(false);

  const [form, setForm] = useState<Record<ModelKey, ModelConfig>>(DEFAULT_CONFIGS);
  const [runwareApiKey, setRunwareApiKey] = useState("");

  const jimengStatusClass =
    jimengStatusTone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : jimengStatusTone === "danger"
        ? "text-red-600 dark:text-red-400"
        : jimengStatusTone === "info"
          ? "text-sky-600 dark:text-sky-400"
          : "text-zinc-500 dark:text-zinc-400";

  const stopJimengAutoPoll = useCallback(() => {
    if (jimengPollTimerRef.current) {
      clearTimeout(jimengPollTimerRef.current);
      jimengPollTimerRef.current = null;
    }
    jimengPollBusyRef.current = false;
  }, []);

  const saveDesktopSettingsPatch = useCallback(async (patch: Record<string, unknown>) => {
    const r = await fetch("/api/desktop/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.ok === false) {
      throw new Error(d?.error || `HTTP ${r.status}`);
    }
    return d?.settings || {};
  }, []);

  const checkJimengLogin = useCallback(async (deviceCode: string, silent = false) => {
    const code = String(deviceCode || "").trim();
    const r = await fetch("/api/jimeng-cli/login/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: code, poll: 5 }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(d?.error || d?.raw || `HTTP ${r.status}`);
    }
    if (!d?.ok) {
      if (!silent) {
        setJimengStatus("状态：授权未完成，请继续在浏览器确认");
        setJimengStatusTone("info");
        showToast("⏳ 授权未完成，请在浏览器确认后再点一次校验", "info");
      }
      return { ok: false, data: d };
    }
    setJimengStatus(`状态：已登录（${d?.vip_level || "-"}）`);
    setJimengStatusTone("success");
    if (!silent) {
      showToast("✅ 即梦 CLI 登录成功", "success");
    }
    return { ok: true, data: d };
  }, []);

  const queryJimengCredit = useCallback(async (silent = false) => {
    const r = await fetch("/api/jimeng-cli/user-credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.ok === false) {
      throw new Error(d?.error || d?.raw || `HTTP ${r.status}`);
    }
    const vip = d?.vip_level || "-";
    const credit = d?.total_credit ?? "-";
    const uid = d?.user_id || "-";
    setJimengStatus(`状态：已登录（${vip}） · 额度：${credit} · UID：${uid}`);
    setJimengStatusTone("success");
    if (!silent) {
      showToast("✅ 即梦 CLI 额度查询成功", "success");
    }
    return d;
  }, []);

  const startJimengAutoPoll = useCallback(
    (deviceCode: string) => {
      stopJimengAutoPoll();
      const code = String(deviceCode || "").trim();
      if (!code) return;
      setJimengStatus("状态：等待授权中，系统自动轮询…");
      setJimengStatusTone("info");

      const tick = async () => {
        if (jimengPollBusyRef.current) {
          jimengPollTimerRef.current = setTimeout(tick, 2200);
          return;
        }
        jimengPollBusyRef.current = true;
        try {
          const ret = await checkJimengLogin(code, true);
          if (ret.ok) {
            stopJimengAutoPoll();
            await queryJimengCredit(true);
            showToast("✅ 即梦 CLI 登录成功", "success");
            return;
          }
        } catch {
        } finally {
          jimengPollBusyRef.current = false;
        }
        jimengPollTimerRef.current = setTimeout(tick, 3500);
      };

      jimengPollTimerRef.current = setTimeout(tick, 1000);
    },
    [checkJimengLogin, queryJimengCredit, stopJimengAutoPoll],
  );

  const beginJimengLogin = useCallback(
    async (relogin: boolean) => {
      const setBusy = relogin ? setJimengReloginLoading : setJimengLoginLoading;
      setBusy(true);
      try {
        const r = await fetch("/api/jimeng-cli/login/headless", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relogin }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.ok === false) {
          throw new Error(d?.error || d?.raw || `HTTP ${r.status}`);
        }

        const deviceCode = String(d?.device_code || "").trim();
        const userCode = String(d?.user_code || "").trim();
        const verificationUri = String(d?.verification_uri || "").trim();

        if (deviceCode) {
          setJimengDeviceCode(deviceCode);
          try {
            await saveDesktopSettingsPatch({
              jimengDefaultModel,
              jimengDeviceCode: deviceCode,
            });
          } catch (err) {
            console.warn("Failed to sync Jimeng device code:", err);
          }
        }

        setJimengAuthLink(verificationUri);
        setJimengUserCode(userCode);

        if (d?.reused) {
          // Already logged in — CLI reused existing session, no QR needed
          setJimengStatus("状态：已复用现有登录态，无需重新扫码");
          setJimengStatusTone("success");
          showToast("✅ 已复用即梦登录态", "info");
          // Auto-trigger a check to confirm and fill device code
          if (!deviceCode) void handleJimengCheck();
          return;
        }

        if (verificationUri) {
          // Try postMessage to Electron shell first (avoids iframe popup blocking)
          try {
            window.parent.postMessage({ type: "open-url", url: verificationUri }, "*");
          } catch {
            window.open(verificationUri, "_blank");
          }
        }
        setJimengStatus("状态：已发起登录，请扫码/打开授权页完成登录");
        setJimengStatusTone("info");
        showToast("✅ 已发起即梦登录，等待授权", "info");
        startJimengAutoPoll(deviceCode);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err || "unknown");
        setJimengStatus(`状态：登录初始化失败（${errMsg}）`);
        setJimengStatusTone("danger");
        showToast(`⚠️ 即梦登录初始化失败：${errMsg}`, "warning");
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jimengDefaultModel, saveDesktopSettingsPatch, startJimengAutoPoll],
  );

  const handleJimengCheck = useCallback(async () => {
    const code = jimengDeviceCode.trim();
    if (!code) {
      showToast("⚠️ 请先发起登录，或粘贴 Device Code", "warning");
      return;
    }
    setJimengChecking(true);
    try {
      const ret = await checkJimengLogin(code, false);
      if (!ret.ok) return;
      stopJimengAutoPoll();
      await queryJimengCredit(true);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err || "unknown");
      setJimengStatus(`状态：登录校验失败（${errMsg}）`);
      setJimengStatusTone("danger");
      showToast(`⚠️ 即梦登录校验失败：${errMsg}`, "warning");
    } finally {
      setJimengChecking(false);
    }
  }, [checkJimengLogin, jimengDeviceCode, queryJimengCredit, stopJimengAutoPoll]);

  const handleJimengCredit = useCallback(async () => {
    setJimengCreditLoading(true);
    try {
      await queryJimengCredit(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err || "unknown");
      setJimengStatus(`状态：未登录或无权限（${errMsg}）`);
      setJimengStatusTone("danger");
      showToast(`⚠️ 即梦 CLI 额度查询失败：${errMsg}`, "warning");
    } finally {
      setJimengCreditLoading(false);
    }
  }, [queryJimengCredit]);

  const handleJimengCopyCode = useCallback(async () => {
    const code = jimengDeviceCode.trim();
    if (!code) {
      showToast("⚠️ 当前没有可复制的 Device Code", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      showToast("✅ Device Code 已复制", "success");
    } catch {
      showToast("⚠️ 复制失败，请手动复制", "warning");
    }
  }, [jimengDeviceCode]);

  const handleJimengOpenAuth = useCallback(() => {
    if (!jimengAuthLink) {
      showToast("⚠️ 请先点击登录获取授权链接", "warning");
      return;
    }
    window.open(jimengAuthLink, "_blank", "noopener,noreferrer");
  }, [jimengAuthLink]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    try {
      const saved = localStorage.getItem("ps_canvas_individual_models_config");
      if (saved) {
        const data = JSON.parse(saved);
        setForm((prev) => ({
          ...prev,
          ...data,
        }));
      }
      const savedAutoUpload = localStorage.getItem("ps_canvas_auto_upload_urls");
      if (savedAutoUpload !== null) {
        setAutoUploadUrls(savedAutoUpload === "true");
      }
    } catch (err) {
      console.error("Failed to load settings from localStorage:", err);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      stopJimengAutoPoll();
      return;
    }

    setJimengStatus("状态：未检测");
    setJimengStatusTone("neutral");
    setJimengAuthLink("");
    setJimengUserCode("");

    (async () => {
      try {
        const r = await fetch("/api/desktop/settings");
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.ok === false) return;
        const settings = d?.settings || {};
        const modelRaw = String(settings.jimengDefaultModel || "seedance-2-fast-cli").trim();
        setJimengDefaultModel(modelRaw === "seedance-2-cli" ? "seedance-2-cli" : "seedance-2-fast-cli");
        setJimengDeviceCode(String(settings.jimengDeviceCode || ""));
        setRunwareApiKey(String(settings.runwareApiKey || ""));
      } catch (err) {
        console.warn("Failed to load Jimeng desktop settings:", err);
      }
    })();

    return () => {
      stopJimengAutoPoll();
    };
  }, [open, stopJimengAutoPoll]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      localStorage.setItem("ps_canvas_individual_models_config", JSON.stringify(form));
      localStorage.setItem("ps_canvas_auto_upload_urls", autoUploadUrls ? "true" : "false");
      try {
        await saveDesktopSettingsPatch({
          jimengDefaultModel,
          jimengDeviceCode: jimengDeviceCode.trim(),
          runwareApiKey: runwareApiKey.trim(),
          canvasModelConfigs: JSON.stringify(form),
        });
      } catch (err) {
        console.warn("Failed to sync Jimeng settings on save:", err);
      }
      showToast("API 设置保存成功", "success");
      onClose();
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast("保存配置失败", "warning");
    } finally {
      setSaving(false);
    }
  };

  const currentConfig = activeTab !== "runware" ? (form[activeTab as ModelKey] || DEFAULT_CONFIGS[activeTab as ModelKey]) : null;

  const handleFieldChange = (field: keyof ModelConfig, value: string) => {
    if (activeTab === "runware") return;
    setForm((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab as ModelKey],
        [field]: value,
      },
    }));
  };

  const navItems: { id: ModelKey; type: "text" | "image" | "video" | "audio"; label: string; sub: string }[] = [
    { id: "gemini_2_5_flash", type: "text", label: "Gemini 2.5 Flash", sub: "谷歌多模态大模型" },
    { id: "deepseek_v4_flash", type: "text", label: "DeepSeek V4 Flash", sub: "深度求索极速大模型" },
    { id: "chatgpt_5_5", type: "text", label: "ChatGPT 5.5", sub: "OpenAI 旗舰文本模型" },
    { id: "nano_banana_2", type: "image", label: "Nano Banana 2", sub: "高效图片生成" },
    { id: "nano_banana_pro", type: "image", label: "Nano Banana Pro", sub: "超清品质图片生成" },
    { id: "nano_banana_pro_ultra", type: "image", label: "Nano Banana Pro Ultra", sub: "4K/8K 极致画质" },
    { id: "gpt_image_2", type: "image", label: "GPT Image 2", sub: "OpenAI GPT 官方正版" },
    { id: "gpt_image_2_lite", type: "image", label: "GPT Image 2 Lite", sub: "文字渲染极佳版" },
    { id: "grok_imagine", type: "image", label: "Grok Imagine", sub: "xAI Grok 绘图模型" },
    { id: "kling_video", type: "video", label: "Kling Video", sub: "可怜 3.0 / O3 视频生成" },
    { id: "grok_video", type: "video", label: "Grok Video", sub: "xAI Grok 专属视频生成" },
    { id: "seedance_video", type: "video", label: "Seedance Video", sub: "Seedance 1.5 / 2.0 系列" },
    { id: "wan_video", type: "video", label: "Wan 2.7 Video", sub: "万 2.7 阿里模型视频生成" },
    { id: "elevenlabs_audio", type: "audio", label: "ElevenLabs V3", sub: "官方 ElevenLabs 音频/人声" },
  ];

  return (
    <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-[820px] max-w-[95vw] h-[640px] max-h-[92vh] flex flex-col bg-white dark:bg-[#1a1a1a] rounded-2xl border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-zinc-100 dark:border-white/[0.08] flex-shrink-0 bg-zinc-50/50 dark:bg-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-lime-500/10 text-lime-600 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00]">
              <Settings size={20} />
            </div>
            <h2 className="text-base font-semibold tracking-wide">API 设置</h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-9 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-white/40 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 flex min-h-0">
          
          {/* Side Tabs Nav */}
          <nav className="w-[230px] flex-shrink-0 border-r border-zinc-100 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-transparent p-2.5 flex flex-col gap-1 overflow-y-auto">
            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              文本生成模型 (Text)
            </div>
            {navItems.filter(item => item.type === "text").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00] font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                  {getModelIcon(item.id)}
                  <span>{item.label}</span>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 pl-6.5 leading-tight truncate w-full">{item.sub}</span>
              </button>
            ))}

            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-3">
              图像生成模型 (Image)
            </div>
            {navItems.filter(item => item.type === "image").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00] font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                  {getModelIcon(item.id)}
                  <span>{item.label}</span>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 pl-6.5 leading-tight truncate w-full">{item.sub}</span>
              </button>
            ))}

            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-3">
              视频生成模型 (Video)
            </div>
            {navItems.filter(item => item.type === "video").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00] font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                  {getModelIcon(item.id)}
                  <span>{item.label}</span>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 pl-6.5 leading-tight truncate w-full">{item.sub}</span>
              </button>
            ))}

            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-3">
              图像增强 (Enhance)
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("runware")}
              className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                activeTab === "runware"
                  ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00] font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                <Sparkles size={16} className="flex-shrink-0 opacity-80" />
                <span>Runware 增强</span>
              </div>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 pl-6.5 leading-tight truncate w-full">Topaz Photo AI 超分辨率</span>
            </button>

            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-3">
              音频生成模型 (Audio)
            </div>
            {navItems.filter(item => item.type === "audio").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00] font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                  {getModelIcon(item.id)}
                  <span>{item.label}</span>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 pl-6.5 leading-tight truncate w-full">{item.sub}</span>
              </button>
            ))}
          </nav>

          {/* Tab Content Fields */}
          <div className="flex-1 overflow-y-auto p-7">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
                <Loader2 size={24} className="animate-spin text-lime-600 dark:text-[#CCFF00]" />
                <span className="text-sm">加载接口配置中...</span>
              </div>
            ) : (
              <form onSubmit={handleSave} className="h-full flex flex-col justify-between">
                <div className="space-y-5">
                  {activeTab === "runware" ? (
                    <>
                      <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <span className="text-sm font-bold text-lime-700 dark:text-[#CCFF00]">Runware 图像增强</span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">Topaz Photo AI · 超分辨率</span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-white/[0.03] rounded-lg p-3 border border-zinc-100 dark:border-white/[0.06]">
                        Runware 是调用 Topaz Photo AI 超分辨率算法的云端平台，支持 Standard V2 / High Fidelity V2 等增强模型。<br />
                        请前往{" "}
                        <a href="https://runware.ai" target="_blank" rel="noopener noreferrer" className="text-lime-600 dark:text-[#CCFF00] hover:underline">runware.ai</a>
                        {" "}注册账号并创建 API Key 后填入下方。
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Runware API Key</label>
                        <input
                          type="password"
                          value={runwareApiKey}
                          onChange={(e) => setRunwareApiKey(e.target.value)}
                          placeholder="填写 Runware API Key..."
                          className="w-full text-sm px-3.5 py-3 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                        />
                      </div>
                      <div className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                        配置后，画布中的「超分辨率」节点将自动通过此 Key 调用 Runware 进行图像增强，无需平台积分。
                      </div>
                    </>
                  ) : (
                    <>
                  <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                    <span className="text-sm font-bold text-lime-700 dark:text-[#CCFF00]">
                      {navItems.find(n => n.id === activeTab)?.label}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">接口与地址独立设置</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">API Base 地址 (Endpoint URL)</label>
                    <input
                      type="text"
                      value={currentConfig!.apiBase}
                      onChange={(e) => handleFieldChange("apiBase", e.target.value)}
                      placeholder="填写该模型的自定义 API Base 地址..."
                      className="w-full text-sm px-3.5 py-3 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">API Key 授权密钥 (Authorization Key)</label>
                    <input
                      type="password"
                      value={currentConfig!.apiKey}
                      onChange={(e) => handleFieldChange("apiKey", e.target.value)}
                      placeholder="填写该模型的专属 API 授权密钥..."
                      className="w-full text-sm px-3.5 py-3 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">调用模型名 (Model Name)</label>
                    <input
                      type="text"
                      value={currentConfig!.modelName}
                      onChange={(e) => handleFieldChange("modelName", e.target.value)}
                      placeholder="该接口调用的底层大模型标识名..."
                      className="w-full text-sm px-3.5 py-3 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                      required
                    />
                  </div>

                  {/* 全局高级设置：仅在画图模型页面展示 */}
                  {navItems.find(n => n.id === activeTab)?.type === "image" && (
                    <div className="flex flex-col gap-2.5 pt-4 border-t border-zinc-100 dark:border-white/[0.04] mt-5">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">全局高级设置 (Global Advanced Settings)</label>
                      <label className="flex items-start gap-3 cursor-pointer select-none py-1">
                        <input
                          type="checkbox"
                          checked={autoUploadUrls}
                          onChange={(e) => setAutoUploadUrls(e.target.checked)}
                          className="rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-lime-600 dark:text-[#CCFF00] focus:ring-lime-500 dark:focus:ring-[#CCFF00]/40 mt-1 size-4 cursor-pointer"
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-zinc-800 dark:text-white leading-relaxed">
                            本地参考图自动转为公网 URL 链接
                          </span>
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                            启用后，在执行「图生图」或参考图输入时，系统若检测到本地图片且未配置私有 S3 对象存储，将自动上传到免费匿名图床（Catbox/Telegraph）生成临时链接提供给多米等云端模型。如需极度隐私安全，可选择关闭。
                          </span>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* 即梦 CLI 登录卡片：仅在即梦（Seedance Video）模型页面展示 */}
                  {activeTab === "seedance_video" && (
                    <div className="flex flex-col gap-3 pt-4 border-t border-zinc-100 dark:border-white/[0.04] mt-5">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                          即梦 CLI 登录（画布设置）
                        </label>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          用于 `seedance-2-cli / seedance-2-fast-cli` 视频模式。支持登录、切换账号、校验与额度查询。
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void beginJimengLogin(false)}
                          disabled={jimengLoginLoading || jimengReloginLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {jimengLoginLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                          <span>{jimengLoginLoading ? "发起中..." : "🔐 登录"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void beginJimengLogin(true)}
                          disabled={jimengReloginLoading || jimengLoginLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {jimengReloginLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                          <span>{jimengReloginLoading ? "切换中..." : "🔄 切换账号"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleJimengCheck()}
                          disabled={jimengChecking}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {jimengChecking ? <Loader2 size={13} className="animate-spin" /> : null}
                          <span>{jimengChecking ? "校验中..." : "✅ 校验"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleJimengCredit()}
                          disabled={jimengCreditLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {jimengCreditLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                          <span>{jimengCreditLoading ? "查询中..." : "💳 额度"}</span>
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                          Device Code（登录后自动填充）
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={jimengDeviceCode}
                            onChange={(e) => setJimengDeviceCode(e.target.value)}
                            onBlur={() => {
                              const normalized = jimengDeviceCode.trim();
                              if (normalized !== jimengDeviceCode) {
                                setJimengDeviceCode(normalized);
                              }
                              void saveDesktopSettingsPatch({
                                jimengDefaultModel,
                                jimengDeviceCode: normalized,
                              }).catch((err) => {
                                console.warn("Failed to sync Jimeng device code:", err);
                              });
                            }}
                            placeholder="点击登录后自动填充"
                            className="w-full text-sm px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => void handleJimengCopyCode()}
                            className="px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                          >
                            📋 复制
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">默认模型</label>
                        <select
                          value={jimengDefaultModel}
                          onChange={(e) => {
                            const nextModel = e.target.value === "seedance-2-cli" ? "seedance-2-cli" : "seedance-2-fast-cli";
                            setJimengDefaultModel(nextModel);
                            void saveDesktopSettingsPatch({
                              jimengDefaultModel: nextModel,
                              jimengDeviceCode: jimengDeviceCode.trim(),
                            }).catch((err) => {
                              console.warn("Failed to sync Jimeng default model:", err);
                            });
                          }}
                          className="w-full text-sm px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white focus:outline-none focus:border-lime-500 dark:focus:border-[#CCFF00]/40 transition-colors"
                        >
                          <option value="seedance-2-fast-cli">即梦 CLI Fast（seedance-2-fast-cli）</option>
                          <option value="seedance-2-cli">即梦 CLI Pro（seedance-2-cli）</option>
                        </select>
                      </div>

                      <div className={`text-xs font-semibold ${jimengStatusClass}`}>{jimengStatus}</div>

                      {jimengAuthLink ? (
                        <div className="flex flex-wrap gap-3 items-start rounded-xl border border-zinc-200 dark:border-white/[0.12] bg-zinc-50 dark:bg-white/[0.03] p-3">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(jimengAuthLink)}`}
                            alt="Jimeng Login QR"
                            className="w-[132px] h-[132px] rounded-md border border-zinc-200 dark:border-white/[0.12] bg-white object-contain"
                          />
                          <div className="flex-1 min-w-[180px] flex flex-col gap-2">
                            <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                              User Code：{jimengUserCode || "-"}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                              请手机扫码或在浏览器完成授权，系统会自动轮询登录状态。
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={handleJimengOpenAuth}
                                className="px-3 py-2 rounded-lg text-xs font-semibold border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                              >
                                🌐 打开授权页
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                    </>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 dark:border-white/[0.08] pt-4.5 mt-8 flex-shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 text-sm rounded-lg font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-all cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 px-5.5 py-3 rounded-lg text-sm font-semibold shadow-md cursor-pointer transition-all hover:opacity-95 text-white bg-lime-600 hover:bg-lime-700 dark:bg-[#CCFF00] dark:text-black dark:hover:bg-[#CCFF00]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    <span>{saving ? "保存中..." : "保存配置"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
