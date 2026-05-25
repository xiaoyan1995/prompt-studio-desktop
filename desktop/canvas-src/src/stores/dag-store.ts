import { create } from "zustand";

type NodeDagStatus = "PENDING" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELED";

interface DagRun {
  runId: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELED";
  currentLayer: number;
  totalLayers: number;
  totalPrice: number;
  nodeStatus: Record<string, NodeDagStatus>;
  nodeJobMap: Record<string, string>;
}

interface DagStore {
  currentRun: DagRun | null;
  isExecuting: boolean;
  error: string | null;

  startRun: (projectId: string, selectedNodeIds?: string[]) => Promise<void>;
  cancelRun: () => Promise<void>;
  pollStatus: () => Promise<void>;
  clearRun: () => void;
  getNodeStatus: (nodeId: string) => NodeDagStatus | null;
}

export const useDagStore = create<DagStore>((set, get) => ({
  currentRun: null,
  isExecuting: false,
  error: null,

  startRun: async (projectId, selectedNodeIds) => {
    set({ isExecuting: true, error: null });
    try {
      const body: any = { project_id: projectId };
      if (selectedNodeIds && selectedNodeIds.length > 0) {
        body.selected_node_ids = selectedNodeIds;
      }

      const res = await fetch("/api/dag/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          // Validation errors
          const msgs = data.errors.map((e: any) => e.message).join("; ");
          set({ error: msgs, isExecuting: false });
          return;
        }
        set({ error: data.error?.message ?? "执行失败", isExecuting: false });
        return;
      }

      set({
        currentRun: {
          runId: data.run_id,
          status: "RUNNING",
          currentLayer: 0,
          totalLayers: data.layers,
          totalPrice: data.total_price,
          nodeStatus: {},
          nodeJobMap: {},
        },
      });

      // Start polling
      get().pollStatus();
    } catch {
      set({ error: "网络错误", isExecuting: false });
    }
  },

  cancelRun: async () => {
    const run = get().currentRun;
    if (!run) return;

    try {
      await fetch(`/api/dag/${run.runId}/cancel`, { method: "POST" });
      set((s) => ({
        currentRun: s.currentRun ? { ...s.currentRun, status: "CANCELED" } : null,
        isExecuting: false,
      }));
    } catch {
      // ignore
    }
  },

  pollStatus: async () => {
    const run = get().currentRun;
    if (!run) return;

    const poll = async () => {
      const current = get().currentRun;
      if (!current || current.status !== "RUNNING") return;

      try {
        const res = await fetch(`/api/dag/${current.runId}`);
        if (!res.ok) return;
        const data = await res.json();

        set({
          currentRun: {
            runId: data.run_id,
            status: data.status,
            currentLayer: data.current_layer,
            totalLayers: data.total_layers,
            totalPrice: data.total_price,
            nodeStatus: data.node_status ?? {},
            nodeJobMap: data.node_job_map ?? {},
          },
          isExecuting: data.status === "RUNNING",
        });

        if (data.status === "RUNNING") {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 1000);
  },

  clearRun: () => set({ currentRun: null, isExecuting: false, error: null }),

  getNodeStatus: (nodeId) => {
    const run = get().currentRun;
    if (!run) return null;
    return run.nodeStatus[nodeId] ?? null;
  },
}));
