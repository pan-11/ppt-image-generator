import { describe, expect, it, vi } from "vitest";
import { ProviderJobScheduler } from "../src/services/provider-job-scheduler.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ProviderJobScheduler", () => {
  it("shares one lane across roles and starts other providers without head-of-line blocking", async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const lanes: Record<string, { providerId: string; maxConcurrency: number }> = {
      "a-text-1": { providerId: "provider-a", maxConcurrency: 2 },
      "a-image-1": { providerId: "provider-a", maxConcurrency: 2 },
      "a-text-2": { providerId: "provider-a", maxConcurrency: 2 },
      "b-text-1": { providerId: "provider-b", maxConcurrency: 1 },
      "b-text-2": { providerId: "provider-b", maxConcurrency: 1 }
    };
    const scheduler = new ProviderJobScheduler({
      resolveLane: (jobId) => lanes[jobId],
      runJob: async (jobId) => {
        started.push(jobId);
        const gate = deferred();
        gates.set(jobId, gate);
        await gate.promise;
        return { outcome: "completed" as const };
      }
    });

    Object.keys(lanes).forEach((jobId) => scheduler.enqueue(jobId));
    await vi.waitFor(() => expect(started).toHaveLength(3));

    expect(started).toEqual(expect.arrayContaining(["a-text-1", "a-image-1", "b-text-1"]));
    expect(started).not.toContain("a-text-2");
    expect(started).not.toContain("b-text-2");
    expect(scheduler.stats()).toMatchObject({ queued: 2, running: 3 });

    gates.forEach((gate) => gate.resolve());
    await vi.waitFor(() => expect(started).toHaveLength(5));
    gates.forEach((gate) => gate.resolve());
    await scheduler.onIdle();
    expect(scheduler.stats()).toMatchObject({ queued: 0, running: 0, completed: 5 });
  });

  it("resolves a queued job lane only when it is about to start", async () => {
    let providerId = "provider-a";
    const seen: string[] = [];
    const scheduler = new ProviderJobScheduler({
      resolveLane: () => ({ providerId, maxConcurrency: 1 }),
      runJob: async (_jobId, lane) => {
        seen.push(lane.providerId);
        return { outcome: "completed" as const };
      }
    });

    scheduler.pause();
    scheduler.enqueue("queued-job");
    providerId = "provider-b";
    scheduler.resume();
    await scheduler.onIdle();

    expect(seen).toEqual(["provider-b"]);
  });

  it("pauses only new starts and keeps failed outcome counts", async () => {
    const firstGate = deferred();
    const started: string[] = [];
    const scheduler = new ProviderJobScheduler({
      resolveLane: () => ({ providerId: "provider-a", maxConcurrency: 1 }),
      runJob: async (jobId) => {
        started.push(jobId);
        if (jobId === "first") {
          await firstGate.promise;
          return { outcome: "completed" as const };
        }
        return { outcome: "failed" as const };
      }
    });

    scheduler.enqueue("first");
    scheduler.enqueue("second");
    await vi.waitFor(() => expect(started).toEqual(["first"]));
    scheduler.pause();
    firstGate.resolve();
    await vi.waitFor(() => expect(scheduler.stats().running).toBe(0));
    expect(started).toEqual(["first"]);

    scheduler.resume();
    await scheduler.onIdle();
    expect(started).toEqual(["first", "second"]);
    expect(scheduler.stats()).toMatchObject({ completed: 1, failed: 1, paused: false });
  });
});
