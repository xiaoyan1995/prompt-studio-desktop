"use client";

import { memo } from "react";
import { useStore } from "@xyflow/react";

const selector = (s: { transform: [number, number, number] }) => s.transform;

/**
 * CSS-only dots background — much faster than React Flow's SVG <Background>.
 * Uses a radial-gradient pattern tiled via background-size, repositioned
 * by the viewport transform. All compositing is GPU-accelerated.
 */
function CssDotsBackgroundComponent({
  gap = 20,
  size = 1.2,
  color = "rgba(255,255,255,0.12)",
}: {
  gap?: number;
  size?: number;
  color?: string;
}) {
  const [tx, ty, zoom] = useStore(selector);
  const scaledGap = gap * zoom;

  return (
    <div
      className="react-flow__background"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: `radial-gradient(circle, ${color} ${size * zoom}px, transparent ${size * zoom}px)`,
        backgroundSize: `${scaledGap}px ${scaledGap}px`,
        backgroundPosition: `${tx % scaledGap}px ${ty % scaledGap}px`,
      }}
    />
  );
}

export const CssDotsBackground = memo(CssDotsBackgroundComponent);
