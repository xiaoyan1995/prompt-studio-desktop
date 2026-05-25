import { db } from "@/lib/db";

/**
 * Check if a node has a cached output (successful job with assets).
 * Cache key: node_id + model_id + input_params hash.
 * Returns the job ID if cached, null otherwise.
 */
export async function getNodeCache(
  nodeId: string,
  userId: string,
  modelId: string,
  inputParamsHash: string
): Promise<string | null> {
  // Find the most recent SUCCEEDED job for this node with matching params
  const job = await db.job.findFirst({
    where: {
      user_id: userId,
      node_id: nodeId,
      model_id: modelId,
      status: "SUCCEEDED",
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      input_params: true,
    },
  });

  if (!job) return null;

  // Compare input params hash
  const jobHash = hashInputParams(job.input_params as Record<string, unknown>);
  if (jobHash !== inputParamsHash) return null;

  // Verify assets exist
  const assetCount = await db.asset.count({
    where: { job_id: job.id, deleted_at: null },
  });

  return assetCount > 0 ? job.id : null;
}

/**
 * Simple hash of input params for cache comparison.
 * Uses JSON.stringify with sorted keys for determinism.
 */
export function hashInputParams(params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
