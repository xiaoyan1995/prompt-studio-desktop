"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { useReactFlow } from "@xyflow/react";
import {
  X, Sparkles, Send, ChevronRight, ChevronLeft,
  Package, Zap, Film, Video, Loader2, Check,
  Laugh, Briefcase, Heart, FastForward, Gem,
  RefreshCw, Columns2, MessageSquareQuote, Target,
  Smartphone, Youtube, ShoppingCart,
  User, LayoutGrid, FolderOpen, Image as ImageIcon,
  PackageOpen, BookOpen, Star, Tv, Dices, Camera, Trash2,
  Paintbrush,
  type LucideIcon,
} from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import { MaterialPickerModal } from "./MaterialPickerModal";
import { HOOK_TEMPLATES, resolveHookPrompt, type HookTemplate } from "@/lib/marketing-hooks";
import { SETTING_TEMPLATES, resolveSettingPrompt, type SettingTemplate } from "@/lib/marketing-settings";
import { uploadFile } from "@/lib/upload-client";
import { showToast } from "@/components/ui/GlobalToast";
import type { MarketingVideoMode, MarketingScript } from "@/types/marketing-studio";
import type { NodeData, NodeType } from "@/types/canvas";

/* ─── Constants ─────────────────────────────────────────── */

const AD_MODES: { id: MarketingVideoMode; icon: LucideIcon; category: "ugc" | "commercial" }[] = [
  { id: "ugc", icon: Camera, category: "ugc" },
  { id: "unboxing", icon: PackageOpen, category: "ugc" },
  { id: "tutorial", icon: BookOpen, category: "ugc" },
  { id: "product_review", icon: Star, category: "ugc" },
  { id: "product_showcase", icon: Sparkles, category: "commercial" },
  { id: "tv_spot", icon: Tv, category: "commercial" },
  { id: "wild_card", icon: Dices, category: "commercial" },
];

type StepId = "product" | "hooks" | "settings" | "script" | "params";

const ALL_STEPS: { id: StepId; labelKey: string; icon: LucideIcon }[] = [
  { id: "product", labelKey: "myProducts", icon: Package },
  { id: "hooks", labelKey: "hooks", icon: Zap },
  { id: "settings", labelKey: "settings", icon: Film },
  { id: "script", labelKey: "adScript", icon: Sparkles },
  { id: "params", labelKey: "parameters", icon: Video },
];

const MODE_CATEGORY: Record<MarketingVideoMode, "ugc" | "commercial"> = {
  ugc: "ugc", unboxing: "ugc", tutorial: "ugc", product_review: "ugc",
  product_showcase: "commercial", tv_spot: "commercial", wild_card: "commercial",
};

/* ─── Instruction Presets ──────────────────────────────── */

interface InstructionPreset {
  id: string;
  icon: LucideIcon;
  labelZh: string;
  labelEn: string;
  instructionEn: string;
  instructionZh: string;
  category: "tone" | "structure" | "platform";
}

const INSTRUCTION_PRESETS: InstructionPreset[] = [
  // ── Tone / Style ──
  { id: "humorous", icon: Laugh, category: "tone", labelZh: "幽默搞笑", labelEn: "Humorous", instructionEn: "Use humorous, witty tone with comedic timing", instructionZh: "使用幽默诙谐的语气，注重喜剧节奏" },
  { id: "professional", icon: Briefcase, category: "tone", labelZh: "专业商务", labelEn: "Professional", instructionEn: "Professional, authoritative corporate tone", instructionZh: "专业权威的商务语气" },
  { id: "emotional", icon: Heart, category: "tone", labelZh: "情感故事", labelEn: "Emotional", instructionEn: "Emotional storytelling that connects with viewers", instructionZh: "用情感故事打动观众、引发共鸣" },
  { id: "fast-paced", icon: FastForward, category: "tone", labelZh: "快节奏", labelEn: "Fast-paced", instructionEn: "Fast-paced, high-energy editing style with quick cuts", instructionZh: "快节奏、高能量的剪辑风格，快速切换" },
  { id: "minimalist", icon: Gem, category: "tone", labelZh: "简约高级", labelEn: "Minimalist", instructionEn: "Minimalist, premium luxury aesthetic with elegant pacing", instructionZh: "极简高级感，优雅的节奏与留白" },
  // ── Narrative Structure ──
  { id: "problem-solution", icon: RefreshCw, category: "structure", labelZh: "问题→解决", labelEn: "Problem→Solution", instructionEn: "Problem-solution narrative arc: show the pain point, then reveal the product as the answer", instructionZh: "问题→解决叙事弧：先展示痛点，再揭示产品作为解决方案" },
  { id: "before-after", icon: Columns2, category: "structure", labelZh: "前后对比", labelEn: "Before/After", instructionEn: "Before/after transformation comparison showing dramatic improvement", instructionZh: "前后对比转变，展示显著改善效果" },
  { id: "testimonial", icon: MessageSquareQuote, category: "structure", labelZh: "用户证言", labelEn: "Testimonial", instructionEn: "Testimonial/review style narration from a real user perspective", instructionZh: "真实用户视角的证言/评测风格叙述" },
  { id: "aida", icon: Target, category: "structure", labelZh: "AIDA公式", labelEn: "AIDA", instructionEn: "Follow AIDA formula: Attention → Interest → Desire → Action", instructionZh: "遵循 AIDA 公式：注意力→兴趣→欲望→行动" },
  // ── Platform Optimization ──
  { id: "tiktok", icon: Smartphone, category: "platform", labelZh: "TikTok/抖音", labelEn: "TikTok", instructionEn: "Optimized for TikTok/Douyin: fast cuts, trending hooks, 3-second rule opening", instructionZh: "适配 TikTok/抖音：快剪辑、流行钩子、3秒法则开场" },
  { id: "youtube-shorts", icon: Youtube, category: "platform", labelZh: "YouTube Shorts", labelEn: "YT Shorts", instructionEn: "YouTube Shorts friendly: clear value proposition upfront, satisfying conclusion", instructionZh: "适配 YouTube Shorts：开头即明确价值主张，结尾令人满足" },
  { id: "ecommerce", icon: ShoppingCart, category: "platform", labelZh: "电商直播", labelEn: "E-commerce", instructionEn: "E-commerce livestream style: highlight deals, urgency, limited-time offers", instructionZh: "电商直播风格：突出优惠、紧迫感、限时活动" },
];

const PRESET_CATEGORIES = [
  { id: "tone" as const, labelZh: "风格语气", labelEn: "Tone & Style" },
  { id: "structure" as const, labelZh: "叙事结构", labelEn: "Structure" },
  { id: "platform" as const, labelZh: "平台优化", labelEn: "Platform" },
];

/* ─── Visual Style Presets (for style lock) ─────────────── */

interface VisualStylePreset {
  id: string;
  labelZh: string;
  labelEn: string;
  prefixEn: string;
  prefixZh: string;
  color: string;
}

