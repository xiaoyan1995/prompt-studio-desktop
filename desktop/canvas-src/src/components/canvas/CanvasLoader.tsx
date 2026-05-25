"use client";

export function CanvasLoader({ progress }: { progress: number }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0c0c0c] flex flex-col items-center justify-center gap-6">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-2 border-zinc-800 rounded-full" />
        <div
          className="absolute inset-0 border-2 border-t-[#CCFF00] rounded-full animate-spin"
          style={{ animationDuration: "0.8s" }}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#CCFF00] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-xs text-zinc-500">
          {Math.round(progress * 100)}%
        </span>
      </div>
    </div>
  );
}
