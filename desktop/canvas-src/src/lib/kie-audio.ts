/**
 * KIE.ai ElevenLabs audio generation client.
 * Model: elevenlabs/text-to-dialogue-v3
 * API docs: https://kie.ai/elevenlabs/text-to-dialogue-v3
 *
 * Uses the same createTask / recordInfo polling pattern as KIE Seedance video.
 */

const KIE_BASE_URL = "https://api.kie.ai";

export const AUDIO_MODEL = "elevenlabs/text-to-dialogue-v3" as const;
export const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Brian
/* ── Voices (official ElevenLabs premade voices) ── */
export type VoiceAccent = "american" | "british" | "australian";
export type VoiceGender = "male" | "female" | "neutral";
export type VoiceAge = "young" | "middle_aged" | "old";

export interface ElevenLabsVoice {
  id: string;
  name: string;
  desc: string;
  accent: VoiceAccent;
  gender: VoiceGender;
  age: VoiceAge;
  previewUrl: string;
}

const PREVIEW_CDN = "https://static.aiquickdraw.com/elevenlabs/voice";

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",     desc: "Deep, Resonant, Comforting",    accent: "american",   gender: "male",    age: "middle_aged", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/2dd3e72c-4fd3-42f1-93ea-abc5d4e5aa1d.mp3" },
  { id: "EkK5I93UQWFDigLMpZcX", name: "James",     desc: "Authoritative, Confident",      accent: "american",   gender: "male",    age: "middle_aged", previewUrl: `${PREVIEW_CDN}/EkK5I93UQWFDigLMpZcX.mp3` },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura",     desc: "Enthusiast, Quirky Attitude",   accent: "american",   gender: "female",  age: "young",       previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/FGY2WhTYpPnrIDTdsKH5/67341759-ad08-41a5-be6e-de12fe448618.mp3" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum",    desc: "Husky, Gravelly Trickster",     accent: "american",   gender: "male",    age: "middle_aged", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam",      desc: "Energetic, Social Media",       accent: "american",   gender: "male",    age: "young",       previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella",     desc: "Professional, Bright, Warm",    accent: "american",   gender: "female",  age: "middle_aged", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3" },
  { id: "BZgkqPqms7Kj9ulSkVzn", name: "Eve",       desc: "Warm, Gentle",                  accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/BZgkqPqms7Kj9ulSkVzn.mp3` },
  { id: "gs0tAILXbY5DNrJrsM6F", name: "Jeff",      desc: "Clear, Conversational",         accent: "american",   gender: "male",    age: "middle_aged", previewUrl: `${PREVIEW_CDN}/gs0tAILXbY5DNrJrsM6F.mp3` },
  { id: "pPdl9cQBQq4p6mRkZy2Z", name: "Emma",      desc: "Friendly, Natural",             accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/pPdl9cQBQq4p6mRkZy2Z.mp3` },
  { id: "5l5f8iK3YPeGga21rQIX", name: "Adeline",   desc: "Soft, Expressive",              accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/5l5f8iK3YPeGga21rQIX.mp3` },
  { id: "Z3R5wn05IrDiVCyEkUrK", name: "Arabella",  desc: "Elegant, Articulate",           accent: "british",    gender: "female",  age: "middle_aged", previewUrl: `${PREVIEW_CDN}/Z3R5wn05IrDiVCyEkUrK.mp3` },
  { id: "vBKc2FfBKJfcZNyEt1n6", name: "Finn",      desc: "Youthful, Casual",              accent: "american",   gender: "male",    age: "young",       previewUrl: `${PREVIEW_CDN}/vBKc2FfBKJfcZNyEt1n6.mp3` },
  { id: "DYkrAHD8iwork3YSUBbs", name: "Tom",       desc: "Steady, Reliable",              accent: "american",   gender: "male",    age: "middle_aged", previewUrl: `${PREVIEW_CDN}/DYkrAHD8iwork3YSUBbs.mp3` },
  { id: "Sm1seazb4gs7RSlUVw7c", name: "Anika",     desc: "Bright, Cheerful",              accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/Sm1seazb4gs7RSlUVw7c.mp3` },
  { id: "AeRdCCKzvd23BpJoofzx", name: "Nathaniel", desc: "Refined, Thoughtful",           accent: "british",    gender: "male",    age: "middle_aged", previewUrl: `${PREVIEW_CDN}/AeRdCCKzvd23BpJoofzx.mp3` },
  { id: "LruHrtVF6PSyGItzMNHS", name: "Benjamin",  desc: "Calm, Composed",                accent: "american",   gender: "male",    age: "middle_aged", previewUrl: `${PREVIEW_CDN}/LruHrtVF6PSyGItzMNHS.mp3` },
  { id: "Sq93GQT4X1lKDXsQcixO", name: "Felix",     desc: "Lively, Spirited",              accent: "british",    gender: "male",    age: "young",       previewUrl: `${PREVIEW_CDN}/Sq93GQT4X1lKDXsQcixO.mp3` },
  { id: "DTKMou8ccj1ZaWGBiotd", name: "Jamahal",   desc: "Bold, Energetic",               accent: "american",   gender: "male",    age: "young",       previewUrl: `${PREVIEW_CDN}/DTKMou8ccj1ZaWGBiotd.mp3` },
  { id: "lcMyyd2HUfFzxdCaC4Ta", name: "Lucy",      desc: "Sweet, Youthful",               accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/lcMyyd2HUfFzxdCaC4Ta.mp3` },
  { id: "6aDn1KB0hjpdcocrUkmq", name: "Tiffany",   desc: "Upbeat, Vibrant",               accent: "american",   gender: "female",  age: "young",       previewUrl: `${PREVIEW_CDN}/6aDn1KB0hjpdcocrUkmq.mp3` },
];

export interface KieTaskResult {
  taskId: string;
  status: string;
}

/* ── Create Task (dialogue-v3) ── */
export interface DialogueLine {
  text: string;
  voice: string;
}

export interface KieDialogueCreateParams {
  dialogue: DialogueLine[];
  stability?: number;
  languageCode?: string;
  apiKey: string;
}

export async function createKieDialogueTask(params: KieDialogueCreateParams): Promise<KieTaskResult> {
  const { dialogue, stability = 0.5, languageCode = "", apiKey } = params;

  const body: Record<string, unknown> = {
    model: "elevenlabs/text-to-dialogue-v3" as const,
    input: {
      dialogue,
      stability,
      ...(languageCode ? { language_code: languageCode } : {}),
    },
  };

  console.log("[kie-audio] creating dialogue task voices=%d lines", dialogue.length);

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Dialogue create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;

  if (!taskId) {
    throw new Error(`KIE Dialogue create task: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-audio] dialogue task created id=%s", taskId);
  return { taskId, status: "waiting" };
}

