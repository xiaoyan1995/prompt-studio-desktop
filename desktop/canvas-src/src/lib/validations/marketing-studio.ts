import { z } from "zod";
import { MARKETING_VIDEO_MODES } from "@/types/marketing-studio";

// ─── Product CRUD ───────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  brand: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  image_urls: z.array(z.string()).min(1).max(10),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  image_urls: z.array(z.string()).min(1).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const productListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(200).optional(),
  sort: z.enum(["updated_at", "created_at", "name"]).default("updated_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

// ─── Script Generation ──────────────────────────────────

export const generateScriptSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(200),
  productDescription: z.string().max(2000).optional(),
  productImages: z.array(z.string()).max(5).optional(),
  mode: z.enum(MARKETING_VIDEO_MODES as [string, ...string[]]),
  locale: z.enum(["en", "zh"]).default("zh"),
  customInstructions: z.string().max(1000).optional(),
});
