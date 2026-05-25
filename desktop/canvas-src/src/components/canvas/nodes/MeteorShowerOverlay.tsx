"use client";

import { memo, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * Firefly-style generating overlay for nodes in "running" or "queued" state.
 * Based on FireflyLoader from v2: glowing dots that pulse across the node
 * surface + centered breathing "生成中" label + dark semi-transparent backdrop.
 */

function pseudoRandom(seed: number) {
  const v = Math.sin(seed) * 10000;
  return v - Math.floor(v);
}

const FIREFLIES = Array.from({ length: 16 }, (_, i) => {
  const s = i + 1;
  return {
    left: `${pseudoRandom(s) * 80 + 10}%`,
    top: `${pseudoRandom(s + 3.14) * 80 + 10}%`,
    dur: `${1.5 + pseudoRandom(s + 7.77) * 2}s`,
    delay: `${pseudoRandom(s + 11.31) * 2}s`,
  };
});

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

function MeteorShowerOverlayComponent({ startTime, label }: { startTime?: number; label?: string }) {
  const t = useTranslations("canvas");
  const mountTime = useRef(startTime ?? Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - mountTime.current) / 1000));
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - mountTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center bg-black/70 backdrop-blur-[2px]"
      style={{ borderRadius: 12, zIndex: 5 }}
      aria-hidden="true"
    >

      {/* Glowing fireflies */}
      {FIREFLIES.map((f, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            left: f.left,
            top: f.top,
            backgroundColor: "#CCFF00",
            boxShadow: "0 0 6px 1px rgba(204,255,0,0.6)",
            animation: `xinyu-firefly ${f.dur} ${f.delay} ease-in-out infinite`,
          }}
        />
      ))}

      {/* Centered label + timer */}
      <div className="flex flex-col items-center gap-1">
        <span
          className="xinyu-meteor-text text-xs font-mono tracking-widest"
          style={{ color: "rgba(204,255,0,0.7)" }}
        >
          {label || t("generating")}
        </span>
        <span
          className="text-[10px] font-mono tabular-nums"
          style={{ color: "rgba(204,255,0,0.5)" }}
        >
          {formatElapsed(elapsed)}
        </span>
      </div>
    </div>
  );
}

export const MeteorShowerOverlay = memo(MeteorShowerOverlayComponent);
