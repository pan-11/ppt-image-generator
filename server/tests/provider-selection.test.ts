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
  return (service as unknown as {
    runTask: (id: string) => Promise<{ outcome: "completed" | "failed" }>;
  }).runTask(taskId);
}

describe("batch provider selection", () => {
  it("stores and uses the active provider when a batch is created", async () => {
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

      expect(snapshot).toMatchObject({ providerId: provider.id, providerRevision: provider.updatedAt });
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
      expect(JSON.parse(created.batch.settingsSnapshot)).toMatchObject({
        providerId: null,
        providerRevision: null
      });

      expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
      expect(clientFactory).toHaveBeenCalledWith("env-key");
      const envClient = clients.find((entry) => entry.apiKey === "env-key")?.client;
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
      const envClient = clients.find((entry) => entry.apiKey === "env-key")?.client;
      const createImageTask = vi.mocked(envClient!.createImageTask);
      const [request] = createImageTask.mock.calls[0];

      expect(request.prompt).toBe("rendered prompt");
      expect(request).not.toHaveProperty("note");
    } finally {
      await service.close();
    }
  });

  it("keeps an old batch on provider A after provider B becomes active", async () => {
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

      expect(clients.find((entry) => entry.apiKey === "key-a")?.client.createImageTask).toHaveBeenCalledOnce();
      expect(clients.find((entry) => entry.apiKey === "key-b")).toBeUndefined();
    } finally {
      await service.close();
    }
  });

  it("does not reuse an old remote task ID after the batch provider configuration changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T08:00:00.000Z"));
    const { service, clients } = createHarness();

    try {
      const provider = service.getProviderSettingsService().saveProvider({
        name: "Relay A",
        baseUrl: "https://a.example.com/v1",
        apiKey: "key-a"
      });
      service.getProviderSettingsService().activateProvider(provider.id);
      const created = service.createBatch({ name: "Edited provider batch", tasks: [taskInput()] });
      const internals = service as unknown as {
        tasksRepository: {
          updateState: (taskId: string, patch: Record<string, unknown>) => void;
        };
      };
      internals.tasksRepository.updateState(created.tasks[0].id, {
        status: "failed",
        remoteTaskId: "old-remote-task",
        errorMessage: "fetch failed"
      });
      vi.setSystemTime(new Date("2026-08-11T08:01:00.000Z"));
      service.getProviderSettingsService().saveProvider({
        id: provider.id,
        name: "Relay A edited",
        baseUrl: "https://a.example.com/v2",
        apiKey: "new-key-a"
      });

      expect((await runTask(service, created.tasks[0].id)).outcome).toBe("completed");
      const editedClient = clients.find((entry) => entry.apiKey === "new-key-a")?.client;
      expect(editedClient?.createImageTask).toHaveBeenCalledOnce();
      expect(editedClient?.getImageTask).not.toHaveBeenCalled();
    } finally {
      await service.close();
    }
  });

  it("uses the parent batch provider for child reference upload and generation", async () => {
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
      service.getProviderSettingsService().activateProvider(providerB.id);

      const child = service.createChildTasksFromImage({
        parentImageId: parentImage.id,
        tasks: [taskInput("child")]
      });
      await runTask(service, String((child.tasks[0] as { id: string }).id));

      const providerAClients = clients.filter((entry) => entry.apiKey === "key-a");
      expect(providerAClients.some((entry) => vi.mocked(entry.client.uploadReferenceImage).mock.calls.length === 1)).toBe(true);
      expect(providerAClients.reduce(
        (count, entry) => count + vi.mocked(entry.client.createImageTask).mock.calls.length,
        0
      )).toBe(2);
      expect(clients.find((entry) => entry.apiKey === "key-b")).toBeUndefined();
    } finally {
      await service.close();
    }
  });
});
