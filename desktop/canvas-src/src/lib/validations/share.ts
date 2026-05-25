import { z } from "zod";

export const createShareSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(5).default([]),
  category: z.string().max(50).optional(),
  shareCanvas: z.boolean().default(false),
  showcaseUrl: z.string().min(1),
  showcaseType: z.enum(["IMAGE", "VIDEO"]),
  showcaseWidth: z.number().int().positive().optional(),
  showcaseHeight: z.number().int().positive().optional(),
  showcaseDurationS: z.number().positive().optional(),
  coverUrl: z.string().min(1),
});

export const updateShareSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(30)).max(5).optional(),
  category: z.string().max(50).nullable().optional(),
  shareCanvas: z.boolean().optional(),
});

export const shareListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["latest", "popular", "views"]).default("latest"),
  tag: z.string().max(30).optional(),
  category: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  userId: z.string().uuid().optional(),
});
