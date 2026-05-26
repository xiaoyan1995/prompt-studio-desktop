export interface AnnotationStroke {
  id: string;
  tool: "pen" | "circle" | "arrow" | "rect" | "text";
  color: string;
  width: number;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  pos?: { x: number; y: number };
  text?: string;
  fontSize?: number;
}

function svgPathFromPoints(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function StrokeSVG({ stroke, opacity }: { stroke: AnnotationStroke; opacity?: number }) {
  const style: React.CSSProperties = { opacity: opacity ?? 0.7 };

  if (stroke.tool === "pen" && stroke.points) {
    return (
      <path
        d={svgPathFromPoints(stroke.points)}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
      />
    );
  }

  if (!stroke.start || !stroke.end) return null;
  const { start: s, end: e } = stroke;

  if (stroke.tool === "rect") {
    const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
    return <rect x={x} y={y} width={w} height={h} stroke={stroke.color} strokeWidth={stroke.width} fill="none" rx={2} style={style} />;
  }

  if (stroke.tool === "circle") {
    const cx = (s.x + e.x) / 2, cy = (s.y + e.y) / 2;
    const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke.color} strokeWidth={stroke.width} fill="none" style={style} />;
  }

  if (stroke.tool === "arrow") {
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const headLen = 10 + stroke.width * 2;
    const p1x = e.x - headLen * Math.cos(angle - 0.4);
    const p1y = e.y - headLen * Math.sin(angle - 0.4);
    const p2x = e.x - headLen * Math.cos(angle + 0.4);
    const p2y = e.y - headLen * Math.sin(angle + 0.4);
    return (
      <g style={style}>
        <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
        <polyline points={`${p1x},${p1y} ${e.x},${e.y} ${p2x},${p2y}`} stroke={stroke.color} strokeWidth={stroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  if (stroke.tool === "text" && stroke.pos && stroke.text) {
    return (
      <text
        x={stroke.pos.x}
        y={stroke.pos.y}
        fill={stroke.color}
        fontSize={stroke.fontSize ?? 44}
        fontFamily="system-ui,-apple-system,sans-serif"
        fontWeight="700"
        style={style}
      >
        {stroke.text}
      </text>
    );
  }

  return null;
}

export function AnnotationOverlay({ annotations, className }: { annotations: AnnotationStroke[]; className?: string }) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <svg className={className ?? "absolute inset-0 w-full h-full pointer-events-none"} viewBox="0 0 1000 1000" preserveAspectRatio="none">
      {annotations.map((s) => <StrokeSVG key={s.id} stroke={s} />)}
    </svg>
  );
}
