import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchService } from "../src/services/batch-service.js";
import type { ToApisClient } from "../src/services/toapis-client.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function taskInput(prompt = "wide classroom illustration") {
  return {
    prompt,
    model: "gpt-image-2",
    aspectRatio: "16:9",
    resolution: "1K",
    size: "16:9",
    n: 1,
    referenceMode: "none",
    referenceImageId: null
  };
}

function fakeClient(label: string) {
  return {
    uploadReferenceImage: vi.fn().mockResolvedValue(`https://uploads.example.com/${label}.png`),
    createImageTask: vi.fn().mockResolvedValue({
      data: [{ url: `https://images.example.com/${label}.png` }]
    }),
    getImageTask: vi.fn(),
    downloadImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from(`${label}-bytes`),
      mimeType: "image/png"
    })
  } as unknown as ToApisClient;
}

function createHarness() {
  const appDataDir = mkdtempSync(join(tmpdir(), "image-generator-provider-selection-"));
  tempDirs.push(appDataDir);
  const clients: Array<{ apiKey: string; baseUrl?: string; client: ToApisClient }> = [];
  const clientFactory = vi.fn((apiKey: string, baseUrl?: string) => {
    const client = fakeClient(baseUrl ?? "env");
    clients.push({ apiKey, baseUrl, client });
    return client;
  });
  const service = new BatchService({
    envOverrides: { TOAPIS_API_KEY: "env-key", APP_DATA_DIR: appDataDir },
    backgroundProcessing: false,
    clientFactory
  });
  return { service, clientFactory, clients };
}

async function runTask(service: BatchService, taskId: string) {
  const internals = service as unknown as {
    generationJobsRepository: {
      listByTaskId: (id: string) => Array<{ id: string }>;
    };
    runGenerationJob: (id: string) => Promise<{ outcome: "completed" | "failed" }>;
  };
  const [job] = internals.generationJobsRepository.listByTaskId(taskId);
  return internals.runGenerationJob(job.id);
}

