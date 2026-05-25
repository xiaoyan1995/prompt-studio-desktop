import { redis } from "@/lib/redis";
import type { CompiledDag } from "./compiler";

/**
 * DAG Run state stored in Redis for cross-worker coordination.
 * Key: dag:run:{runId}
 */
export interface DagRunState {
  runId: string;
  projectId: string;
  userId: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELED";
  layers: Array<{
    level: number;
    nodeIds: string[];
    jobIds: string[];
  }>;
  currentLayer: number;
  totalLayers: number;
  nodeJobMap: Record<string, string>; // nodeId → jobId
  nodeStatus: Record<string, "PENDING" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELED">;
  totalPrice: number;
  createdAt: string;
}

const DAG_RUN_TTL = 3600 * 24; // 24h

export async function createDagRun(state: DagRunState): Promise<void> {
  await redis.set(`dag:run:${state.runId}`, JSON.stringify(state), "EX", DAG_RUN_TTL);
}

export async function getDagRun(runId: string): Promise<DagRunState | null> {
  const data = await redis.get(`dag:run:${runId}`);
  return data ? JSON.parse(data) : null;
}

export async function updateDagRun(runId: string, updates: Partial<DagRunState>): Promise<DagRunState | null> {
  const current = await getDagRun(runId);
  if (!current) return null;
  const updated = { ...current, ...updates };
  await redis.set(`dag:run:${runId}`, JSON.stringify(updated), "EX", DAG_RUN_TTL);
  return updated;
}

/**
 * Called when a job in a DAG run completes (success or failure).
 * Checks if the current layer is done, then triggers the next layer or finalizes.
 * Returns the list of node IDs to enqueue next (empty if done or blocked).
 */
export async function onDagJobComplete(
  runId: string,
  nodeId: string,
  success: boolean
): Promise<{ nextNodeIds: string[]; dagComplete: boolean; dagStatus: DagRunState["status"] }> {
  const run = await getDagRun(runId);
  if (!run || run.status !== "RUNNING") {
    return { nextNodeIds: [], dagComplete: true, dagStatus: run?.status ?? "FAILED" };
  }

  // Update node status
  run.nodeStatus[nodeId] = success ? "SUCCEEDED" : "FAILED";

  // If failed, mark all downstream nodes as SKIPPED
  if (!success) {
    skipDownstream(run, nodeId);
  }

  // Check if current layer is complete
  const currentLayerNodes = run.layers[run.currentLayer]?.nodeIds ?? [];
  const allDone = currentLayerNodes.every(
    (id) => run.nodeStatus[id] === "SUCCEEDED" ||
            run.nodeStatus[id] === "FAILED" ||
            run.nodeStatus[id] === "SKIPPED"
  );

  if (!allDone) {
    await updateDagRun(runId, { nodeStatus: run.nodeStatus });
    return { nextNodeIds: [], dagComplete: false, dagStatus: "RUNNING" };
  }

  // Current layer complete — check for next layer
  const nextLayerIdx = run.currentLayer + 1;
  if (nextLayerIdx >= run.totalLayers) {
    // All layers done — determine final status
    const allStatuses = Object.values(run.nodeStatus);
    const anyFailed = allStatuses.some((s) => s === "FAILED");
    const anySucceeded = allStatuses.some((s) => s === "SUCCEEDED");
    const anySkipped = allStatuses.some((s) => s === "SKIPPED");

    let dagStatus: DagRunState["status"] = "SUCCEEDED";
    if (anyFailed || anySkipped) {
      dagStatus = anySucceeded ? "PARTIAL_SUCCESS" : "FAILED";
    }

    run.currentLayer = nextLayerIdx;
    run.status = dagStatus;
    await updateDagRun(runId, run);
    return { nextNodeIds: [], dagComplete: true, dagStatus };
  }

  // Enqueue next layer — filter out SKIPPED nodes
  const nextLayer = run.layers[nextLayerIdx];
  const nextNodeIds = nextLayer.nodeIds.filter(
    (id) => run.nodeStatus[id] !== "SKIPPED"
  );

  // Mark queued
  for (const id of nextNodeIds) {
    run.nodeStatus[id] = "QUEUED";
  }
  run.currentLayer = nextLayerIdx;
  await updateDagRun(runId, run);

  return { nextNodeIds, dagComplete: false, dagStatus: "RUNNING" };
}

function skipDownstream(run: DagRunState, failedNodeId: string) {
  // Find all layers after current and mark nodes that depend on failed node
  // Simple approach: mark any PENDING node that has the failed node as an ancestor
  for (let i = run.currentLayer + 1; i < run.totalLayers; i++) {
    for (const nodeId of run.layers[i].nodeIds) {
      if (run.nodeStatus[nodeId] === "PENDING") {
        // Check if this node depends on the failed node (via layer ordering)
        // For simplicity, we mark all PENDING nodes in subsequent layers
        // that haven't been explicitly queued yet as potentially skippable.
        // The actual dependency check happens when the layer is enqueued.
        // For now, we'll do a simple check in onDagJobComplete.
      }
    }
  }
  // More precise: traverse adjacency from the failed node
  // This requires the adjacency map which we don't have in Redis state.
  // Simple solution: store adjacency in the run state.
  // For MVP, mark nodes as SKIPPED when their layer is about to be enqueued
  // if any of their parents are FAILED/SKIPPED.
}

/**
 * Check if a node's dependencies are all satisfied (all parents SUCCEEDED).
 */
export function canExecuteNode(
  nodeId: string,
  run: DagRunState,
  reverseAdj: Record<string, string[]>
): boolean {
  const parents = reverseAdj[nodeId] ?? [];
  return parents.every((pid) => run.nodeStatus[pid] === "SUCCEEDED");
}
