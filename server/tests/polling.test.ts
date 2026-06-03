import { describe, expect, it, vi } from "vitest";
import { pollRemoteImageTask } from "../src/services/polling.js";

describe("pollRemoteImageTask", () => {
  it("keeps polling long-running image tasks beyond the old 90 second window", async () => {
    const getImageTask = vi.fn()
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "completed", result: { data: [{ url: "https://example.com/image.png" }] } });

    const result = await pollRemoteImageTask("remote-task-1", getImageTask, {
      maxAttempts: 3,
      intervalMs: 0
    });

    expect(result.status).toBe("completed");
    expect(getImageTask).toHaveBeenCalledTimes(3);
  });

  it("throws a timeout only after the configured polling window is exhausted", async () => {
    const getImageTask = vi.fn().mockResolvedValue({ status: "in_progress" });

    await expect(pollRemoteImageTask("remote-task-1", getImageTask, {
      maxAttempts: 2,
      intervalMs: 0
    })).rejects.toThrow("任务轮询超时");

    expect(getImageTask).toHaveBeenCalledTimes(2);
  });
});
