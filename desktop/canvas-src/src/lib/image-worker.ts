const PAINT_COLOR = "rgba(255, 80, 80, 0.45)";

interface StrokeData {
  tool: "brush" | "rect" | "eraser";
  brushSize: number;
  points?: { x: number; y: number }[];
  rect?: { x: number; y: number; w: number; h: number };
}

type WorkerRequest =
  | {
      id: string;
      type: "composite";
      bitmap: ImageBitmap;
      strokes: StrokeData[];
      imgW: number;
      imgH: number;
      canvasW: number;
      canvasH: number;
    }
  | {
      id: string;
      type: "crop";
      bitmap: ImageBitmap;
      sx: number;
      sy: number;
      sw: number;
      sh: number;
    };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === "composite") {
    const { bitmap, strokes, imgW, imgH, canvasW, canvasH } = msg;
    const canvas = new OffscreenCanvas(imgW, imgH);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const scaleX = imgW / canvasW;
    const scaleY = imgH / canvasH;

    for (const s of strokes) {
      if (!s) continue;
      ctx.save();
      if (s.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = PAINT_COLOR;
        ctx.strokeStyle = PAINT_COLOR;
      }
      if (s.tool === "rect" && s.rect) {
        ctx.fillRect(
          s.rect.x * scaleX,
          s.rect.y * scaleY,
          s.rect.w * scaleX,
          s.rect.h * scaleY,
        );
      } else if (s.points && s.points.length > 0) {
        ctx.lineWidth = s.brushSize * scaleX;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(s.points[0].x * scaleX, s.points[0].y * scaleY);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x * scaleX, s.points[i].y * scaleY);
        }
        ctx.stroke();
        if (s.points.length === 1) {
          ctx.beginPath();
          ctx.arc(
            s.points[0].x * scaleX,
            s.points[0].y * scaleY,
            (s.brushSize * scaleX) / 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.restore();
    }

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const buffer = await blob.arrayBuffer();
    self.postMessage({ id: msg.id, type: "composite-result", buffer }, { transfer: [buffer] });
  }

  if (msg.type === "crop") {
    const { bitmap, sx, sy, sw, sh } = msg;
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await blob.arrayBuffer();
    self.postMessage({ id: msg.id, type: "crop-result", buffer }, { transfer: [buffer] });
  }
};