const VISUAL_STYLE_PRESETS: VisualStylePreset[] = [
  { id: "cinematic-real", labelZh: "电影写实", labelEn: "Cinematic", color: "#4A7C59", prefixEn: "cinematic realism, photorealistic live-action footage, natural lighting, film grain, shallow depth of field, professional cinematography", prefixZh: "电影级写实画面，真实光影，浅景深，胶片质感，专业电影摄影" },
  { id: "hollywood", labelZh: "好莱坞大片", labelEn: "Hollywood", color: "#C4A000", prefixEn: "Hollywood blockbuster style, dramatic lighting, epic cinematic framing, high-contrast visuals, anamorphic lens flare, premium VFX quality", prefixZh: "好莱坞大片质感，戏剧化光影，史诗级电影构图，高对比画面，变形宽银幕镜头光晕" },
  { id: "minimal-luxury", labelZh: "极简高级", labelEn: "Minimal Luxury", color: "#9E9E9E", prefixEn: "minimalist luxury aesthetic, clean negative space, soft diffused studio lighting, elegant product staging, muted tones, Apple-style premium commercial", prefixZh: "极简奢华美学，大量留白，柔和漫射光，优雅产品陈列，低饱和色调，Apple式高端商业广告" },
  { id: "cyberpunk-tech", labelZh: "赛博科技", labelEn: "Cyberpunk", color: "#00E5FF", prefixEn: "futuristic cyberpunk aesthetics, neon lighting, holographic elements, dark sci-fi atmosphere, tech-forward visual language, glowing accents", prefixZh: "未来赛博朋克美学，霓虹光效，全息元素，暗色科幻氛围，前卫科技视觉语言" },
  { id: "retro-nostalgic", labelZh: "复古怀旧", labelEn: "Retro", color: "#C94C4C", prefixEn: "retro nostalgic film look, warm analog color grading, vintage grain texture, 70s-80s color palette, soft vignette, classic film stock aesthetic", prefixZh: "复古怀旧胶片风，暖色模拟调色，老式颗粒纹理，70-80年代色彩，柔和暗角，经典胶片美学" },
  { id: "stop-motion", labelZh: "定格创意", labelEn: "Stop Motion", color: "#A67C52", prefixEn: "stop-motion animation style, handcrafted tactile quality, miniature set design, frame-by-frame movement, playful creative aesthetic", prefixZh: "定格动画风格，手工制作质感，微缩场景设计，逐帧运动感，趣味创意美学" },
];

const ASPECT_RATIOS_LIST = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"];
const RESOLUTIONS = ["480p", "720p", "1080p"];
const SEEDANCE2_RES_MULT: Record<string, number> = { "480p": 0.46, "720p": 1, "1080p": 2.5 };

/* ─── Session Persistence ──────────────────────────────── */

interface MarketingStudioSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  currentStep: number;
  productName: string;
  productDescription: string;
  productImages: string[];
  avatarImages: string[];
  selectedMode: MarketingVideoMode;
  visualStyle: string | null;
  selectedHookId: string | null;
  selectedSettingId: string | null;
  selectedPresets: string[];
  customInstructions: string;
  script: MarketingScript | null;
  suggestedPrompt: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  generateAudio: boolean;
}

function createEmptySession(): MarketingStudioSession {
  return {
    id: crypto.randomUUID(),
    title: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: 0,
    productName: "",
    productDescription: "",
    productImages: [],
    avatarImages: [],
    selectedMode: "ugc",
    visualStyle: null,
    selectedHookId: null,
    selectedSettingId: null,
    selectedPresets: [],
    customInstructions: "",
    script: null,
    suggestedPrompt: "",
    duration: 10,
    aspectRatio: "9:16",
    resolution: "720p",
    generateAudio: true,
  };
}

function sessionTitle(s: MarketingStudioSession): string {
  return s.title || s.productName || "";
}

/* ─── Main Component ───────────────────────────────────── */

interface MarketingStudioPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function MarketingStudioPanel({ open, onClose, projectId }: MarketingStudioPanelProps) {
  const t = useTranslations("marketingStudio");
  const rawLocale = useLocale();
  const locale = rawLocale === "zh" ? "zh" : "en";

