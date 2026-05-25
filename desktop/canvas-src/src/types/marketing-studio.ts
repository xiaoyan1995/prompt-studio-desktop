// ─── Marketing Studio Types ─────────────────────────────

export type MarketingVideoMode =
  | "ugc"
  | "unboxing"
  | "tutorial"
  | "product_showcase"
  | "product_review"
  | "tv_spot"
  | "wild_card";

export const MARKETING_VIDEO_MODES: MarketingVideoMode[] = [
  "ugc",
  "unboxing",
  "tutorial",
  "product_showcase",
  "product_review",
  "tv_spot",
  "wild_card",
];

export interface MarketingScript {
  hook: string;
  body: string;
  cta: string;
  fullText: string;
}

export interface MarketingVideoJobParams {
  kind: "marketing.video";

  // Product info
  productId?: string;
  productImages: string[];
  productName: string;
  productDescription?: string;

  // Mode
  mode: MarketingVideoMode;

  // Script
  script: MarketingScript;

  // Generation params
  prompt: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  generateAudio: boolean;

  // Optional references
  referenceImageUrls?: string[];
  referenceVideoUrl?: string;

  // Runtime (written by worker)
  remote_task_id?: string;
  remote_provider?: string;
}

export interface MarketingProduct {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  image_urls: string[];
  metadata: Record<string, unknown>;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
