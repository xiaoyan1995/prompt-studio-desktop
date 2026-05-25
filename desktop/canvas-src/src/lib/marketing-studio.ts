/**
 * Marketing Studio — core logic
 *
 * Mode-specific prompt templates, LLM script generation,
 * and Seedance video prompt composition.
 */
import { callLlm } from "@/lib/llm";
import type { MarketingVideoMode, MarketingScript } from "@/types/marketing-studio";

// ─── Mode Templates ─────────────────────────────────────

interface ModeTemplate {
  systemPromptEn: string;
  systemPromptZh: string;
  visualHint: string;
  visualHintZh: string;
}

const MODE_TEMPLATES: Record<MarketingVideoMode, ModeTemplate> = {
  ugc: {
    systemPromptEn: `You are a social media content creator. Write a casual, authentic UGC-style ad script for the product.
Include: 1) A hook question or bold claim, 2) Personal experience with the product, 3) Key benefits shown naturally, 4) Call to action.
Tone: conversational, relatable, like talking to a friend.`,
    systemPromptZh: `你是一位社交媒体内容创作者。为产品撰写一段真实自然的 UGC 风格广告脚本。
包含：1) 引人注目的钩子问题或大胆声明，2) 使用产品的个人体验，3) 自然展示产品核心卖点，4) 行动号召。
语气：口语化、有代入感，像跟朋友聊天一样。`,
    visualHint: "handheld camera, natural lighting, selfie-style POV, authentic casual feel, social media aesthetic",
    visualHintZh: "手持镜头、自然光线、自拍视角、真实随性感、社交媒体美学",
  },
  unboxing: {
    systemPromptEn: `Write an exciting unboxing script. Include: 1) Anticipation/teaser, 2) Package reveal, 3) First impressions of each item, 4) Standout feature highlight.
Tone: enthusiastic, genuine excitement.`,
    systemPromptZh: `撰写一段精彩的开箱脚本。包含：1) 期待/预告，2) 包装揭晓，3) 对每个物品的第一印象，4) 亮点功能展示。
语气：热情洋溢、真实兴奋。`,
    visualHint: "top-down and close-up shots, hands revealing products from packaging, clean desk background, satisfying reveal moments",
    visualHintZh: "俯拍与特写镜头、双手从包装中取出产品、简洁桌面背景、满足感揭晓瞬间",
  },
  tutorial: {
    systemPromptEn: `Write a how-to tutorial script. Include: 1) Problem statement, 2) Step-by-step solution using the product, 3) Tips and tricks, 4) Before/after comparison.
Tone: helpful, clear, instructive.`,
    systemPromptZh: `撰写一段产品使用教程脚本。包含：1) 问题描述，2) 使用产品的分步解决方案，3) 使用技巧，4) 前后对比。
语气：乐于助人、清晰明了、有指导性。`,
    visualHint: "screen-like layout, step-by-step visual progression, clean and organized, instructional overlay style",
    visualHintZh: "屏幕式构图、分步视觉递进、整洁有序、教程叠加风格",
  },
  product_showcase: {
    systemPromptEn: `Write a premium product showcase script. Include: 1) Dramatic reveal, 2) Design/craftsmanship details, 3) Key features with visual focus, 4) Lifestyle context.
Tone: polished, aspirational, cinematic.`,
    systemPromptZh: `撰写一段高端产品展示脚本。包含：1) 戏剧性揭幕，2) 设计/工艺细节，3) 核心功能的视觉呈现，4) 生活场景融入。
语气：精致、令人向往、电影感。`,
    visualHint: "cinematic lighting, smooth camera movement, product hero shots, bokeh background, premium feel",
    visualHintZh: "电影级灯光、流畅镜头运动、产品主角特写、虚化背景、高端质感",
  },
  product_review: {
    systemPromptEn: `Write an honest product review script. Include: 1) Context/why you tried it, 2) Pros with specifics, 3) Minor cons for trust, 4) Final verdict and recommendation.
Tone: balanced, trustworthy, detail-oriented.`,
    systemPromptZh: `撰写一段诚实的产品评测脚本。包含：1) 使用背景/为什么体验，2) 具体优点，3) 小缺点（增加可信度），4) 最终评价和推荐。
语气：客观平衡、值得信赖、注重细节。`,
    visualHint: "medium shot of reviewer, cut to product close-ups, comparison angles, informative overlay",
    visualHintZh: "评测者中景、产品特写切换、对比角度、信息叠加",
  },
  tv_spot: {
    systemPromptEn: `Write a professional TV commercial script. Include: 1) Attention-grabbing opening, 2) Problem/solution narrative, 3) Product as hero, 4) Brand tagline and CTA.
Tone: polished, cinematic, brand-forward.`,
    systemPromptZh: `撰写一段专业的电视广告脚本。包含：1) 吸睛的开场，2) 问题/解决方案叙事，3) 产品作为主角，4) 品牌标语和行动号召。
语气：精致专业、电影感、品牌至上。`,
    visualHint: "professional cinematography, dramatic lighting, brand colors, cinematic composition, commercial grade",
    visualHintZh: "专业电影摄影、戏剧化光影、品牌色调、电影级构图、商业品质",
  },
  wild_card: {
    systemPromptEn: `Write a creative, unconventional ad script. Break conventions. Be surprising, funny, or emotionally powerful. The goal is to stop the scroll.
Tone: creative, unexpected, memorable.`,
    systemPromptZh: `撰写一段创意十足、打破常规的广告脚本。可以出人意料、幽默有趣或情感有力。目标是让人停下来看。
语气：创意十足、出乎意料、令人难忘。`,
    visualHint: "creative visual style, dynamic transitions, unexpected angles, bold colors, scroll-stopping",
    visualHintZh: "创意视觉风格、动感转场、出其不意的角度、大胆用色、令人驻足",
  },
};

