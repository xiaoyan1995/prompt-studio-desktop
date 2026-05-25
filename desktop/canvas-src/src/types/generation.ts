export interface JobInputParams {
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  count?: number;
  seed?: number;
  tier?: "standard" | "hd" | "ultra";
  reference_images?: string[];
  reference_strength?: number;
  duration_s?: number;
  aspect_ratio?: string;
  camera_motion?: string;
  /** Optional pricing dimension for storyboard parsing. */
  source_type?: "text" | "images" | "video" | string;
  /** Optional pricing dimension for storyboard shot limit. */
  max_shots?: number;
}

export interface AdapterOutput {
  assets: Array<{
    url: string;
    width: number;
    height: number;
    format: "png" | "jpg" | "webp" | "mp4" | "wav" | "mp3";
    duration_s?: number;
    seed?: number;
  }>;
  metadata: Record<string, unknown>;
}

export type ErrorCategory = "PLATFORM_ERROR" | "USER_INPUT" | "CONTENT_POLICY" | "RATE_LIMIT";

export interface AdapterErrorClassification {
  category: ErrorCategory;
  retryable: boolean;
  maxRetries: number;
  retryDelay_ms: number;
  userMessage: string;
  providerCode?: string;
}

export interface ProviderRequest {
  model_id?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

export interface ModelCapabilities {
  max_outputs: number;
  resolutions: string[];
  supports_negative_prompt?: boolean;
  supports_reference_image?: boolean;
  max_reference_images?: number;
  max_duration_s?: number;
}

export interface PricingBreakdown {
  base_xins: number;
  resolution_multiplier: number;
  count_multiplier: number;
  tier_multiplier: number;
  duration_multiplier: number;
  source_type_multiplier?: number;
  max_shots_multiplier?: number;
  total_xins: number;
  unit_price: number;
}
