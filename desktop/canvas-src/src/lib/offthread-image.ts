let worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./image-worker.ts", import.meta.url));
    worker.onmessage = (e) => {
      const { id, type, buffer } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);

      if (type === "composite-result") {
        const uint8 = new Uint8Array(buffer as ArrayBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        entry.resolve(`data:image/jpeg;base64,${btoa(binary)}`);
      } else if (type === "crop-result") {
        entry.resolve(new Blob([buffer as ArrayBuffer], { type: "image/png" }));
      }
    };
    worker.onerror = (err) => {
      for (const [, entry] of pending) entry.reject(new Error(err.message));
      pending.clear();
    };
  }
  return worker;
}

function nextId(): string {
  return crypto.randomUUID();
}

interface StrokeData {
  tool: "brush" | "rect" | "eraser";
  brushSize: number;
  points?: { x: number; y: number }[];
  rect?: { x: number; y: number; w: number; h: number };
}

export async function compositeInWorker(
  source: ImageBitmap,
  strokes: StrokeData[],
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
): Promise<string> {
  const w = getWorker();
  const id = nextId();
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(
      { id, type: "composite", bitmap: source, strokes, imgW, imgH, canvasW, canvasH },
      [source],
    );
  });
}

export async function cropInWorker(
  source: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Promise<Blob> {
  const w = getWorker();
  const id = nextId();
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: "crop", bitmap: source, sx, sy, sw, sh }, [source]);
  });
}

export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { credentials: "same-origin" });
  const blob = await res.blob();
  return createImageBitmap(blob);
}

export async function preloadImageOffThread(url: string): Promise<void> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    bmp.close();
  } catch {
    // Ignore preload failures
  }
}
