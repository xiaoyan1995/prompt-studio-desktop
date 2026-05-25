type PromptEnhancerLocale = "zh" | "en";
export type PromptEnhancerRuleLevel = "lite" | "full";

interface BuildCompactEnhancedPromptInput {
  locale: PromptEnhancerLocale;
  ruleLevel?: PromptEnhancerRuleLevel;
  modeLabel: string;
  modeGuide: string;
  modeRecipe: string;
  inputSummary: string;
  materialUsages: string;
  requiredMentions?: string[];
  instruction: string;
  negative: string;
}

const PROMPT_ENHANCER_SKILL: Record<PromptEnhancerLocale, string> = {
  zh: "你是提示词增强器。将用户输入整理为可直接用于图像/视频模型的高质量提示词，保持原意，不输出解释；若输入含 @引用，输出必须保留相同 @引用。",
  en: "You are a prompt enhancer. Convert user input into a production-ready prompt for image/video models while preserving intent and avoiding explanations; if input contains @mentions, the output must keep the same @mentions.",
};

const FULL_RULES_BLOCK: Record<PromptEnhancerLocale, string[]> = {
  zh: [
    "[Seedance 完整规则]",
    "1) 你是 Seedance 提示词工程师，输出必须是可直接投喂图生/视频模型的成片级提示词。",
    "2) 严格遵守 @引用语法：只允许使用输入中已有引用，不得凭空新增；图片@图片1-9，视频@视频1-3，音频@音频1-3。",
    "3) 优先采用电影化结构：主体 + 动作/叙事推进 + 场景 + 镜头语言 + 光线/风格 + 节奏。",
    "4) 如用户意图明显是视频脚本，优先给出 15 秒时间轴写法（如 0-3秒、4-8秒…）。",
    "5) 如内容明显超过 15 秒，改用“分段方案 + 衔接点”表达，确保镜头连续。",
    "6) 若给了负向约束，必须在最终提示词中体现，且不改变用户核心创意。",
  ],
  en: [
    "[Seedance Full Rules]",
    "1) You are a Seedance prompt engineer; output must be directly usable by image/video generation models.",
    "2) Enforce @mention syntax strictly: use only mentions present in input, never invent new ones; images @Image1-9, videos @Video1-3, audios @Audio1-3.",
    "3) Prefer cinematic structure: subject + action/story beat + scene + camera language + lighting/style + rhythm.",
    "4) If intent is a video script, prefer a 15-second timeline format (e.g. 0-3s, 4-8s...).",
    "5) If content is clearly longer than 15s, output a segmented plan with continuity handoff points.",
    "6) If negative constraints are provided, reflect them in final prompt without changing core user intent.",
  ],
};

function pushCommonPromptBlocks(
  lines: string[],
  input: Omit<BuildCompactEnhancedPromptInput, "ruleLevel"> & { locale: PromptEnhancerLocale },
) {
  const {
    locale,
    modeLabel,
    modeGuide,
    modeRecipe,
    inputSummary,
    materialUsages,
    requiredMentions = [],
    instruction,
    negative,
  } = input;
  const isZh = locale === "zh";

  lines.push(isZh ? `[模式] ${modeLabel}` : `[Mode] ${modeLabel}`);
  if (modeGuide.trim()) lines.push(isZh ? `[模式说明] ${modeGuide}` : `[Mode Guide] ${modeGuide}`);
  if (inputSummary.trim()) lines.push(isZh ? `[入口预设] ${inputSummary}` : `[Input Preset] ${inputSummary}`);
  if (modeRecipe.trim()) lines.push(isZh ? `[素材组合] ${modeRecipe}` : `[Reference Recipe] ${modeRecipe}`);
  if (materialUsages.trim()) {
    lines.push(isZh ? `[素材用途说明]\n${materialUsages}` : `[Reference Usage]\n${materialUsages}`);
  }
  if (requiredMentions.length > 0) {
    lines.push(
      isZh
        ? `[引用保留] 输出中必须原样保留这些引用：${requiredMentions.join(" ")}`
        : `[Mention Preservation] Keep these mentions exactly in output: ${requiredMentions.join(" ")}`,
    );
  }

  lines.push("");
  lines.push(isZh ? "[用户指令]" : "[Instruction]");
  lines.push(instruction || (isZh ? "（空）" : "(empty)"));

  if (negative.trim()) {
    lines.push(isZh ? "\n[负向约束]" : "\n[Negative Constraints]");
    lines.push(negative.trim());
  }
}

function buildLitePrompt(input: BuildCompactEnhancedPromptInput): string {
  const {
    locale,
  } = input;
  const isZh = locale === "zh";
  const lines: string[] = [PROMPT_ENHANCER_SKILL[locale], ""];
  pushCommonPromptBlocks(lines, {
    ...input,
    locale,
  });

  lines.push("");
  lines.push(isZh ? "[规则强度] 轻量版" : "[Rule Level] Lite");

  lines.push("");
  lines.push(
    isZh
      ? "[输出要求] 只输出最终提示词正文，不要解释、不要标题、不要代码块；若输入含@引用，输出必须保留@引用。"
      : "[Output] Return only the final prompt body. No explanation, no headings, no code blocks; preserve @mentions when provided.",
  );

  return lines.join("\n");
}

function buildFullPrompt(input: BuildCompactEnhancedPromptInput): string {
  const { locale } = input;
  const isZh = locale === "zh";
  const lines: string[] = [PROMPT_ENHANCER_SKILL[locale], ""];

  lines.push(...FULL_RULES_BLOCK[locale]);
  lines.push("");
  lines.push(isZh ? "[规则强度] 完整版" : "[Rule Level] Full");
  lines.push("");

  pushCommonPromptBlocks(lines, {
    ...input,
    locale,
  });

  lines.push("");
  lines.push(
    isZh
      ? "[输出要求] 只输出最终提示词正文，不要解释、不要标题、不要代码块；若输入含@引用，输出必须保留@引用。"
      : "[Output] Return only the final prompt body. No explanation, no headings, no code blocks; preserve @mentions when provided.",
  );

  return lines.join("\n");
}

export function buildCompactEnhancedPrompt(input: BuildCompactEnhancedPromptInput): string {
  const ruleLevel: PromptEnhancerRuleLevel = input.ruleLevel === "full" ? "full" : "lite";
  return ruleLevel === "full" ? buildFullPrompt(input) : buildLitePrompt(input);
}
