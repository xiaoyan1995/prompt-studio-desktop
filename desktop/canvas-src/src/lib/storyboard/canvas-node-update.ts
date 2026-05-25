import { db } from "@/lib/db";
import type { SerializedCanvas, SerializedNode } from "@/types/canvas";
import type {
  ShotRow,
  StoryboardParseStatus,
  StoryboardSourceSummary,
} from "@/types/storyboard";

export interface MergeStoryboardNodeParams {
  projectId: string;
  userId: string;
  nodeId: string;
  /** 不传则保留画布上该节点已有 rows */
  rows?: ShotRow[];
  parseStatus: StoryboardParseStatus;
  errorMessage?: string;
  parseJobId?: string | null;
  sourceSummary?: StoryboardSourceSummary;
}

const MAX_RETRIES = 4;

/**
 * 将分镜解析结果写入 Project.canvas_data 中对应节点（乐观版本号重试）。
 */
export async function mergeStoryboardIntoProjectCanvas(
  params: MergeStoryboardNodeParams,
): Promise<{ version: number }> {
  const {
    projectId,
    userId,
    nodeId,
    rows: rowsParam,
    parseStatus,
    errorMessage,
    parseJobId,
    sourceSummary,
  } = params;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, user_id: userId, deleted_at: null },
          select: { id: true, canvas_data: true, version: true },
        });
        if (!project) {
          throw new Error("PROJECT_NOT_FOUND");
        }

        const canvas = (project.canvas_data ?? {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }) as unknown as SerializedCanvas;

        const nodes = (canvas.nodes ?? []) as SerializedNode[];
        const idx = nodes.findIndex((n) => n.id === nodeId);
        if (idx < 0) {
          throw new Error("NODE_NOT_FOUND");
        }
        if (nodes[idx].type !== "storyboard") {
          throw new Error("NODE_NOT_STORYBOARD");
        }

        const prevData = { ...nodes[idx].data };
        const prevRows = Array.isArray(prevData.rows) ? (prevData.rows as ShotRow[]) : [];
        const rows = rowsParam !== undefined ? rowsParam : prevRows;
        const nextData: Record<string, unknown> = {
          ...prevData,
          rows,
          parseStatus,
          parseJobId: parseJobId === null ? undefined : parseJobId,
          sourceSummary: sourceSummary ?? prevData.sourceSummary,
        };
        if (parseStatus === "failed") {
          nextData.errorMessage = errorMessage ?? "Unknown error";
        } else {
          delete nextData.errorMessage;
        }

        const nextNodes = [...nodes];
        nextNodes[idx] = { ...nodes[idx], data: nextData };

        const nextCanvas: SerializedCanvas = {
          ...canvas,
          nodes: nextNodes,
        };

        const updated = await tx.project.updateMany({
          where: {
            id: projectId,
            user_id: userId,
            deleted_at: null,
            version: project.version,
          },
          data: {
            canvas_data: nextCanvas as object,
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) {
          throw new Error("VERSION_CONFLICT");
        }

        return project.version + 1;
      });

      return { version: result };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (lastError.message === "VERSION_CONFLICT") {
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("mergeStoryboard failed");
}