// ─── Script Generation ──────────────────────────────────

const SCRIPT_WRAPPER_EN = `You are an expert advertising copywriter for short-form video ads.

Given a product and an ad style/mode, generate a structured ad script.

Output ONLY a valid JSON object with this exact shape (no markdown fences):
{
  "hook": "The opening hook line (1-2 sentences, attention-grabbing)",
  "body": "The main content (3-6 sentences, product features and benefits)",
  "cta": "The call to action (1-2 sentences)",
  "fullText": "The complete script combining hook + body + cta as natural flowing text"
}

Rules:
- The script should be optimized for short-form video (15-30 seconds when read aloud)
- Each section should flow naturally into the next
- Use vivid, visual language that translates well to video
- Keep it concise — every word should earn its place`;

const SCRIPT_WRAPPER_ZH = `你是一位专业的短视频广告文案撰写专家。

根据产品信息和广告风格/模式，生成结构化的广告脚本。

仅输出一个有效的 JSON 对象，格式如下（不要 markdown 代码块）：
{
  "hook": "开场钩子（1-2句话，吸引注意力）",
  "body": "主体内容（3-6句话，产品特点和优势）",
  "cta": "行动号召（1-2句话）",
  "fullText": "将 hook + body + cta 合并成自然流畅的完整脚本文本"
}

规则：
- 脚本应针对短视频优化（朗读时长 15-30 秒）
- 各部分之间应自然衔接
- 使用生动的、适合画面表达的语言
- 保持简洁——每个字都要物有所值`;

const SCRIPT_MODEL_ID = "gemini-2.5-flash-preview-05-20";

/**
 * Convert image URLs to absolute public URLs that external LLM APIs can fetch.
 * Relative paths like /api/files/... need to be prefixed with the app's base URL.
 */
function resolveToPublicUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://xinyuai.app";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Build multimodal content (text + image_url parts) for Gemini vision.
 * Returns plain string if no images, or an array of content parts.
 */
function buildMultimodalContent(
  text: string,
  imageUrls?: string[],
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (!imageUrls || imageUrls.length === 0) return text;
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text },
  ];
  for (const url of imageUrls.slice(0, 5)) {
    parts.push({ type: "image_url", image_url: { url: resolveToPublicUrl(url) } });
  }
  return parts;
}

export interface GenerateScriptParams {
  productName: string;
  productDescription?: string;
  productImages?: string[];
  mode: MarketingVideoMode;
  locale: "en" | "zh";
  customInstructions?: string;
}

