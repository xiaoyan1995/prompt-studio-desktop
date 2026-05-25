import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_favorited: z.boolean().optional(),
});

export const projectListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(200).optional(),
  sort: z.enum(["updated_at", "created_at", "name"]).default("updated_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  favorited: z.coerce.boolean().optional(),
});
