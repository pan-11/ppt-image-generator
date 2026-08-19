import { useEffect, useState } from "react";
import { fetchActiveBatch, pauseBatch, resumeBatch } from "../lib/api";
import type { ActiveBatchResponse } from "../lib/types";

export function useActiveBatch(batchId: string | null) {
  const [data, setData] = useState<ActiveBatchResponse | null>(null);

  const refresh = async (targetBatchId = batchId) => {
    if (!targetBatchId) {
      setData(null);
      return null;
    }

    const next = await fetchActiveBatch(targetBatchId);
    setData(next);
    return next;
  };

  useEffect(() => {
    if (!batchId) {
      setData(null);
      return;
    }

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await refresh(batchId);
        if (!active || !next) {
          return;
        }

        const hasUnsettledTasks = next.tasks.some((task) => !["completed", "failed"].includes(task.status));
        const schedulerIsSettling = next.scheduler.queued > 0 || next.scheduler.running > 0;
        if (next.batch.status !== "completed" || hasUnsettledTasks || schedulerIsSettling) {
          timer = window.setTimeout(poll, 2000);
        }
      } catch {
        if (active) {
          timer = window.setTimeout(poll, 3000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [batchId]);

  return {
    activeBatch: data,
    refresh,
    async pause() {
      if (!batchId) {
        return;
      }
      await pauseBatch(batchId);
      setData((current) => current ? { ...current, scheduler: { ...current.scheduler, paused: true } } : current);
    },
    async resume() {
      if (!batchId) {
        return;
      }
      await resumeBatch(batchId);
      setData((current) => current ? { ...current, scheduler: { ...current.scheduler, paused: false } } : current);
    }
  };
}