export async function generateMarketingScript(
  params: GenerateScriptParams,
): Promise<{ script: MarketingScript; suggestedPrompt: string }> {
  const { productName, productDescription, productImages, mode, locale, customInstructions } = params;
  const template = MODE_TEMPLATES[mode];
  const isZh = locale === "zh";

  const systemPrompt = [
    isZh ? SCRIPT_WRAPPER_ZH : SCRIPT_WRAPPER_EN,
    "",
    isZh ? "## 广告风格要求" : "## Ad Style Requirements",
    isZh ? template.systemPromptZh : template.systemPromptEn,
    customInstructions ? `\n${isZh ? "## 用户额外要求" : "## Additional Instructions"}\n${customInstructions}` : "",
  ].join("\n");

  const userText = isZh
    ? `产品名称：${productName}\n${productDescription ? `产品描述：${productDescription}` : "（无额外描述）"}\n\n请为这个产品生成一段「${mode}」模式的广告脚本。${productImages?.length ? "\n（已附上产品图片，请结合图片中的产品外观特征撰写脚本）" : ""}`
    : `Product: ${productName}\n${productDescription ? `Description: ${productDescription}` : "(No additional description)"}\n\nGenerate an ad script in "${mode}" mode for this product.${productImages?.length ? "\n(Product images attached — incorporate visible product features into the script)" : ""}`;

  // Build multimodal content if images are provided
  const userContent = buildMultimodalContent(userText, productImages);

  const { response } = await callLlm({
    model: SCRIPT_MODEL_ID,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    stream: false,
    temperature: 0.7,
    max_tokens: 4096,
    timeoutMs: 3_600_000,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Script generation failed (${response.status}): ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const raw = data?.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) throw new Error("Empty response from script model");

  const script = parseScriptJson(raw);
  const suggestedPrompt = composeVideoPrompt(script, { name: productName, description: productDescription }, mode);

  return { script, suggestedPrompt };
}

function parseScriptJson(raw: string): MarketingScript {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(text);
    return {
      hook: String(parsed.hook ?? ""),
      body: String(parsed.body ?? ""),
      cta: String(parsed.cta ?? ""),
      fullText: String(parsed.fullText ?? `${parsed.hook ?? ""} ${parsed.body ?? ""} ${parsed.cta ?? ""}`).trim(),
    };
  } catch {
    return {
      hook: "",
      body: text.slice(0, 500),
      cta: "",
      fullText: text.slice(0, 800),
    };
  }
}

// ─── Video Prompt Composition (simple fallback) ─────────

export function composeVideoPrompt(
  script: MarketingScript,
  product: { name: string; description?: string },
  mode: MarketingVideoMode,
): string {
  const template = MODE_TEMPLATES[mode];
  const parts: string[] = [
    template.visualHint,
    `A person presents the ${product.name}, holding it up to the camera with a confident expression.`,
  ];
  return parts.join(". ").slice(0, 2000);
}

// ─── Seedance 2.0 Structured Prompt (LLM-powered) ───────
// Modeled after storyboard worker's proven approach: Chinese system prompt,
// streaming, high max_tokens, long timeout.

const SEEDANCE_PROMPT_SYSTEM_ZH = `你是 Seedance 2.0 视频提示词工程师。将广告脚本转换为视频生成AI可直接使用的提示词。

【核心理解】
Seedance 生成的是一段连续视频（单镜头），不是多镜头剪辑。你的提示词必须描述一个不间断的连续画面。

【参考图引用规则 — 最高优先级】
如果用户提供了参考图（@image_1、@image_2...），你必须：
1. 在提示词开头声明每张图的用途，例如：
   @image_1 = 产品外观参照（颜色、形状、材质）。@image_2 = 角色面部与服装参照。
2. 在描述中用 @image_N 引用，例如："她戴着@image_1的银色耳机"、"@image_2的年轻女性"
3. 解耦原则：参考图已包含的特征（产品外观、人物面容）不在文字中重复描述细节，只描述参考图没有的（动作、光线、镜头运动）
4. 如果没有提供参考图，则不使用@引用

【输出格式】
先输出参考图声明行（如有），然后输出一段完整的视觉描述文字。

格式：
@image_1 = 用途说明。@image_2 = 用途说明。
[风格关键词], [连续画面描述，其中用@image_N引用参考图]

【强制规则】
- 参考图声明后，只输出一段话，禁止多段、标号
- 开头3-5个逗号分隔的风格关键词
- 然后描述一个连续的镜头运动和动作
- 总长度：150-500字（不含参考图声明行）
- 用逗号串联视觉节奏

【必须包含】
- 一个明确的镜头运动（跟踪、推近、环绕等）
- 光线质感（暖光、冷光、棚光、自然光）
- 如有参考图：用@image_N引用产品和角色
- 如无参考图：详细描述人物外貌和产品外观

【禁止包含】
- 多段或分镜头（"然后..."、"接着..."、"切到..."）
- 对白、旁白、文字
- 产品参数（电池、价格、功能）
- 营销文案或行动号召
- 时间标记、"画面比例"等技术参数
- BGM（只写物理环境音效，如有需要）

仅输出提示词文本，不要输出其他内容。`;

