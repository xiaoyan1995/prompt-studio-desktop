import { create } from "zustand";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELED";

export interface GenerationJob {
  id: string;
  modelId: string;
  status: JobStatus;
  progress?: string;
  priceXins: number;
  count: number;
  assets?: Array<{
    url: string;
    width: number;
    height: number;
    format: string;
    sequence: number;
  }>;
  error?: string;
  failedCount?: number;
  refundAmount?: number;
  createdAt: string;
}

interface GenerationStore {
  jobs: Map<string, GenerationJob>;
  activeJobId: string | null;

  addJob: (job: GenerationJob) => void;
  updateJob: (id: string, updates: Partial<GenerationJob>) => void;
  removeJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  getJob: (id: string) => GenerationJob | undefined;

  subscribeToJob: (jobId: string) => void;
  unsubscribeFromJob: (jobId: string) => void;
}

const eventSources = new Map<string, EventSource>();

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  jobs: new Map(),
  activeJobId: null,

  addJob: (job) =>
    set((s) => {
      const jobs = new Map(s.jobs);
      jobs.set(job.id, job);
      return { jobs };
    }),

  updateJob: (id, updates) =>
    set((s) => {
      const jobs = new Map(s.jobs);
      const existing = jobs.get(id);
      if (existing) jobs.set(id, { ...existing, ...updates });
      return { jobs };
    }),

  removeJob: (id) =>
    set((s) => {
      const jobs = new Map(s.jobs);
      jobs.delete(id);
      return { jobs };
    }),

  setActiveJob: (id) => set({ activeJobId: id }),

  getJob: (id) => get().jobs.get(id),

  subscribeToJob: (jobId) => {
    if (eventSources.has(jobId)) return;

    const es = new EventSource(`/api/jobs/${jobId}/sse`);
    eventSources.set(jobId, es);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const rawStatus = data.status as string;
        const status =
          rawStatus === "CANCELLED" ? "CANCELED" : (rawStatus as JobStatus);
        get().updateJob(jobId, {
          status,
          progress: data.progress,
          assets: data.assets,
          error: data.error,
          failedCount: data.failedCount,
          refundAmount: data.refundAmount,
        });

        if (["SUCCEEDED", "FAILED", "PARTIAL_SUCCESS", "CANCELED"].includes(status)) {
          es.close();
          eventSources.delete(jobId);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      es.close();
      eventSources.delete(jobId);
    };
  },

  unsubscribeFromJob: (jobId) => {
    const es = eventSources.get(jobId);
    if (es) {
      es.close();
      eventSources.delete(jobId);
    }
  },
}));
