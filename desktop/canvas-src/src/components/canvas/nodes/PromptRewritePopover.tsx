"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

interface PromptRewritePopoverProps {
  currentPrompt: string;
  onSuccess: (newPrompt: string) => void;
  onClose: () => void;
  flipUp?: boolean;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
}

const PRESET_INSTRUCTIONS = [
  { label: "🚀 润色提升", val: "帮我润色和润饰这段提示词，使其描述更加生动、细节更饱满，画面质感更好" },
  { label: "🇬🇧 译为英文", val: "将这段提示词翻译成高质量的英文 AI 绘图提示词，不要输出中文解释" },
  { label: "✨ 丰富细节", val: "扩写和丰富画面细节，加入光影、环境、摄影机视角和画质的高级修饰词" },
  { label: "🌆 赛博朋克", val: "将画面风格改为未来主义赛博朋克风，加入霓虹灯、雨夜街道、高科技元素" },
  { label: "🌸 二次元动漫", val: "将画面转换为精美的日系二次元动漫风格，具有丰富色彩和细腻线条" },
];

export function PromptRewritePopover({
  currentPrompt,
  onSuccess,
  onClose,
  flipUp = false,
  popoverRef,
}: PromptRewritePopoverProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRewrite = async (instText: string) => {
    const activeInst = instText || instruction;
    if (!activeInst.trim()) {
      setError("请输入或选择修改指令");
      return;
    }
    if (!currentPrompt.trim()) {
      setError("当前输入框内没有提示词可以改写");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/rewrite-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          instruction: activeInst,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.prompt) {
          onSuccess(data.prompt);
          onClose();
        } else {
          setError(data.error || "改写失败，请重试");
        }
      } else {
        const errText = await res.text();
        setError(errText || "服务器内部错误，可能未配置大模型 API Key");
      }
    } catch (err: any) {
      console.error("Failed to rewrite prompt:", err);
      setError("连接服务器失败，请检查服务状态");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={popoverRef}
      className={`absolute ${
        flipUp ? "bottom-full mb-2" : "top-full mt-2"
      } right-0 rounded-xl border border-zinc-200 dark:border-white/10 p-3.5 z-50 nodrag nowheel flex flex-col w-[320px] bg-white dark:bg-[#1a1a1a] text-zinc-800 dark:text-zinc-100 shadow-2xl`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-bold mb-2.5 flex items-center gap-1.5 flex-shrink-0">
        <Sparkles size={12} className="text-amber-500 animate-pulse" />
        AI 提示词智能改写
      </div>

      {/* Input Group */}
      <div className="relative mb-3 flex-shrink-0">
        <input
          type="text"
          placeholder="输入修改指令，如：变为3D渲染风格..."
          className="w-full pl-3 pr-10 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-transparent focus:border-zinc-300 dark:focus:border-zinc-700/50 focus:outline-none text-xs text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-colors"
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) {
              e.preventDefault();
              handleRewrite(instruction);
            }
          }}
          disabled={loading}
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 rounded-lg bg-lime-500 hover:bg-lime-400 dark:bg-[#CCFF00] dark:hover:bg-[#ddff22] text-black flex items-center justify-center transition-colors disabled:opacity-50 disabled:hover:bg-lime-500"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!loading) handleRewrite(instruction);
          }}
          disabled={loading}
        >
          {loading ? <Loader2 size={12} className="animate-spin text-black" /> : <ArrowRight size={12} />}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-[10px] text-red-500 dark:text-red-400 mb-2.5 leading-relaxed bg-red-50 dark:bg-red-500/10 p-2 rounded-lg border border-red-100 dark:border-transparent">
          {error}
        </div>
      )}

      {/* Presets */}
      <div className="flex-shrink-0">
        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2 block">快捷一键改写</span>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESET_INSTRUCTIONS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100/60 dark:bg-zinc-800/30 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 border border-zinc-200/20 dark:border-transparent hover:border-zinc-300/30 dark:hover:border-zinc-700/20 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-left transition-all truncate"
              onMouseDown={(e) => {
                e.preventDefault();
                if (!loading) handleRewrite(preset.val);
              }}
              disabled={loading}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
