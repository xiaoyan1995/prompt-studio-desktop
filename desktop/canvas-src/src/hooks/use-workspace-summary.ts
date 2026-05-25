"use client";

import { useEffect, useState } from "react";

type WorkspaceSummary = {
  recentProjects: Array<{
    id: string;
    name: string;
    thumbnail: string | null;
    is_favorited: boolean;
    updated_at: string;
  }>;
  templateCards: Array<{
    id: string;
    title: string;
    description: string;
    cover: string | null;
  }>;
  recommendationCards: Array<{
    id: string;
    title: string;
    href: string;
    tag: string;
  }>;
};

export function useWorkspaceSummary() {
  const [data, setData] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/workspace/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (mounted) setData(d);
      })
      .catch((err) => {
        if (mounted) setError(err.message ?? "Failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetch("/api/workspace/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  const refetch = () => {
    fetch("/api/workspace/summary")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => { /* silent */ });
  };

  return { data, loading, error, retry, refetch };
}