const SEEDANCE_PROMPT_SYSTEM_EN = `You are a Seedance 2.0 video prompt engineer. Convert ad scripts into prompts directly usable by video generation AI.

## Critical Understanding
Seedance generates ONE continuous video clip from ONE prompt. Single continuous camera take.

## Reference Image Rules — HIGHEST PRIORITY
If the user provides reference images (@image_1, @image_2...), you MUST:
1. Declare each image's purpose at the start, e.g.:
   @image_1 = product appearance reference. @image_2 = character face and outfit reference.
2. Use @image_N in the description, e.g.: "she wears @image_1 silver headphones", "@image_2 young woman"
3. Decoupling: features already in the reference image (product appearance, face) should NOT be re-described in text. Only describe what's NOT in the image (actions, lighting, camera movement).
4. If no reference images are provided, don't use @references.

## Output Format
First output reference declarations (if any), then ONE paragraph of dense visual prose.

Format:
@image_1 = purpose. @image_2 = purpose.
[style keywords], [continuous scene description using @image_N references]

## STRICT RULES
- After declarations, ONE paragraph only — no line breaks, no sections
- Start with 3-5 comma-separated style keywords
- Then describe ONE continuous camera movement and action
- Total length: 80-300 words (excluding declarations)
- Use commas to chain visual beats

## MUST include:
- ONE clear camera movement (tracking, close-up push, orbit, etc.)
- Lighting quality (warm, cool, studio, natural)
- If images provided: use @image_N to reference product and character
- If no images: describe person's appearance and product appearance in detail

## MUST NOT include:
- Multiple paragraphs or separate shots
- Dialogue, voiceover, spoken text
- Product specs, marketing copy, CTAs
- Time markers or technical video parameters
- BGM (only physical/environment SFX if needed)

Output ONLY the prompt text, nothing else.`;

export interface ComposeVideoPromptParams {
  script: MarketingScript;
  product: { name: string; description?: string };
  productImages?: string[];
  avatarImages?: string[];
  mode: MarketingVideoMode;
  hookPrompt?: string;
  settingPrompt?: string;
  creativeDirections?: string[];
  visualStylePrefix?: string;
  duration?: number;
  aspectRatio?: string;
  locale?: string;
}

