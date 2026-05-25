// ── OpenAI Direct Image API — GPT Image 2 ──
// Uses /v1/images/generations with model: "gpt-image-2" directly.
// Supports 4K sizes, returns base64 PNG.
//
// gpt-image-2 size constraints (from official docs):
//   - Max edge ≤ 3840px
//   - Both edges multiples of 16px
//   - Long:short ratio ≤ 3:1
//   - Total pixels: 655,360 – 8,294,400

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Size map per quality tier — all within pixel limits, edges mult of 16
const OPENAI_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1024x768", "3:4": "768x1024",
    "3:2": "1536x1024", "2:3": "1024x1536",
    "16:9": "1536x1024", "9:16": "1024x1536",
    "5:4": "1280x1024", "4:5": "1024x1280",
    "21:9": "1344x576",
    "2:1": "1536x768", "1:2": "768x1536",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2560x1920", "3:4": "1920x2560",
    "3:2": "2560x1712", "2:3": "1712x2560",
    "16:9": "2560x1440", "9:16": "1440x2560",
    "5:4": "2560x2048", "4:5": "2048x2560",
    "21:9": "2688x1152",
    "2:1": "2560x1280", "1:2": "1280x2560",
  },
  "4K": {
    "1:1": "2880x2880",
    "4:3": "3264x2448", "3:4": "2448x3264",
    "3:2": "3504x2336", "2:3": "2336x3504",
    "16:9": "3840x2160", "9:16": "2160x3840",
    "5:4": "3200x2560", "4:5": "2560x3200",
    "21:9": "3840x1648",
    "2:1": "3840x1920", "1:2": "1920x3840",
  },
};

function buildOpenAISize(ratio: string | null, quality: string): string {
  const qMap = OPENAI_SIZE_MAP[quality] ?? OPENAI_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? "1024x1024";
  return qMap[ratio] ?? qMap["1:1"] ?? "1024x1024";
}

export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

export interface OpenAIGptImage2Result {
  remoteUrl: string; // data:image/png;base64,...
}

export async function callOpenAIGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
}): Promise<OpenAIGptImage2Result> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const sizeValue = buildOpenAISize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : "high";

  console.log("[openai-gpt-image-2] Image API request size=%s quality=%s", sizeValue, qualityValue);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: params.prompt,
      n: 1,
      size: sizeValue,
      quality: qualityValue,
      output_format: "png",
      output_compression: 0,
      moderation: "low",
    }),
    signal: AbortSignal.timeout(300_000), // 5 min
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenAI Image API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = await res.json() as any;
  const b64 = body.data?.[0]?.b64_json;
  if (b64) {
    console.log("[openai-gpt-image-2] completed (base64, %d bytes)", b64.length);
    return { remoteUrl: `data:image/png;base64,${b64}` };
  }

  throw new Error("OpenAI Image API: no b64_json in response: " + JSON.stringify(body).slice(0, 500));
}
