import type { NodeType } from "@/types/canvas";
import type { NodePlugin } from "./plugin-types";

const registry = new Map<NodeType, NodePlugin>();

export function registerPlugin(plugin: NodePlugin) {
  const types = Array.isArray(plugin.type) ? plugin.type : [plugin.type];
  for (const t of types) registry.set(t, plugin);
}

export function getPlugin(type: NodeType): NodePlugin | undefined {
  return registry.get(type);
}
