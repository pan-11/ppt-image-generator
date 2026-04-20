import { describe, expect, it } from "vitest";
import { QueueScheduler } from "../src/services/queue-scheduler.js";

describe("QueueScheduler", () => {
  it("runs at most five tasks at a time and auto-fills the next slot from a 50-task batch", async () => {
    const runningSnapshots: number[] = [];
    let active = 0;

    const scheduler = new QueueScheduler({
      maxConcurrency: 5,
      runTask: async () => {
        active += 1;
        runningSnapshots.push(active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { outcome: "completed" as const };
      }
    });

    for (let index = 0; index < 50; index += 1) {
      scheduler.enqueue(`task-${index}`);
    }

    await scheduler.onIdle();

    expect(Math.max(...runningSnapshots)).toBe(5);
    expect(scheduler.stats()).toEqual({
      queued: 0,
      running: 0,
      completed: 50,
      failed: 0,
      paused: false
    });
  });
});