describe("batch provider selection", () => {
  it("reports outcome counts for the requested batch instead of scheduler lifetime totals", async () => {
    const { service } = createHarness();

    try {
      const created = service.createBatch({ name: "Current batch counts", tasks: [taskInput()] });
      const internals = service as unknown as {
        scheduler: {
          stats: () => {
            queued: number;
            running: number;
            completed: number;
            failed: number;
            unknown?: number;
            paused: boolean;
          };
        };
        generationJobsRepository: {
          listByTaskId: (taskId: string) => Array<{ id: string }>;
          updateState: (jobId: string, patch: Record<string, unknown>) => void;
        };
      };
      const [job] = internals.generationJobsRepository.listByTaskId(created.tasks[0].id);
      internals.generationJobsRepository.updateState(job.id, { status: "completed" });
      vi.spyOn(internals.scheduler, "stats").mockReturnValue({
        queued: 0,
        running: 1,
        completed: 22,
        failed: 4,
        paused: false
      });

      expect(service.getBatch(created.batch.id).scheduler).toEqual({
        queued: 0,
        running: 0,
        completed: 1,
        failed: 0,
        unknown: 0,
        paused: false
      });
    } finally {
      await service.close();
    }
  });

  it("uses the active text provider when a text generation job is dispatched", async () => {
    const { service, clientFactory, clients } = createHarness();

    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "Relay A",
        baseUrl: "https://a.example.com/v1/",
        apiKey: "key-a"
      });
      service.getProviderSettingsService().activateProvider(provider.id);
      const created = service.createBatch({ name: "Relay A batch", tasks: [taskInput()] });
      const snapshot = JSON.parse(created.batch.settingsSnapshot);

      expect(snapshot).toEqual({ maxConcurrency: 30, maxBatchSize: 100 });
      expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
      expect(clientFactory).toHaveBeenCalledWith("key-a", "https://a.example.com/v1");
      const relayClient = clients.find((entry) => entry.apiKey === "key-a")?.client;
      expect(relayClient?.createImageTask).toHaveBeenCalledOnce();
      expect(service.getBatch(created.batch.id).images).toHaveLength(1);
    } finally {
      await service.close();
    }
  });

  it("uses the env provider when no formal provider is active", async () => {
    const { service, clientFactory, clients } = createHarness();

    try {
      const created = service.createBatch({ name: "Env batch", tasks: [taskInput()] });
      expect(JSON.parse(created.batch.settingsSnapshot)).toEqual({ maxConcurrency: 30, maxBatchSize: 100 });

      expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
      expect(clientFactory).toHaveBeenCalledWith("env-key", "https://toapis.com/v1");
      const envClient = clients.find((entry) => (
        entry.apiKey === "env-key" && entry.baseUrl === "https://toapis.com/v1"
      ))?.client;
      expect(envClient?.createImageTask).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });

  it("sends the prompt but not the task note to the image provider", async () => {
    const { service, clients } = createHarness();

    try {
      const created = service.createBatch({
        name: "Note isolation",
        tasks: [{
          ...taskInput("rendered prompt"),
          note: "P1 · Internal page note"
        }]
      });

      expect(service.getBatch(created.batch.id).tasks[0]).toMatchObject({
        note: "P1 · Internal page note"
      });
      expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
      const envClient = clients.find((entry) => (
        entry.apiKey === "env-key" && entry.baseUrl === "https://toapis.com/v1"
      ))?.client;
      const createImageTask = vi.mocked(envClient!.createImageTask);
      const [request] = createImageTask.mock.calls[0];

      expect(request.prompt).toBe("rendered prompt");
      expect(request).not.toHaveProperty("note");
    } finally {
      await service.close();
    }
  });

  it("uses provider B for an unsent job after the active role changes", async () => {
    const { service, clients } = createHarness();

    try {
      const providerA = service.getProviderSettingsService().saveProvider({
        name: "Relay A",
        baseUrl: "https://a.example.com/v1",
        apiKey: "key-a"
      });
      const providerB = service.getProviderSettingsService().saveProvider({
        name: "Relay B",
        baseUrl: "https://b.example.com/v1",
        apiKey: "key-b"
      });
      service.getProviderSettingsService().activateProvider(providerA.id);
      const created = service.createBatch({ name: "Old A batch", tasks: [taskInput()] });
      service.getProviderSettingsService().activateProvider(providerB.id);

      await runTask(service, created.tasks[0].id);

      expect(clients.find((entry) => entry.apiKey === "key-a")).toBeUndefined();
      expect(clients.find((entry) => entry.apiKey === "key-b")?.client.createImageTask).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });

  it("blocks remote configuration edits while a generation job depends on that revision", async () => {
    const { service } = createHarness();

    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "Relay A",
        baseUrl: "https://a.example.com/v1",
        apiKey: "key-a"
      });
      service.getProviderSettingsService().activateProvider(provider.id);
      const created = service.createBatch({ name: "Edited provider batch", tasks: [taskInput()] });
      const internals = service as unknown as {
        generationJobsRepository: {
          listByTaskId: (taskId: string) => Array<{ id: string }>;
          bindProvider: (jobId: string, input: Record<string, unknown>) => void;
          updateState: (jobId: string, patch: Record<string, unknown>) => void;
        };
      };
      const runtimeProvider = service.getProviderSettingsService().getConfiguredProvider(provider.id);
      const [job] = internals.generationJobsRepository.listByTaskId(created.tasks[0].id);
      internals.generationJobsRepository.bindProvider(job.id, {
        providerId: provider.id,
        providerRevision: runtimeProvider.configRevision,
        protocolType: runtimeProvider.protocolType,
        requestedSize: "16:9"
      });
      internals.generationJobsRepository.updateState(job.id, {
        status: "failed",
        remoteTaskId: "old-remote-task",
        errorMessage: "fetch failed"
      });

      expect(() => service.getProviderSettingsService().saveProvider({
        id: provider.id,
        name: "Relay A edited",
        baseUrl: "https://a.example.com/v2",
        apiKey: "new-key-a"
      })).toThrowError(expect.objectContaining({ statusCode: 409 }));
    } finally {
      await service.close();
    }
  });

  it("uses the active image provider for child reference upload and generation", async () => {
    const { service, clients } = createHarness();

    try {
      const providerA = service.getProviderSettingsService().saveProvider({
        name: "Relay A",
        baseUrl: "https://a.example.com/v1",
        apiKey: "key-a"
      });
      const providerB = service.getProviderSettingsService().saveProvider({
        name: "Relay B",
        baseUrl: "https://b.example.com/v1",
        apiKey: "key-b"
      });
      service.getProviderSettingsService().activateProvider(providerA.id);
      const parentBatch = service.createBatch({ name: "Parent batch", tasks: [taskInput("parent")] });
      await runTask(service, parentBatch.tasks[0].id);
      const parentImage = service.getBatch(parentBatch.batch.id).images[0] as { id: string };
      service.getProviderSettingsService().setRoleProvider("image", providerB.id);

      const child = service.createChildTasksFromImage({
        parentImageId: parentImage.id,
        tasks: [taskInput("child")]
      });
      await runTask(service, String((child.tasks[0] as { id: string }).id));

      const providerAClients = clients.filter((entry) => entry.apiKey === "key-a");
      expect(providerAClients.reduce(
        (count, entry) => count + vi.mocked(entry.client.createImageTask).mock.calls.length,
        0
      )).toBe(1);
      const providerBClient = clients.find((entry) => entry.apiKey === "key-b")?.client;
      expect(providerBClient?.uploadReferenceImage).toHaveBeenCalledOnce();
      expect(providerBClient?.createImageTask).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });
});
