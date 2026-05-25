import { z } from "zod";

export const createJobSchema = z.object({
  model_id: z.string().min(1),
  node_id: z.string().optional(),
  project_id: z.string().optional(),
  input_params: z.object({
    prompt: z.string().min(1, "Prompt is required").max(2500),
    negative_prompt: z.string().max(500).optional(),
    resolution: z.string().optional(),
    count: z.number().int().min(1).max(4).optional().default(1),
    seed: z.number().int().optional(),
    tier: z.enum(["standard", "hd", "ultra"]).optional(),
    reference_images: z.array(z.string()).max(4).optional(),
    reference_strength: z.number().min(0).max(1).optional(),
    duration_s: z.number().int().optional(),
    aspect_ratio: z.string().optional(),
    camera_motion: z.string().optional(),
  }),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
