"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 60_000; // 60 seconds
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newBuildId, setNewBuildId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (buildId && buildId !== "dev" && buildId !== CLIENT_BUILD_ID) {
          setUpdateAvailable(true);
          setNewBuildId(buildId);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch {
        /* network error, skip */
      }
    }

    // Delay first check to avoid hitting the API on initial page load
    const initialDelay = setTimeout(() => {
      if (!checkedRef.current) {
        checkedRef.current = true;
        check();
      }
      timerRef.current = setInterval(check, POLL_INTERVAL);
    }, 10_000);

    return () => {
      clearTimeout(initialDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { updateAvailable, newBuildId };
}