  // ─── Session management ───
  const [loaded, setLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<"list" | "editor">("list");
  const [sessions, setSessions] = useState<MarketingStudioSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // ─── Editor state ───
  const [stepIdx, setStepIdx] = useState(0);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productImages, setProductImages] = useState<string[]>([]);
  const [avatarImages, setAvatarImages] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<MarketingVideoMode>("ugc");
  const [visualStyle, setVisualStyle] = useState<string | null>(null);
  const [selectedHook, setSelectedHook] = useState<HookTemplate | null>(null);
  const [selectedSetting, setSelectedSetting] = useState<SettingTemplate | null>(null);
  const [script, setScript] = useState<MarketingScript | null>(null);
  const [suggestedPrompt, setSuggestedPrompt] = useState("");
  const [scriptLoading, setScriptLoading] = useState(false);
  const [composingPrompt, setComposingPrompt] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [duration, setDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [editingTitle, setEditingTitle] = useState("");

  // ─── Save infrastructure ───
  const versionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const dataLoadedRef = useRef(false);

  // ─── Load data on open ───
  useEffect(() => {
    if (!open) return;
    if (dataLoadedRef.current) return;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/marketing-studio`);
        if (!res.ok) { setLoaded(true); return; }
        const data = await res.json();
        const raw = data.marketing_studio_data ?? {};
        versionRef.current = data.version ?? 0;

        if (Array.isArray(raw.sessions) && raw.sessions.length > 0) {
          setSessions(raw.sessions as MarketingStudioSession[]);
          setCurrentView("list");
        } else {
          setCurrentView("list");
        }
        dataLoadedRef.current = true;
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
  }, [open, projectId]);

  // ─── Build save payload ───
  const buildPayload = useCallback(() => {
    let updatedSessions = sessions;
    if (activeSessionId) {
      updatedSessions = sessions.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              title: editingTitle,
              currentStep: stepIdx,
              productName,
              productDescription,
              productImages,
              avatarImages,
              selectedMode,
              visualStyle,
              selectedHookId: selectedHook?.id ?? null,
              selectedSettingId: selectedSetting?.id ?? null,
              selectedPresets,
              customInstructions,
              script,
              suggestedPrompt,
              duration,
              aspectRatio,
              resolution,
              generateAudio,
              updatedAt: new Date().toISOString(),
            }
          : s
      );
    }
    return { marketing_studio_data: { sessions: updatedSessions }, version: versionRef.current };
  }, [sessions, activeSessionId, editingTitle, stepIdx, productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, selectedHook, selectedSetting, selectedPresets, customInstructions, script, suggestedPrompt, duration, aspectRatio, resolution, generateAudio]);

  const doSave = useCallback(async (payload: ReturnType<typeof buildPayload>) => {
    setSaveStatus("saving");
    try {
      let res = await fetch(`/api/projects/${projectId}/marketing-studio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        res = await fetch(`/api/projects/${projectId}/marketing-studio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        const data = await res.json();
        versionRef.current = data.version;
        setSaveStatus("saved");
      } else {
        console.error("[marketing-studio] save failed:", res.status);
        setSaveStatus("unsaved");
      }
    } catch (err) { console.error("[marketing-studio] save error:", err); setSaveStatus("unsaved"); }
  }, [projectId]);

  const saveRef = useRef<() => Promise<void>>(undefined);
  saveRef.current = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    await doSave(buildPayload());
    savingRef.current = false;
  };

  const forceSave = useCallback(async (extraData?: Partial<MarketingStudioSession>) => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const now = new Date().toISOString();
    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: editingTitle, currentStep: stepIdx, productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, selectedHookId: selectedHook?.id ?? null, selectedSettingId: selectedSetting?.id ?? null, selectedPresets, customInstructions, script, suggestedPrompt, duration, aspectRatio, resolution, generateAudio, updatedAt: now, ...extraData }
        : s
    );
    const payload = { marketing_studio_data: { sessions: updatedSessions }, version: versionRef.current };
    savingRef.current = true;
    await doSave(payload);
    setSessions(updatedSessions);
    savingRef.current = false;
  }, [sessions, activeSessionId, editingTitle, stepIdx, productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, selectedHook, selectedSetting, selectedPresets, customInstructions, script, suggestedPrompt, duration, aspectRatio, resolution, generateAudio, doSave]);

  const scheduleSave = useCallback(() => {
    if (!loaded || !activeSessionId) return;
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveRef.current?.(), 1500);
  }, [loaded, activeSessionId]);

  useEffect(() => {
    if (!loaded || !dataLoadedRef.current || !activeSessionId) return;
    scheduleSave();
  }, [editingTitle, stepIdx, productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, selectedHook, selectedSetting, selectedPresets, customInstructions, script, suggestedPrompt, duration, aspectRatio, resolution, generateAudio, loaded, activeSessionId, scheduleSave]);

  // ─── Flush save on unload / close ───
  const flushSaveRef = useRef<() => void>(undefined);
  flushSaveRef.current = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!dataLoadedRef.current || !loaded || !activeSessionId) return;
    const now = new Date().toISOString();
    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: editingTitle, currentStep: stepIdx, productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, selectedHookId: selectedHook?.id ?? null, selectedSettingId: selectedSetting?.id ?? null, selectedPresets, customInstructions, script, suggestedPrompt, duration, aspectRatio, resolution, generateAudio, updatedAt: now }
        : s
    );
    const body = JSON.stringify({ marketing_studio_data: { sessions: updatedSessions }, version: versionRef.current });
    fetch(`/api/projects/${projectId}/marketing-studio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  };

  useEffect(() => {
    const handler = () => flushSaveRef.current?.();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ─── Session helpers ───
  const openSession = useCallback((session: MarketingStudioSession) => {
    setActiveSessionId(session.id);
    setEditingTitle(session.title ?? "");
    setStepIdx(session.currentStep || 0);
    setProductName(session.productName);
    setProductDescription(session.productDescription);
    setProductImages(session.productImages ?? []);
    setAvatarImages(session.avatarImages ?? []);
    setSelectedMode(session.selectedMode ?? "ugc");
    setVisualStyle(session.visualStyle ?? null);
    setSelectedHook(session.selectedHookId ? HOOK_TEMPLATES.find((h) => h.id === session.selectedHookId) ?? null : null);
    setSelectedSetting(session.selectedSettingId ? SETTING_TEMPLATES.find((s) => s.id === session.selectedSettingId) ?? null : null);
    setSelectedPresets(session.selectedPresets ?? []);
    setCustomInstructions(session.customInstructions ?? "");
    setScript(session.script ?? null);
    setSuggestedPrompt(session.suggestedPrompt ?? "");
    setDuration(session.duration ?? 10);
    setAspectRatio(session.aspectRatio ?? "9:16");
    setResolution(session.resolution ?? "720p");
    setGenerateAudio(session.generateAudio ?? true);
    setCurrentView("editor");
  }, []);

  const createNewSession = useCallback(async () => {
    const session = createEmptySession();
    const updatedSessions = [session, ...sessions];
    setSessions(updatedSessions);
    openSession(session);
    // Immediately save to database so the session persists on refresh
    const payload = { marketing_studio_data: { sessions: updatedSessions }, version: versionRef.current };
    await doSave(payload);
  }, [openSession, sessions, doSave]);

  const backToList = useCallback(() => {
    if (activeSessionId) {
      void forceSave();
    }
    setCurrentView("list");
  }, [activeSessionId, forceSave]);

  const deleteSession = useCallback((sessionId: string) => {
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setCurrentView("list");
    }
    const payload = { marketing_studio_data: { sessions: updated }, version: versionRef.current };
    void doSave(payload);
  }, [activeSessionId, sessions, doSave]);

  // ─── Dynamic steps based on mode category ───
  const isUgc = MODE_CATEGORY[selectedMode] === "ugc";
  const activeSteps = useMemo(() => {
    return isUgc ? ALL_STEPS : ALL_STEPS.filter(s => s.id !== "hooks" && s.id !== "settings");
  }, [isUgc]);
  const currentStepId = activeSteps[stepIdx]?.id ?? "product";
  const totalSteps = activeSteps.length;

  const handleModeChange = useCallback((mode: MarketingVideoMode) => {
    const willBeUgc = MODE_CATEGORY[mode] === "ugc";
    setSelectedMode(mode);
    if (!willBeUgc) {
      setSelectedHook(null);
      setSelectedSetting(null);
    }
  }, []);

  // ─── Canvas integration ───
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const addEdgeById = useCanvasStore((s) => s.addEdgeById);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // ─── Script Generation ───
  const handleGenerateScript = useCallback(async () => {
    if (!productName.trim()) return;
    setScriptLoading(true);

    // Compose instructions from presets + freeform text
    const isZh = locale === "zh";
    const presetTexts = selectedPresets
      .map((id) => INSTRUCTION_PRESETS.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => isZh ? p!.instructionZh : p!.instructionEn);
    const allInstructions = [...presetTexts, customInstructions].filter(Boolean).join("; ");

    try {
      const res = await fetch("/api/marketing-studio/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          productDescription,
          productImages: productImages.length > 0 ? productImages : undefined,
          mode: selectedMode,
          locale,
          customInstructions: allInstructions || undefined,
        }),
      });
      if (!res.ok) throw new Error("Script generation failed");
      const data = await res.json();
      setScript(data.script);
      setSuggestedPrompt("");  // Clear — will be set by compose-prompt LLM
      setScriptLoading(false);

      // Compose Seedance 2.0 structured prompt with all creative context
      const hookText = selectedHook
        ? resolveHookPrompt(selectedHook, productName, locale)
        : undefined;
      const settingText = selectedSetting
        ? resolveSettingPrompt(selectedSetting, locale)
        : undefined;

      setComposingPrompt(true);
      try {
        const composeRes = await fetch("/api/marketing-studio/compose-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: data.script,
            productName,
            productDescription: productDescription || undefined,
            productImages: productImages.length > 0 ? productImages : undefined,
            avatarImages: avatarImages.length > 0 ? avatarImages : undefined,
            mode: selectedMode,
            hookPrompt: hookText,
            settingPrompt: settingText,
            creativeDirections: presetTexts.length > 0 ? presetTexts : undefined,
            visualStylePrefix: visualStyle
              ? (locale === "zh"
                ? VISUAL_STYLE_PRESETS.find((s) => s.id === visualStyle)?.prefixZh
                : VISUAL_STYLE_PRESETS.find((s) => s.id === visualStyle)?.prefixEn)
              : undefined,
            duration,
            aspectRatio,
            locale,
          }),
        });
        if (composeRes.ok) {
          const composeData = await composeRes.json();
          if (composeData?.prompt) setSuggestedPrompt(composeData.prompt);
        } else {
          console.error("[marketing] compose-prompt failed:", composeRes.status);
        }
      } catch (composeErr) {
        console.error("[marketing] compose-prompt error:", composeErr);
      } finally {
        setComposingPrompt(false);
      }
    } catch (err) {
      console.error("[marketing] script gen error:", err);
      setScriptLoading(false);
    }
  }, [productName, productDescription, productImages, avatarImages, selectedMode, visualStyle, locale, customInstructions, selectedPresets, selectedHook, selectedSetting, duration, aspectRatio]);

  // ─── Send to Canvas ───
  const handleSendToCanvas = useCallback(async () => {
    // Use the LLM-composed Seedance prompt if available, else basic fallback
    const composedPrompt = suggestedPrompt
      || script?.fullText
      || `Product showcase video for ${productName}. ${productDescription || ""}`;

    const modeLabel = t(`mode${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}` as any) || selectedMode;

    // ─── Offset new nodes if same-mode nodes already exist on canvas ───
    const expectedLabel = `${productName} - ${modeLabel}`;
    const { nodes: existingNodes } = useCanvasStore.getState();
    const duplicateCount = existingNodes.filter(
      (n) => n.data?.nodeType === "video-gen" && n.data?.label === expectedLabel
    ).length;
    const DUPLICATE_OFFSET = 600;

    // Layout constants — video node size follows selected aspect ratio
    const rawCenter = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const center = { x: rawCenter.x + duplicateCount * DUPLICATE_OFFSET, y: rawCenter.y };
    const VIDEO_BASE = 280;
    const [arW, arH] = (aspectRatio || "9:16").split(":").map(Number);
    const arRatio = (arW || 9) / (arH || 16);
    const VIDEO_W = arRatio >= 1 ? Math.round(VIDEO_BASE * arRatio) : VIDEO_BASE;
    const VIDEO_H = arRatio >= 1 ? VIDEO_BASE : Math.round(VIDEO_BASE / arRatio);
    const SHORT_SIDE = 200;
    const GAP = 40;

    // Probe image dimensions
    const probeImageSize = (url: string): Promise<{ w: number; h: number }> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: SHORT_SIDE, h: SHORT_SIDE });
        img.src = url;
      });

    // Build ref image list with labels
    const allRefImages: { url: string; label: string; type: "product" | "avatar" }[] = [
      ...productImages.map((url, i) => ({
        url,
        label: productImages.length === 1 ? productName : `${productName} #${i + 1}`,
        type: "product" as const,
      })),
      ...avatarImages.map((url, i) => ({
        url,
        label: avatarImages.length === 1 ? `${productName} ${locale === "zh" ? "角色" : "Avatar"}` : `${productName} ${locale === "zh" ? "角色" : "Avatar"} #${i + 1}`,
        type: "avatar" as const,
      })),
    ];

    // Probe all image sizes in parallel
    const imgSizes = await Promise.all(allRefImages.map((img) => probeImageSize(img.url)));
    const nodeSizes = imgSizes.map(({ w, h }) => {
      const r = w / h;
      if (r >= 1) return { nw: Math.round(SHORT_SIDE * r), nh: SHORT_SIDE, ratio: `${w}:${h}` };
      return { nw: SHORT_SIDE, nh: Math.round(SHORT_SIDE / r), ratio: `${w}:${h}` };
    });

    // Calculate total height and starting position
    const totalRefH = nodeSizes.reduce((sum, s) => sum + s.nh, 0) + Math.max(0, allRefImages.length - 1) * GAP;
    const maxRefW = Math.max(SHORT_SIDE, ...nodeSizes.map((s) => s.nw));
    const refStartX = center.x - VIDEO_W / 2 - GAP - maxRefW;
    const refStartY = center.y - totalRefH / 2;

    const refNodes: { id: string; label: string; url: string }[] = [];
    let curY = refStartY;
    allRefImages.forEach((img, i) => {
      const { nw, nh, ratio } = nodeSizes[i];
      const imgId = addNodeWithData("image-gen" as NodeType, refStartX, curY, {
        label: img.label,
        imageUrl: img.url,
        originalUrl: img.url,
        thumbnailUrl: img.url,
        status: "succeeded",
        prompt: img.label,
        aspect_ratio: ratio,
      } as Partial<NodeData>, { w: nw, h: nh });
      refNodes.push({ id: imgId, label: img.label, url: img.url });
      curY += nh + GAP;
    });

    // Build TipTap prompt_json, replacing @image_N patterns with refMention nodes inline
    const mentionPattern = /@image[_\s]?(\d+)/gi;
    const parseLine = (line: string): any[] => {
      if (!line) return [];
      const nodes: any[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      mentionPattern.lastIndex = 0;
      while ((m = mentionPattern.exec(line)) !== null) {
        const idx = parseInt(m[1], 10) - 1;
        const ref = refNodes[idx];
        if (!ref) continue;
        if (m.index > lastIdx) nodes.push({ type: "text", text: line.slice(lastIdx, m.index) });
        nodes.push({ type: "refMention", attrs: { id: ref.id, label: ref.label, thumbnailUrl: ref.url, refType: "image" } });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < line.length) nodes.push({ type: "text", text: line.slice(lastIdx) });
      return nodes.length > 0 ? nodes : [{ type: "text", text: line }];
    };
    const promptLines = composedPrompt.split("\n");
    const promptJsonContent = promptLines.map((line) => ({
      type: "paragraph",
      content: parseLine(line),
    }));
    const promptJson = { type: "doc", content: promptJsonContent };

    // Create video-gen node
    const hasRefImages = refNodes.length > 0;
    const videoNodeId = addNodeWithData("video-gen" as NodeType, center.x - VIDEO_W / 2, center.y - VIDEO_H / 2, {
      label: `${productName} - ${modeLabel}`,
      prompt: composedPrompt,
      prompt_json: promptJson,
      promptNegative: "blur, distort, low quality, deformed, ugly, bad anatomy, watermark, text overlay",
      model_id: "seedance-2",
      aspect_ratio: aspectRatio,
      duration_s: duration,
      generate_audio: generateAudio,
      resolution: resolution,
      video_ref_mode: hasRefImages ? "imageRef" : undefined,
      fps: "25",
      status: "idle",
    } as Partial<NodeData>, { w: VIDEO_W, h: VIDEO_H });

    // Connect all reference images to video node
    refNodes.forEach((ref) => {
      addEdgeById(ref.id, videoNodeId);
    });

    // Close panel and fit view
    onClose();
    requestAnimationFrame(() => {
      const allIds = [...refNodes.map((r) => r.id), videoNodeId];
      fitView({ nodes: allIds.map((id) => ({ id })), padding: 0.15, duration: 400 });
    });
  }, [productName, productDescription, productImages, avatarImages, selectedMode, script, suggestedPrompt, aspectRatio, duration, generateAudio, resolution, locale, addNodeWithData, addEdgeById, screenToFlowPosition, fitView, onClose, t]);

  // ─── Step validation ───
  const canProceed = useMemo(() => {
    switch (currentStepId) {
      case "product": return productName.trim().length > 0;
      case "hooks": return true;
      case "settings": return true;
      case "script": return !scriptLoading && !composingPrompt;
      case "params": return true;
      default: return false;
    }
  }, [currentStepId, productName, scriptLoading, composingPrompt]);

  const estimatedCost = useMemo(() => {
    return Math.ceil(duration * 23.25 * (SEEDANCE2_RES_MULT[resolution] ?? 1));
  }, [duration, resolution]);

  // ─── Close handler: flush save ───
  const handleClose = useCallback(() => {
    flushSaveRef.current?.();
    onClose();
  }, [onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-[1200px] flex flex-col bg-white dark:bg-[#141414] rounded-2xl border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            {currentView === "editor" && (
              <button onClick={backToList} className="flex items-center justify-center size-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-white/40 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer mr-1">
                <ChevronLeft size={16} />
              </button>
            )}
            <Film size={16} className="text-lime-600 dark:text-[#CCFF00]/70" />
            {currentView === "editor" ? (
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder={t("untitledSession")}
                className="text-sm font-semibold text-zinc-800 dark:text-white/90 bg-transparent border-none outline-none placeholder:text-zinc-400 dark:placeholder:text-white/30 w-40 truncate"
              />
            ) : (
              <span className="text-sm font-semibold text-zinc-800 dark:text-white/90">{t("mySessions")}</span>
            )}
            {currentView === "editor" && (
              <>
                {saveStatus === "saving" && <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-white/30"><Loader2 size={10} className="animate-spin" /></span>}
                {saveStatus === "unsaved" && <span className="size-1.5 rounded-full bg-amber-400" />}
                {saveStatus === "saved" && <span className="size-1.5 rounded-full bg-emerald-400" />}
              </>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center size-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-white/40 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {!loaded ? (
            <div className="flex items-center justify-center w-full h-full">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400 dark:text-white/20" />
            </div>
          ) : currentView === "list" ? (
            /* ── Session list ── */
            <div className="flex-1 overflow-auto p-6 bg-zinc-50 dark:bg-transparent">
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {/* Create new — first card */}
                <button
                  onClick={createNewSession}
                  className="group flex flex-col items-center justify-center aspect-[9/16] rounded-xl border-2 border-dashed border-zinc-200 dark:border-white/[0.1] hover:border-lime-500 dark:hover:border-[#CCFF00]/40 bg-white dark:bg-white/[0.02] hover:bg-lime-50/20 dark:hover:bg-[#CCFF00]/[0.04] text-zinc-400 dark:text-white/30 hover:text-lime-600 dark:hover:text-[#CCFF00]/80 transition-all cursor-pointer shadow-sm"
                >
                  <Sparkles size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">{t("createNew")}</span>
                </button>

                {/* Session cards */}
                {sessions.map((session) => {
                  const title = sessionTitle(session) || t("untitledSession");
                  const stepNum = session.currentStep || 0;
                  const modeKey = `mode${session.selectedMode.charAt(0).toUpperCase() + session.selectedMode.slice(1).replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}` as any;
                  return (
                    <div
                      key={session.id}
                      onClick={() => openSession(session)}
                      className="group relative flex flex-col aspect-[9/16] rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] hover:border-zinc-300 dark:hover:border-white/[0.15] transition-all cursor-pointer overflow-hidden text-left shadow-sm"
                    >
                      {/* Card top — product thumbnail or icon */}
                      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-white/[0.03] dark:to-white/[0.01] relative overflow-hidden border-b border-zinc-100 dark:border-transparent">
                        {session.productImages?.[0] ? (
                          <img src={session.productImages[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Film size={28} className="text-zinc-300 dark:text-white/10" />
                        )}
                        {session.selectedMode && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-lime-100 dark:bg-[#CCFF00]/20 text-lime-700 dark:text-[#CCFF00]/80">
                            {t(modeKey)}
                          </span>
                        )}
                      </div>
                      {/* Card bottom — title + meta */}
                      <div className="p-2.5 border-t border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-transparent">
                        <p className="text-[11px] font-medium text-zinc-700 dark:text-white/80 truncate">{title}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-white/30 mt-0.5">
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5">
                          {ALL_STEPS.map((s, i) => (
                            <div key={s.id} className={`size-1.5 rounded-full ${i <= stepNum ? "bg-lime-600 dark:bg-[#CCFF00]/60" : "bg-zinc-200 dark:bg-white/[0.1]"}`} />
                          ))}
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="absolute top-2 left-2 size-6 flex items-center justify-center rounded bg-white/80 dark:bg-black/40 text-zinc-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 border border-zinc-200 dark:border-transparent shadow-sm opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Editor: left sidebar + content ── */
            <>
          {/* Left: Step nav */}
          <div className="w-48 flex-shrink-0 border-r border-white/[0.06] flex flex-col py-3 px-2 gap-0.5">
            {activeSteps.map((s, idx) => {
              const isActive = idx === stepIdx;
              const isCompleted = idx < stepIdx;
              const subtitle = s.id === "hooks" && selectedHook
                ? t(selectedHook.titleKey as any)
                : s.id === "settings" && selectedSetting
                ? t(selectedSetting.titleKey as any)
                : s.id === "product" && productName.trim()
                ? productName.trim()
                : null;
              return (
                <button
                  key={s.id}
                  onClick={() => setStepIdx(idx)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#CCFF00]/10 text-[#CCFF00]"
                      : "text-white/50 hover:text-white/70 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className={`size-6 flex items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 ${
                    isCompleted ? "bg-[#CCFF00]/20 text-[#CCFF00]" :
                    isActive ? "bg-[#CCFF00] text-black" :
                    "bg-white/[0.08] text-white/40"
                  }`}>
                    {isCompleted ? <Check size={12} /> : idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-medium truncate block">{t(s.labelKey as any)}</span>
                    {subtitle && <span className="text-[10px] text-white/30 truncate block">{subtitle}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Content */}
          <div className="flex-1 overflow-auto p-6 flex flex-col">
            {currentStepId === "product" && (
              <ProductStep
                productName={productName}
                setProductName={setProductName}
                productDescription={productDescription}
                setProductDescription={setProductDescription}
                productImages={productImages}
                setProductImages={setProductImages}
                avatarImages={avatarImages}
                setAvatarImages={setAvatarImages}
                selectedMode={selectedMode}
                setSelectedMode={handleModeChange}
                t={t}
              />
            )}
            {currentStepId === "hooks" && (
              <HookStep
                selectedHook={selectedHook}
                setSelectedHook={setSelectedHook}
                t={t}
              />
            )}
            {currentStepId === "settings" && (
              <SettingStep
                selectedSetting={selectedSetting}
                setSelectedSetting={setSelectedSetting}
                t={t}
              />
            )}
            {currentStepId === "script" && (
              <ScriptStep
                script={script}
                scriptLoading={scriptLoading}
                composingPrompt={composingPrompt}
                suggestedPrompt={suggestedPrompt}
                setSuggestedPrompt={setSuggestedPrompt}
                onGenerate={handleGenerateScript}
                customInstructions={customInstructions}
                setCustomInstructions={setCustomInstructions}
                selectedPresets={selectedPresets}
                setSelectedPresets={setSelectedPresets}
                visualStyle={visualStyle}
                setVisualStyle={setVisualStyle}
                productName={productName}
                locale={locale}
                t={t}
              />
            )}
            {currentStepId === "params" && (
              <ParamsStep
                duration={duration}
                setDuration={setDuration}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                resolution={resolution}
                setResolution={setResolution}
                generateAudio={generateAudio}
                setGenerateAudio={setGenerateAudio}
                estimatedCost={estimatedCost}
                t={t}
              />
            )}
          </div>
            </>
          )}
        </div>

        {/* Footer — only show in editor view */}
        {currentView === "editor" && (
        <div className="flex items-center justify-between w-full p-2 h-14 border-t border-white/[0.06] flex-shrink-0">
          {/* Left: back pill */}
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pr-2.5 border border-white/10 cursor-pointer"
                style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
              >
                <button
                  onClick={() => setStepIdx(stepIdx - 1)}
                  className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 transition-all"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-zinc-400">{t("navPrev")}</span>
              </div>
            )}
          </div>

          {/* Right: next / send-to-canvas pills */}
          <div className="flex items-center gap-2">
            {stepIdx < totalSteps - 1 ? (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
              >
                <span className="text-xs text-zinc-400">{t("navNext")}</span>
                <button
                  onClick={() => setStepIdx(stepIdx + 1)}
                  disabled={!canProceed}
                  className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
              >
                <span className="text-xs text-zinc-400">{t("sendToCanvas")}</span>
                <button
                  onClick={handleSendToCanvas}
                  disabled={!productName.trim()}
                  className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ─── Step 1: Product ──────────────────────────────────── */

function ProductStep({
  productName, setProductName,
  productDescription, setProductDescription,
  productImages, setProductImages,
  avatarImages, setAvatarImages,
  selectedMode, setSelectedMode,
  t,
}: {
  productName: string; setProductName: (v: string) => void;
  productDescription: string; setProductDescription: (v: string) => void;
  productImages: string[]; setProductImages: (v: string[]) => void;
  avatarImages: string[]; setAvatarImages: (v: string[]) => void;
  selectedMode: MarketingVideoMode; setSelectedMode: (v: MarketingVideoMode) => void;
  t: any;
}) {
  const productInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [canvasPickerTarget, setCanvasPickerTarget] = useState<"product" | "avatar" | null>(null);
  const [materialPickerTarget, setMaterialPickerTarget] = useState<"product" | "avatar" | null>(null);

  const handleMaterialPick = useCallback((url: string) => {
    if (materialPickerTarget === "product") {
      setProductImages([...productImages, url].slice(0, 5));
    } else if (materialPickerTarget === "avatar") {
      setAvatarImages([...avatarImages, url].slice(0, 3));
    }
    setMaterialPickerTarget(null);
  }, [materialPickerTarget, productImages, setProductImages, avatarImages, setAvatarImages]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, target: "product" | "avatar") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const setLoading = target === "product" ? setUploading : setUploadingAvatar;
    setLoading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        if ("url" in result && result.url) uploaded.push(result.url);
      }
      if (target === "product") {
        setProductImages([...productImages, ...uploaded].slice(0, 5));
      } else {
        setAvatarImages([...avatarImages, ...uploaded].slice(0, 3));
      }
    } catch (err) {
      console.error("[marketing] upload error:", err);
      showToast("Upload failed", "warning");
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  }, [productImages, setProductImages, avatarImages, setAvatarImages]);

  // Canvas media nodes for picker
  const canvasMediaNodes = useMemo(() => {
    const nodes = useCanvasStore.getState().nodes;
    return nodes.filter((n) => n.data?.imageUrl || n.data?.originalUrl);
  }, [canvasPickerTarget]);

  const handleCanvasPick = useCallback((nodeData: NodeData) => {
    const url = String(nodeData.imageUrl ?? nodeData.originalUrl ?? "");
    if (!url) return;
    if (canvasPickerTarget === "product") {
      setProductImages([...productImages, url].slice(0, 5));
    } else if (canvasPickerTarget === "avatar") {
      setAvatarImages([...avatarImages, url].slice(0, 3));
    }
    setCanvasPickerTarget(null);
  }, [canvasPickerTarget, productImages, setProductImages, avatarImages, setAvatarImages]);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white/90 mb-1">{t("myProducts")}</h2>
        <p className="text-sm text-white/40">{t("subtitle")}</p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left column: name + description + ad mode */}
        <div className="flex flex-col gap-4">
          {/* Product name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">{t("productName")}</label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={t("productNamePlaceholder")}
              className="w-full h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#CCFF00]/40 transition-colors"
            />
          </div>

          {/* Product description */}
          <div className="space-y-1.5 flex-1 flex flex-col">
            <label className="text-xs font-medium text-white/60">{t("productDescription")}</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder={t("productDescriptionPlaceholder")}
              className="w-full flex-1 min-h-[80px] rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#CCFF00]/40 transition-colors resize-none"
            />
          </div>

          {/* Ad mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">{t("adMode")}</label>
            {(["ugc", "commercial"] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">{cat === "ugc" ? "UGC" : "Commercial"}</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {AD_MODES.filter((m) => m.category === cat).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setSelectedMode(mode.id)}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all cursor-pointer ${
                        selectedMode === mode.id
                          ? "border-[#CCFF00]/40 bg-[#CCFF00]/[0.06]"
                          : "border-white/[0.06] hover:border-white/[0.12] bg-white/[0.02]"
                      }`}
                    >
                      <mode.icon size={18} className="text-white/50" />
                      <span className="text-[10px] text-white/60 leading-tight">{t(`mode${mode.id.charAt(0).toUpperCase() + mode.id.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as any)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Right column: Product images + Avatar images */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Product images section */}
          <div className="flex-1 flex flex-col gap-1.5 min-h-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                <Package size={12} />
                {t("productImages")}
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMaterialPickerTarget("product")}
                  disabled={productImages.length >= 5}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <FolderOpen size={10} />
                  <span>{t("fromLibrary" as any) || "Library"}</span>
                </button>
                <button
                  onClick={() => setCanvasPickerTarget("product")}
                  disabled={productImages.length >= 5}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <LayoutGrid size={10} />
                  <span>{t("fromCanvas" as any) || "Canvas"}</span>
                </button>
              </div>
            </div>
            <div className="flex-1 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] p-2 flex flex-col min-h-[100px]">
              {productImages.length === 0 ? (
                <button
                  onClick={() => !uploading && productInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors"
                >
                  {uploading ? (
                    <Loader2 size={20} className="animate-spin text-white/30" />
                  ) : (
                    <>
                      <Package size={18} className="text-white/20" />
                      <span className="text-[11px] text-white/25">{t("dropImages")}</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex-1 grid grid-cols-3 gap-1.5 auto-rows-fr overflow-auto">
                  {productImages.map((url, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-black/20 aspect-square">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setProductImages(productImages.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {productImages.length < 5 && (
                    <button
                      onClick={() => !uploading && productInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-lg border-2 border-dashed border-white/[0.06] hover:border-[#CCFF00]/30 flex items-center justify-center text-white/15 hover:text-[#CCFF00]/50 transition-colors cursor-pointer disabled:opacity-40 aspect-square"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <span className="text-xl">+</span>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Avatar images section */}
          <div className="flex-1 flex flex-col gap-1.5 min-h-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                <User size={12} />
                {t("avatar" as any) || "Avatar"}
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMaterialPickerTarget("avatar")}
                  disabled={avatarImages.length >= 3}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <FolderOpen size={10} />
                  <span>{t("fromLibrary" as any) || "Library"}</span>
                </button>
                <button
                  onClick={() => setCanvasPickerTarget("avatar")}
                  disabled={avatarImages.length >= 3}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <LayoutGrid size={10} />
                  <span>{t("fromCanvas" as any) || "Canvas"}</span>
                </button>
              </div>
            </div>
            <div className="flex-1 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] p-2 flex flex-col min-h-[100px]">
              {avatarImages.length === 0 ? (
                <button
                  onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white/[0.02] rounded-lg transition-colors"
                >
                  {uploadingAvatar ? (
                    <Loader2 size={20} className="animate-spin text-white/30" />
                  ) : (
                    <>
                      <User size={18} className="text-white/20" />
                      <span className="text-[11px] text-white/25">{t("avatarHint" as any) || "Character / spokesperson reference"}</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex-1 grid grid-cols-3 gap-1.5 auto-rows-fr overflow-auto">
                  {avatarImages.map((url, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-black/20 aspect-square">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setAvatarImages(avatarImages.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/60 hover:text-white cursor-pointer"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {avatarImages.length < 3 && (
                    <button
                      onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="rounded-lg border-2 border-dashed border-white/[0.06] hover:border-[#CCFF00]/30 flex items-center justify-center text-white/15 hover:text-[#CCFF00]/50 transition-colors cursor-pointer disabled:opacity-40 aspect-square"
                    >
                      {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <span className="text-xl">+</span>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <input ref={productInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, "product")} />
          <input ref={avatarInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, "avatar")} />
        </div>
      </div>

      {/* Canvas image picker modal */}
      {canvasPickerTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCanvasPickerTarget(null)}>
          <div
            className="border border-white/[0.08] rounded-2xl p-4 w-[480px] max-h-[60vh] flex flex-col backdrop-blur-xl"
            style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white/80 font-medium flex items-center gap-2">
                <LayoutGrid size={14} />
                {canvasPickerTarget === "product" ? (t("productImages")) : (t("avatar" as any) || "Avatar")} — {t("fromCanvas" as any) || "From Canvas"}
              </span>
              <button onClick={() => setCanvasPickerTarget(null)} className="text-white/30 hover:text-white/60 cursor-pointer"><X size={16} /></button>
            </div>
            {canvasMediaNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-white/20 text-[12px]">
                <ImageIcon size={24} className="mb-2 opacity-40" />
                <span>{t("noCanvasImages" as any) || "No images on canvas"}</span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 overflow-y-auto" style={{ maxHeight: "calc(60vh - 80px)" }}>
                {[...canvasMediaNodes].reverse().map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleCanvasPick(node.data as NodeData)}
                    className="group relative aspect-square rounded-lg border border-white/[0.06] overflow-hidden hover:border-[#CCFF00]/40 transition-colors cursor-pointer bg-white/[0.02]"
                  >
                    <img
                      src={String((node.data as NodeData)?.thumbnailUrl ?? (node.data as NodeData)?.imageUrl ?? "")}
                      alt={String((node.data as NodeData)?.label ?? "")}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Material library picker modal (shared component — same as StoryboardPanel) */}
      <MaterialPickerModal
        open={!!materialPickerTarget}
        onClose={() => setMaterialPickerTarget(null)}
        title={`${materialPickerTarget === "product" ? t("productImages") : (t("avatar" as any) || "Avatar")} — ${t("fromLibrary" as any) || "Library"}`}
        emptyText={t("noLibraryImages" as any) || "No images in library"}
        filterType="IMAGE"
        onSelect={handleMaterialPick}
      />
    </div>
  );
}

/* ─── Step 2: Creative Hooks ───────────────────────────── */

function HookStep({
  selectedHook, setSelectedHook, t,
}: {
  selectedHook: HookTemplate | null; setSelectedHook: (v: HookTemplate | null) => void;
  t: any;
}) {
  const [hookCategory, setHookCategory] = useState<string>("all");

  const filteredHooks = useMemo(() => {
    if (hookCategory === "all") return HOOK_TEMPLATES;
    return HOOK_TEMPLATES.filter((h) => h.category === hookCategory);
  }, [hookCategory]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80 mb-1">{t("hooks")}</h3>
      <p className="text-xs text-white/30 mb-3">{t("hooksSubtitle")}</p>
      <div className="flex gap-1 mb-3">
        {["all", "stunt", "subtle", "cinematic"].map((cat) => (
          <button
            key={cat}
            onClick={() => setHookCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors cursor-pointer ${
              hookCategory === cat ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {t(`category${cat.charAt(0).toUpperCase() + cat.slice(1)}` as any)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
        {filteredHooks.map((hook) => (
          <button
            key={hook.id}
            onClick={() => setSelectedHook(selectedHook?.id === hook.id ? null : hook)}
            className={`relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer ${
              selectedHook?.id === hook.id
                ? "border-[#CCFF00]/50 ring-1 ring-[#CCFF00]/20"
                : "border-white/[0.06] hover:border-white/[0.15]"
            }`}
          >
            {hook.previewUrl && (
              <div className="aspect-[9/16] w-full bg-black/40 overflow-hidden">
                <video src={hook.previewUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-2">
              <p className="text-[11px] font-medium text-white/70 truncate">{t(hook.titleKey as any)}</p>
            </div>
            {selectedHook?.id === hook.id && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#CCFF00] flex items-center justify-center">
                <Check size={10} className="text-black" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 3: Scene Setting ────────────────────────────── */

function SettingStep({
  selectedSetting, setSelectedSetting, t,
}: {
  selectedSetting: SettingTemplate | null; setSelectedSetting: (v: SettingTemplate | null) => void;
  t: any;
}) {
  const [settingCategory, setSettingCategory] = useState<string>("all");

  const filteredSettings = useMemo(() => {
    if (settingCategory === "all") return SETTING_TEMPLATES;
    return SETTING_TEMPLATES.filter((s) => s.category === settingCategory);
  }, [settingCategory]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80 mb-1">{t("settings")}</h3>
      <p className="text-xs text-white/30 mb-3">{t("settingsSubtitle")}</p>
      <div className="flex gap-1 mb-3">
        {["all", "realistic", "unrealistic"].map((cat) => (
          <button
            key={cat}
            onClick={() => setSettingCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors cursor-pointer ${
              settingCategory === cat ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {t(`category${cat.charAt(0).toUpperCase() + cat.slice(1)}` as any)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
        {filteredSettings.map((setting) => (
          <button
            key={setting.id}
            onClick={() => setSelectedSetting(selectedSetting?.id === setting.id ? null : setting)}
            className={`relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer ${
              selectedSetting?.id === setting.id
                ? "border-[#CCFF00]/50 ring-1 ring-[#CCFF00]/20"
                : "border-white/[0.06] hover:border-white/[0.15]"
            }`}
          >
            {setting.previewUrl && (
              <div className="aspect-[9/16] w-full bg-black/40 overflow-hidden">
                <video src={setting.previewUrl} muted loop playsInline autoPlay className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-2">
              <p className="text-[11px] font-medium text-white/70 truncate">{t(setting.titleKey as any)}</p>
            </div>
            {selectedSetting?.id === setting.id && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#CCFF00] flex items-center justify-center">
                <Check size={10} className="text-black" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Script ───────────────────────────────────── */

function ScriptStep({
  script, scriptLoading, composingPrompt, suggestedPrompt, setSuggestedPrompt,
  onGenerate, customInstructions, setCustomInstructions,
  selectedPresets, setSelectedPresets, visualStyle, setVisualStyle, productName, locale, t,
}: {
  script: MarketingScript | null;
  scriptLoading: boolean;
  composingPrompt: boolean;
  suggestedPrompt: string;
  setSuggestedPrompt: (v: string) => void;
  onGenerate: () => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  selectedPresets: string[];
  setSelectedPresets: (v: string[]) => void;
  visualStyle: string | null;
  setVisualStyle: (v: string | null) => void;
  productName: string;
  locale: string;
  t: any;
}) {
  const isZh = locale === "zh";

  const togglePreset = (id: string) => {
    setSelectedPresets(
      selectedPresets.includes(id)
        ? selectedPresets.filter((p) => p !== id)
        : [...selectedPresets, id]
    );
  };

  return (
    <div className="h-full flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">{t("adScript")}</h3>
        <p className="text-xs text-white/30">{t("subtitle")}</p>
      </div>

      {/* Visual Style Lock */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
          <Paintbrush size={12} />
          {isZh ? "视觉风格" : "Visual Style"}
        </label>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {VISUAL_STYLE_PRESETS.map((style) => (
            <button
              key={style.id}
              onClick={() => setVisualStyle(visualStyle === style.id ? null : style.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                visualStyle === style.id
                  ? "bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/30 shadow-[0_0_8px_rgba(204,255,0,0.1)]"
                  : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.06]"
              }`}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: style.color }} />
              <span className="text-xs font-medium leading-tight truncate">{isZh ? style.labelZh : style.labelEn}</span>
            </button>
          ))}
        </div>
        {visualStyle && (
          <p className="text-xs text-white/40 px-1 leading-relaxed">
            {isZh
              ? VISUAL_STYLE_PRESETS.find((s) => s.id === visualStyle)?.prefixZh
              : VISUAL_STYLE_PRESETS.find((s) => s.id === visualStyle)?.prefixEn}
          </p>
        )}
      </div>

      {/* Instruction Presets */}
      <div className="space-y-4">
        <label className="text-xs font-medium text-white/60">{isZh ? "创意方向（可多选）" : "Creative Direction (multi-select)"}</label>
        {PRESET_CATEGORIES.map((cat) => (
          <div key={cat.id} className="space-y-2">
            <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
              {isZh ? cat.labelZh : cat.labelEn}
            </span>
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
              {INSTRUCTION_PRESETS.filter((p) => p.category === cat.id).map((preset) => {
                const active = selectedPresets.includes(preset.id);
                return (
                  <button
                    key={preset.id}
                    onClick={() => togglePreset(preset.id)}
                    className={`relative flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-xs transition-all cursor-pointer ${
                      active
                        ? "bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30 shadow-[0_0_8px_rgba(204,255,0,0.1)]"
                        : "bg-white/[0.03] border border-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    <preset.icon size={18} strokeWidth={1.5} />
                    <span className="font-medium text-center leading-tight">{isZh ? preset.labelZh : preset.labelEn}</span>
                    {active && (
                      <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-[#CCFF00] flex items-center justify-center">
                        <Check size={8} className="text-black" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Freeform additional instructions */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/40">{isZh ? "自定义补充" : "Custom notes"}</label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder={t("customInstructionsPlaceholder")}
          rows={2}
          className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#CCFF00]/40 transition-colors resize-none"
        />
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={scriptLoading || composingPrompt || !productName.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] disabled:opacity-30 text-sm text-white/70 transition-colors cursor-pointer w-fit"
      >
        {scriptLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        <span>{script ? t("regenerateScript") : t("generateScript")}</span>
      </button>

      {/* Script display — with skeleton loading */}
      {scriptLoading ? (
        <div className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse">
          {[t("scriptHook"), t("scriptBody"), t("scriptCta")].map((label, i) => (
            <div key={i}>
              <span className="text-[10px] uppercase tracking-wider text-[#CCFF00]/30 font-semibold">{label}</span>
              <div className="mt-2 space-y-1.5">
                <div className="h-3.5 bg-white/[0.06] rounded-md w-full" />
                {i === 1 && <>
                  <div className="h-3.5 bg-white/[0.06] rounded-md w-[95%]" />
                  <div className="h-3.5 bg-white/[0.06] rounded-md w-[80%]" />
                </>}
                <div className="h-3.5 bg-white/[0.06] rounded-md w-[60%]" />
              </div>
            </div>
          ))}
        </div>
      ) : script ? (
        <div className="space-y-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#CCFF00]/60 font-semibold">{t("scriptHook")}</span>
            <p className="text-sm text-white/80 mt-1">{script.hook}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#CCFF00]/60 font-semibold">{t("scriptBody")}</span>
            <p className="text-sm text-white/80 mt-1">{script.body}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#CCFF00]/60 font-semibold">{t("scriptCta")}</span>
            <p className="text-sm text-white/80 mt-1">{script.cta}</p>
          </div>
        </div>
      ) : null}

      {/* Seedance prompt — skeleton loading during composition */}
      {(composingPrompt || scriptLoading) ? (
        <div className="flex-1 flex flex-col gap-1.5 min-h-0">
          <label className="text-xs font-medium text-[#CCFF00]/30 flex items-center gap-1.5 flex-shrink-0">
            <Loader2 size={12} className="animate-spin" />
            Seedance 2.0 Prompt
            <span className="text-[10px] text-white/30 ml-1">
              {isZh ? (scriptLoading ? "等待脚本生成…" : "正在生成提示词…") : (scriptLoading ? "Waiting for script…" : "Composing prompt…")}
            </span>
          </label>
          <div className="flex-1 w-full rounded-xl bg-white/[0.04] border border-[#CCFF00]/10 px-4 py-3 animate-pulse">
            <div className="space-y-2">
              <div className="h-3.5 bg-white/[0.05] rounded-md w-full" />
              <div className="h-3.5 bg-white/[0.05] rounded-md w-[97%]" />
              <div className="h-3.5 bg-white/[0.05] rounded-md w-[92%]" />
              <div className="h-3.5 bg-white/[0.05] rounded-md w-[85%]" />
              <div className="h-3.5 bg-white/[0.05] rounded-md w-[70%]" />
            </div>
          </div>
        </div>
      ) : suggestedPrompt ? (
        <div className="flex-1 flex flex-col gap-1.5 min-h-0">
          <label className="text-xs font-medium text-[#CCFF00]/60 flex items-center gap-1.5 flex-shrink-0">
            <Film size={12} />
            Seedance 2.0 Prompt
          </label>
          <textarea
            value={suggestedPrompt}
            onChange={(e) => setSuggestedPrompt(e.target.value)}
            className="flex-1 w-full rounded-xl bg-white/[0.04] border border-[#CCFF00]/10 px-4 py-3 text-sm text-white/80 leading-relaxed outline-none focus:border-[#CCFF00]/30 transition-colors resize-none"
          />
        </div>
      ) : null}
    </div>
  );
}

/* ─── Step 5: Parameters ───────────────────────────────── */

function ParamsStep({
  duration, setDuration,
  aspectRatio, setAspectRatio,
  resolution, setResolution,
  generateAudio, setGenerateAudio,
  estimatedCost, t,
}: {
  duration: number; setDuration: (v: number) => void;
  aspectRatio: string; setAspectRatio: (v: string) => void;
  resolution: string; setResolution: (v: string) => void;
  generateAudio: boolean; setGenerateAudio: (v: boolean) => void;
  estimatedCost: number; t: any;
}) {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">{t("parameters")}</h3>
        <p className="text-xs text-white/30">Seedance 2.0</p>
      </div>

      {/* Duration slider */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60">{t("duration")}</label>
        <div className="relative flex h-10 w-full items-center overflow-hidden rounded-lg">
          <div className="absolute inset-0 bg-white/[0.05] rounded-lg" />
          <div
            className="absolute inset-y-0 left-0 bg-white/[0.10] rounded-lg transition-all"
            style={{ width: `${((duration - 4) / 11) * 100}%` }}
          />
          <input
            type="range"
            min={4}
            max={15}
            step={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="pointer-events-none absolute inset-x-2.5 inset-y-0 flex items-center justify-between">
            <div className="flex items-center gap-1 text-white/40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 7.75V12L14.75 14.75M21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12Z"/></svg>
              <span className="text-xs font-medium">{t("duration")}</span>
            </div>
            <span className="text-sm font-medium text-white">{duration}s</span>
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-white/20 px-1">
          <span>4s</span>
          <span>15s</span>
        </div>
      </div>

      {/* Aspect ratio with visual icons */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60">{t("aspectRatio")}</label>
        <div className="flex gap-1.5 flex-wrap">
          {ASPECT_RATIOS_LIST.map((r) => {
            const [w, h] = r.split(":").map(Number);
            const iconW = Math.round(16 * (w / Math.max(w, h)));
            const iconH = Math.round(16 * (h / Math.max(w, h)));
            return (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  aspectRatio === r ? "bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/30" : "bg-white/[0.04] border border-white/[0.06] text-white/50 hover:text-white/70"
                }`}
              >
                <div
                  className={`border rounded-[2px] flex-shrink-0 ${
                    aspectRatio === r ? "border-[#CCFF00]/60" : "border-white/30"
                  }`}
                  style={{ width: iconW, height: iconH }}
                />
                <span>{r}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/60">{t("resolution")}</label>
        <div className="flex gap-1.5">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              className={`px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                resolution === r ? "bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/30" : "bg-white/[0.04] border border-white/[0.06] text-white/50 hover:text-white/70"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Generate audio toggle */}
      <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
        <span className="text-xs text-white/60">{t("generateAudio")}</span>
        <button
          onClick={() => setGenerateAudio(!generateAudio)}
          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
            generateAudio ? "bg-[#CCFF00]" : "bg-white/[0.1]"
          }`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            generateAudio ? "left-[18px]" : "left-0.5"
          }`} />
        </button>
      </div>

      {/* Cost estimate */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 flex items-center justify-between">
        <span className="text-xs text-white/40">Seedance 2.0 · {duration}s · {resolution} · {aspectRatio}</span>
        <span className="text-sm font-semibold text-[#CCFF00]">~{estimatedCost} Xins</span>
      </div>
    </div>
  );
}
