import type { SerializedNode, SerializedEdge } from "@/types/canvas";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { isDagGenerationNodeType } from "@/lib/dag/generation-node-types";

export interface DagValidationError {
  nodeId: string;
  portId?: string;
  code: "MISSING_INPUT" | "TYPE_MISMATCH" | "EMPTY_PROMPT" | "NO_MODEL";
  message: string;
}

/**
 * Validate the DAG before execution:
 * - Generation nodes must have a prompt in node.data
 * - Generation nodes must have a model_id in node.data
 * - Required input ports must be connected (image-gen/video-gen ref-in is optional)
 * - Connected ports must have compatible data types
 */
export function validateDag(
  nodes: SerializedNode[],
  edges: SerializedEdge[],
  executionNodeIds: Set<string>
): DagValidationError[] {
  const errors: DagValidationError[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build connection map: targetNodeId:targetPortId → sourceNode
  const incomingConnections = new Map<string, { sourceNode: SerializedNode; sourcePortId: string }>();
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    if (sourceNode) {
      incomingConnections.set(`${edge.targetNodeId}:${edge.targetPortId}`, {
        sourceNode,
        sourcePortId: edge.sourcePortId,
      });
    }
  }

  for (const nodeId of executionNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Only validate nodes that participate in generation billing
    if (!isDagGenerationNodeType(node.type)) continue;

    // Check prompt
    const prompt = node.data?.prompt as string | undefined;
    if (!prompt || prompt.trim().length === 0) {
      errors.push({
        nodeId,
        code: "EMPTY_PROMPT",
        message: `节点"${node.label}"缺少 Prompt`,
      });
    }

    // Check model_id
    const modelId = node.data?.model_id as string | undefined;
    if (!modelId) {
      errors.push({
        nodeId,
        code: "NO_MODEL",
        message: `节点"${node.label}"未选择模型`,
      });
    }

    // Check port type compatibility for connected inputs
    const config = NODE_TYPE_CONFIGS[node.type];
    if (!config) continue;

    for (const port of config.ports) {
      if (port.direction !== "input") continue;

      const connKey = `${nodeId}:${port.id}`;
      const conn = incomingConnections.get(connKey);

      if (!conn) continue; // Optional input not connected — OK

      // Find source port type
      const sourceConfig = NODE_TYPE_CONFIGS[conn.sourceNode.type];
      const sourcePort = sourceConfig?.ports.find((p) => p.id === conn.sourcePortId);

      if (sourcePort && port.dataType !== "any" && sourcePort.dataType !== "any") {
        if (sourcePort.dataType !== port.dataType) {
          errors.push({
            nodeId,
            portId: port.id,
            code: "TYPE_MISMATCH",
            message: `节点"${node.label}"的端口"${port.label}"期望 ${port.dataType}，但连接了 ${sourcePort.dataType}`,
          });
        }
      }
    }
  }

  return errors;
}
