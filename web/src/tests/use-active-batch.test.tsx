import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActiveBatch } from "../hooks/use-active-batch";
import { fetchActiveBatch } from "../lib/api";
import type { ActiveBatchResponse } from "../lib/types";

vi.mock("../lib/api", () => ({
  fetchActiveBatch: vi.fn(),
  pauseBatch: vi.fn(),
  resumeBatch: vi.fn()
}));

const settledBatch: ActiveBatchResponse = {
  batch: {
    id: "batch-1",
    name: "Settled batch",
    status: "completed",
    total_tasks: 1,
    success_count: 1,
    failed_count: 0,
    created_at: "2026-08-18T12:00:00.000Z"
  },
  tasks: [
    {
      id: "task-1",
      batch_id: "batch-1",
      prompt: "settled prompt",
      model: "gpt-image-2",
      size: "16:9",
      n: 1,
      status: "completed"
    }
  ],
  images: [],
  scheduler: {
    queued: 0,
    running: 1,
    completed: 1,
    failed: 0,
    paused: false
  }
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useActiveBatch", () => {
  it("polls once more while the scheduler is still settling", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchActiveBatch)
      .mockResolvedValueOnce(settledBatch)
      .mockResolvedValueOnce({
        ...settledBatch,
        scheduler: { ...settledBatch.scheduler, running: 0 }
      });

    const { result } = renderHook(() => useActiveBatch("batch-1"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchActiveBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchActiveBatch).toHaveBeenCalledTimes(2);
    expect(result.current.activeBatch?.scheduler.running).toBe(0);
  });
});
