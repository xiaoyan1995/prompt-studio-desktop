import type { SerializedCanvas, SerializedNode, SerializedEdge } from "@/types/canvas";

export interface CanvasPatch {
  nodes?: {
    put?: SerializedNode[];
    remove?: string[];
  };
  edges?: {
    put?: SerializedEdge[];
    remove?: string[];
  };
  viewport?: { x: number; y: number; zoom: number };
}

function nodeEqual(a: SerializedNode, b: SerializedNode): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.label === b.label &&
    a.type === b.type &&
    JSON.stringify(a.data) === JSON.stringify(b.data)
  );
}

function edgeEqual(a: SerializedEdge, b: SerializedEdge): boolean {
  return (
    a.sourceNodeId === b.sourceNodeId &&
    a.sourcePortId === b.sourcePortId &&
    a.targetNodeId === b.targetNodeId &&
    a.targetPortId === b.targetPortId
  );
}

/**
 * Compute a minimal patch between two canvas states.
 * Returns null if full save would be more efficient.
 */
export function computeCanvasPatch(
  prev: SerializedCanvas,
  next: SerializedCanvas,
): CanvasPatch | null {
  const prevNodesById = new Map(prev.nodes.map((n) => [n.id, n]));
  const nextNodesById = new Map(next.nodes.map((n) => [n.id, n]));

  const nodePut: SerializedNode[] = [];
  const nodeRemove: string[] = [];

  for (const [id, node] of nextNodesById) {
    const old = prevNodesById.get(id);
    if (!old || !nodeEqual(old, node)) {
      nodePut.push(node);
    }
  }
  for (const id of prevNodesById.keys()) {
    if (!nextNodesById.has(id)) {
      nodeRemove.push(id);
    }
  }

  const prevEdgesById = new Map(prev.edges.map((e) => [e.id, e]));
  const nextEdgesById = new Map(next.edges.map((e) => [e.id, e]));

  const edgePut: SerializedEdge[] = [];
  const edgeRemove: string[] = [];

  for (const [id, edge] of nextEdgesById) {
    const old = prevEdgesById.get(id);
    if (!old || !edgeEqual(old, edge)) {
      edgePut.push(edge);
    }
  }
  for (const id of prevEdgesById.keys()) {
    if (!nextEdgesById.has(id)) {
      edgeRemove.push(id);
    }
  }

  const totalChanges = nodePut.length + nodeRemove.length + edgePut.length + edgeRemove.length;

  if (totalChanges === 0) {
    const vpChanged =
      prev.viewport.x !== next.viewport.x ||
      prev.viewport.y !== next.viewport.y ||
      prev.viewport.zoom !== next.viewport.zoom;
    if (!vpChanged) return null;
    return { viewport: next.viewport };
  }

  const totalItems = next.nodes.length + next.edges.length;
  if (totalChanges > totalItems * 0.6) {
    return null;
  }

  const patch: CanvasPatch = {};

  if (nodePut.length > 0 || nodeRemove.length > 0) {
    patch.nodes = {};
    if (nodePut.length > 0) patch.nodes.put = nodePut;
    if (nodeRemove.length > 0) patch.nodes.remove = nodeRemove;
  }

  if (edgePut.length > 0 || edgeRemove.length > 0) {
    patch.edges = {};
    if (edgePut.length > 0) patch.edges.put = edgePut;
    if (edgeRemove.length > 0) patch.edges.remove = edgeRemove;
  }

  patch.viewport = next.viewport;
  return patch;
}

/**
 * Apply a patch to a canvas state, returning the new state.
 */
export function applyCanvasPatch(
  base: SerializedCanvas,
  patch: CanvasPatch,
): SerializedCanvas {
  let nodes = [...base.nodes];
  let edges = [...base.edges];

  if (patch.nodes) {
    if (patch.nodes.remove?.length) {
      const removeSet = new Set(patch.nodes.remove);
      nodes = nodes.filter((n) => !removeSet.has(n.id));
    }
    if (patch.nodes.put?.length) {
      const putById = new Map(patch.nodes.put.map((n) => [n.id, n]));
      nodes = nodes.map((n) => putById.get(n.id) ?? n);
      const existingIds = new Set(nodes.map((n) => n.id));
      for (const n of patch.nodes.put) {
        if (!existingIds.has(n.id)) nodes.push(n);
      }
    }
  }

  if (patch.edges) {
    if (patch.edges.remove?.length) {
      const removeSet = new Set(patch.edges.remove);
      edges = edges.filter((e) => !removeSet.has(e.id));
    }
    if (patch.edges.put?.length) {
      const putById = new Map(patch.edges.put.map((e) => [e.id, e]));
      edges = edges.map((e) => putById.get(e.id) ?? e);
      const existingIds = new Set(edges.map((e) => e.id));
      for (const e of patch.edges.put) {
        if (!existingIds.has(e.id)) edges.push(e);
      }
    }
  }

  return {
    nodes,
    edges,
    viewport: patch.viewport ?? base.viewport,
  };
}
