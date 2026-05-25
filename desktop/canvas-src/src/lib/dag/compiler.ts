import type { SerializedNode, SerializedEdge } from "@/types/canvas";

export interface DagLayer {
  level: number;
  nodeIds: string[];
}

export interface CompiledDag {
  layers: DagLayer[];
  nodeOrder: string[];
  nodeDepths: Map<string, number>;
  adjacency: Map<string, string[]>;
  reverseAdj: Map<string, string[]>;
}

export class DagCycleError extends Error {
  constructor(public involvedNodes: string[]) {
    super(`Cycle detected involving nodes: ${involvedNodes.join(", ")}`);
    this.name = "DagCycleError";
  }
}

/**
 * Compile canvas nodes + edges into a layered DAG using Kahn's algorithm.
 * - Nodes with no incoming edges are layer 0 (source-image, standalone nodes)
 * - Each subsequent layer depends on the previous
 * - Throws DagCycleError if a cycle is detected
 */
export function compileDag(
  nodes: SerializedNode[],
  edges: SerializedEdge[],
  subsetNodeIds?: Set<string>
): CompiledDag {
  const nodeSet = subsetNodeIds
    ? new Set([...subsetNodeIds])
    : new Set(nodes.map((n) => n.id));

  // Build adjacency (source → target) and reverse adjacency
  const adjacency = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeSet) {
    adjacency.set(id, []);
    reverseAdj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.sourceNodeId) || !nodeSet.has(edge.targetNodeId)) continue;
    adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    reverseAdj.get(edge.targetNodeId)!.push(edge.sourceNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  // Kahn's algorithm: BFS from nodes with inDegree=0
  const queue: string[] = [];
  const nodeOrder: string[] = [];
  const nodeDepths = new Map<string, number>();

  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      nodeDepths.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    nodeOrder.push(current);
    const currentDepth = nodeDepths.get(current)!;

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);

      // Depth = max of all parent depths + 1
      const existingDepth = nodeDepths.get(neighbor) ?? 0;
      nodeDepths.set(neighbor, Math.max(existingDepth, currentDepth + 1));

      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Cycle detection: if not all nodes were visited
  if (nodeOrder.length !== nodeSet.size) {
    const unvisited = [...nodeSet].filter((id) => !nodeOrder.includes(id));
    throw new DagCycleError(unvisited);
  }

  // Group into layers by depth
  const layerMap = new Map<number, string[]>();
  for (const [id, depth] of nodeDepths) {
    if (!layerMap.has(depth)) layerMap.set(depth, []);
    layerMap.get(depth)!.push(id);
  }

  const layers: DagLayer[] = [...layerMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, nodeIds]) => ({ level, nodeIds }));

  return { layers, nodeOrder, nodeDepths, adjacency, reverseAdj };
}

/**
 * Extract the subgraph reachable from the given node IDs (including ancestors).
 * Used for sub-graph execution: selected nodes + all upstream dependencies.
 */
export function collectSubgraph(
  selectedIds: Set<string>,
  nodes: SerializedNode[],
  edges: SerializedEdge[]
): Set<string> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const reverseAdj = new Map<string, string[]>();
  for (const n of nodes) reverseAdj.set(n.id, []);
  for (const e of edges) {
    if (reverseAdj.has(e.targetNodeId)) {
      reverseAdj.get(e.targetNodeId)!.push(e.sourceNodeId);
    }
  }

  const result = new Set<string>();
  const stack = [...selectedIds];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    if (!nodeMap.has(id)) continue;
    result.add(id);
    for (const parent of reverseAdj.get(id) ?? []) {
      if (!result.has(parent)) stack.push(parent);
    }
  }

  return result;
}
