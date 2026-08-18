import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActiveBatch } from "../hooks/use-active-batch";
import { retryTasks } from "../lib/api";
import type { ActiveBatchResponse } from "../lib/types";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

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
  jobs: [],
  images: [],
  scheduler: {
    queued: 0,
    running: 1,
    completed: 1,
    failed: 0,
    unknown: 0,
    paused: false
  }
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useActiveBatch", () => {
  it("polls once more while the scheduler is still settling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(settledBatch))
      .mockResolvedValueOnce(jsonResponse({
        ...settledBatch,
        scheduler: { ...settledBatch.scheduler, running: 0 }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useActiveBatch("batch-1"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.activeBatch?.scheduler.running).toBe(0);
  });

  it("confirms duplicate-charge risk and retries an unknown job once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: "UNKNOWN_CHARGE_RISK",
        message: "该请求状态未知，中转站可能已经扣费。仍要重新生成吗？"
      }, 409))
      .mockResolvedValueOnce(jsonResponse({ retriedJobs: 1, affectedTasks: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await expect(retryTasks(["task-1"])).resolves.toEqual({ retriedJobs: 1, affectedTasks: 1 });

    expect(confirm).toHaveBeenCalledWith("该请求状态未知，中转站可能已经扣费。仍要重新生成吗？");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      taskIds: ["task-1"],
      confirmUnknown: true
    });
  });

  it("does not resubmit an unknown job when confirmation is cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      code: "UNKNOWN_CHARGE_RISK",
      message: "该请求状态未知，中转站可能已经扣费。仍要重新生成吗？"
    }, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await expect(retryTasks(["task-1"])).resolves.toEqual({ retriedJobs: 0, affectedTasks: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