/* ── Poll Task ── */
export interface KieAudioResult {
  audioUrl: string;
  status: string;
  errorMessage: string;
  errorCode: string;
}

export async function pollKieAudioTask(taskId: string, apiKey: string): Promise<KieAudioResult> {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Audio poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const record = data.data ?? {};
  const rawState = (record.state ?? "unknown").toLowerCase();

  // Parse resultJson for audio URL
  let audioUrl = "";
  if (record.resultJson) {
    try {
      const result = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson;
      const urls = result.resultUrls ?? result.result_urls ?? [];
      audioUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : (result.audio_url ?? result.url ?? "");
    } catch {
      console.warn("[kie-audio] failed to parse resultJson:", record.resultJson);
    }
  }

  let status: string;
  if (rawState === "success" || rawState === "succeeded" || rawState === "completed") {
    status = "succeeded";
  } else if (rawState === "waiting" || rawState === "running" || rawState === "processing" || rawState === "queued" || rawState === "pending") {
    status = "running";
  } else {
    status = "failed";
  }

  const errorMessage = record.failMsg ?? "";
  const errorCode = record.failCode ?? "";

  if (status !== "running") {
    console.log("[kie-audio] poll task=%s state=%s audioUrl=%s", taskId, status, audioUrl ? audioUrl.slice(0, 80) : "(none)");
  }

  return { audioUrl, status, errorMessage, errorCode };
}

/* ── Wait for completion ── */
const MAX_POLL_ATTEMPTS = 120; // 120 * 3s = 6min max
const POLL_INTERVAL_MS = 3_000;

export async function waitForKieAudio(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { audioUrl, status, errorMessage, errorCode } = await pollKieAudioTask(taskId, apiKey);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "succeeded") {
        if (!audioUrl) throw new Error("KIE Audio task succeeded but no audio URL in resultJson");
        console.log("[kie-audio] task=%s succeeded url=%s (attempt %d)", taskId, audioUrl.slice(0, 80), attempt);
        return audioUrl;
      }

      if (status === "failed") {
        const detail = errorMessage || errorCode || "unknown error";
        throw new Error(`KIE Audio task failed: ${detail}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        throw new Error(`KIE Audio polling failed after ${consecutiveErrors} consecutive errors: ${lastErrorMsg}`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`KIE Audio task timed out after ${MAX_POLL_ATTEMPTS} poll attempts`);
}