export async function composeVideoPromptWithLLM(
  params: ComposeVideoPromptParams,
): Promise<string> {
  const { script, product, productImages, avatarImages, mode, hookPrompt, settingPrompt, creativeDirections, visualStylePrefix, locale } = params;
  const template = MODE_TEMPLATES[mode];
  const isZh = locale === "zh";

  const systemPrompt = isZh ? SEEDANCE_PROMPT_SYSTEM_ZH : SEEDANCE_PROMPT_SYSTEM_EN;

  // Build @image_N mapping: product images first, then avatar images
  const imageDeclarations: { ref: string; label: string; type: "product" | "avatar" }[] = [];
  let imgIdx = 1;
  if (productImages && productImages.length > 0) {
    for (let i = 0; i < Math.min(productImages.length, 5); i++) {
      imageDeclarations.push({
        ref: `@image_${imgIdx}`,
        label: isZh
          ? `${product.name} 产品外观参照（颜色、形状、材质）`
          : `${product.name} product appearance reference`,
        type: "product",
      });
      imgIdx++;
    }
  }
  if (avatarImages && avatarImages.length > 0) {
    for (let i = 0; i < Math.min(avatarImages.length, 3); i++) {
      imageDeclarations.push({
        ref: `@image_${imgIdx}`,
        label: isZh
          ? `角色面部与服装参照`
          : `character face and outfit reference`,
        type: "avatar",
      });
      imgIdx++;
    }
  }

  // Build user message with @image_N declarations
  const userParts: string[] = [];

  // Declare available reference images
  if (imageDeclarations.length > 0) {
    const declLines = imageDeclarations.map((d) => `${d.ref} = ${d.label}`);
    userParts.push(isZh
      ? `【可用参考图】\n${declLines.join("\n")}\n你必须在提示词开头声明这些参考图，并在描述中用 ${imageDeclarations.map((d) => d.ref).join("、")} 引用。`
      : `[Available reference images]\n${declLines.join("\n")}\nYou MUST declare these at the start and use ${imageDeclarations.map((d) => d.ref).join(", ")} in your description.`
    );
  }

  userParts.push(...(isZh
    ? [
        `产品：${product.name}`,
        product.description ? `产品描述：${product.description}` : "",
        `视觉风格：${visualStylePrefix ? `${visualStylePrefix}, ` : ""}${template.visualHintZh}`,
        `脚本参考（仅提取视觉元素）：${script.hook} ${script.body}`,
      ]
    : [
        `Product: ${product.name}`,
        product.description ? `Description: ${product.description}` : "",
        `Style: ${visualStylePrefix ? `${visualStylePrefix}, ` : ""}${template.visualHint}`,
        `Script context (extract VISUALS only): ${script.hook} ${script.body}`,
      ]));

  if (hookPrompt) userParts.push(isZh ? `开场动作：${hookPrompt}` : `Opening action: ${hookPrompt}`);
  if (settingPrompt) userParts.push(isZh ? `场景环境：${settingPrompt}` : `Environment: ${settingPrompt}`);
  if (creativeDirections && creativeDirections.length > 0) {
    userParts.push(isZh ? `创意方向：${creativeDirections.join("；")}` : `Direction: ${creativeDirections.join("; ")}`);
  }

  userParts.push(isZh
    ? "请全部使用中文输出一段完整的 Seedance 视频提示词，150-500字，单一连续镜头。风格关键词也必须使用中文。"
    : "Output ONE complete Seedance video prompt, 80-300 words, single continuous shot.");

  // Build multimodal content — images are for LLM visual understanding only
  const hasImages = (productImages?.length ?? 0) > 0 || (avatarImages?.length ?? 0) > 0;
  let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

  if (!hasImages) {
    userContent = userParts.filter(Boolean).join("\n");
  } else {
    const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: userParts.filter(Boolean).join("\n") },
    ];
    // Attach product images for LLM to see (labeled with @image_N)
    if (productImages && productImages.length > 0) {
      const prodRefs = imageDeclarations.filter((d) => d.type === "product").map((d) => d.ref).join("/");
      parts.push({ type: "text", text: isZh
        ? `\n── 以下是产品图片（${prodRefs}）── LLM参考用，提示词中用 ${prodRefs} 引用`
        : `\n── Product images (${prodRefs}) — for LLM reference, use ${prodRefs} in prompt ──`
      });
      for (const url of productImages.slice(0, 5)) {
        parts.push({ type: "image_url", image_url: { url: resolveToPublicUrl(url) } });
      }
    }
    // Attach avatar images
    if (avatarImages && avatarImages.length > 0) {
      const avatarRefs = imageDeclarations.filter((d) => d.type === "avatar").map((d) => d.ref).join("/");
      parts.push({ type: "text", text: isZh
        ? `\n── 以下是角色图片（${avatarRefs}）── LLM参考用，提示词中用 ${avatarRefs} 引用`
        : `\n── Character images (${avatarRefs}) — for LLM reference, use ${avatarRefs} in prompt ──`
      });
      for (const url of avatarImages.slice(0, 3)) {
        parts.push({ type: "image_url", image_url: { url: resolveToPublicUrl(url) } });
      }
    }
    userContent = parts;
  }

  try {
    const { response } = await callLlm({
      model: SCRIPT_MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      stream: false,
      temperature: 0.5,
      max_tokens: 4096,
      timeoutMs: 3_600_000,
    });

    if (!response.ok) {
      console.error("[marketing] compose-prompt failed:", response.status);
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data?.choices?.[0]?.message?.content ?? "";
    console.log(`[marketing] compose-prompt result (${raw.length} chars):`, raw.slice(0, 200));
    if (!raw.trim()) return "";

    // Ensure single paragraph — strip any line breaks the LLM might add
    const cleaned = raw.trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
    return cleaned.slice(0, 3000);
  } catch (err) {
    console.error("[marketing] compose-prompt error:", err);
    return "";
  }
}

// ─── Exports for worker ─────────────────────────────────

export { MODE_TEMPLATES };
