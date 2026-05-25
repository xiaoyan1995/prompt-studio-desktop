"use client";

import { useMemo } from "react";
import { useStore } from "@xyflow/react";
import type { CanvasNode } from "@/types/canvas";

const SNAP_THRESHOLD = 5; // pixels in flow coords

interface GuideLine {
  orientation: "h" | "v";
  pos: number; // flow coordinate
}

const isDraggingSelector = (s: { nodes: { dragging?: boolean }[] }) =>
  s.nodes.some((n) => n.dragging);

/**
 * Renders alignment guide lines when nodes are being dragged.
 * Detects center-to-center, edge-to-edge alignment between dragged nodes and stationary nodes.
 */
export function AlignmentGuides() {
  const isDragging = useStore(isDraggingSelector as any);
  const nodes = useStore((s) => s.nodes) as CanvasNode[];
  const transform = useStore((s) => s.transform);

  const draggingNodes = useMemo(() => isDragging ? nodes.filter((n) => n.dragging) : [], [nodes, isDragging]);
  const staticNodes = useMemo(() => isDragging ? nodes.filter((n) => !n.dragging && !n.selected) : [], [nodes, isDragging]);

  const guides = useMemo<GuideLine[]>(() => {
    if (draggingNodes.length === 0 || staticNodes.length === 0) return [];

    const lines: GuideLine[] = [];
    const seen = new Set<string>();

    for (const drag of draggingNodes) {
      const dw = (drag.measured?.width ?? drag.width ?? 280);
      const dh = (drag.measured?.height ?? drag.height ?? 200);
      const dCx = drag.position.x + dw / 2;
      const dCy = drag.position.y + dh / 2;
      const dLeft = drag.position.x;
      const dRight = drag.position.x + dw;
      const dTop = drag.position.y;
      const dBottom = drag.position.y + dh;

      for (const stat of staticNodes) {
        const sw = (stat.measured?.width ?? stat.width ?? 280);
        const sh = (stat.measured?.height ?? stat.height ?? 200);
        const sCx = stat.position.x + sw / 2;
        const sCy = stat.position.y + sh / 2;
        const sLeft = stat.position.x;
        const sRight = stat.position.x + sw;
        const sTop = stat.position.y;
        const sBottom = stat.position.y + sh;

        // Vertical guides (x alignment)
        const vChecks = [
          { a: dCx, b: sCx },   // center-center
          { a: dLeft, b: sLeft }, // left-left
          { a: dRight, b: sRight }, // right-right
          { a: dLeft, b: sRight }, // left-right
          { a: dRight, b: sLeft }, // right-left
        ];
        for (const { a, b } of vChecks) {
          if (Math.abs(a - b) < SNAP_THRESHOLD) {
            const key = `v:${Math.round(b)}`;
            if (!seen.has(key)) {
              seen.add(key);
              lines.push({ orientation: "v", pos: b });
            }
          }
        }

        // Horizontal guides (y alignment)
        const hChecks = [
          { a: dCy, b: sCy },   // center-center
          { a: dTop, b: sTop },  // top-top
          { a: dBottom, b: sBottom }, // bottom-bottom
          { a: dTop, b: sBottom }, // top-bottom
          { a: dBottom, b: sTop }, // bottom-top
        ];
        for (const { a, b } of hChecks) {
          if (Math.abs(a - b) < SNAP_THRESHOLD) {
            const key = `h:${Math.round(b)}`;
            if (!seen.has(key)) {
              seen.add(key);
              lines.push({ orientation: "h", pos: b });
            }
          }
        }
      }
    }

    return lines;
  }, [draggingNodes, staticNodes]);

  if (guides.length === 0) return null;

  const [tx, ty, zoom] = transform;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[100]"
      style={{ width: "100%", height: "100%" }}
    >
      {guides.map((g, i) =>
        g.orientation === "v" ? (
          <line
            key={`v-${i}`}
            x1={g.pos * zoom + tx}
            y1={0}
            x2={g.pos * zoom + tx}
            y2="100%"
            stroke="rgba(192,192,192,0.5)"
            strokeWidth={0.5}
            strokeDasharray="4 4"
          />
        ) : (
          <line
            key={`h-${i}`}
            x1={0}
            y1={g.pos * zoom + ty}
            x2="100%"
            y2={g.pos * zoom + ty}
            stroke="rgba(192,192,192,0.5)"
            strokeWidth={0.5}
            strokeDasharray="4 4"
          />
        )
      )}
    </svg>
  );
}

