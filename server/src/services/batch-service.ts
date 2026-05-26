import { Readable } from "node:stream";
import { basename, extname } from "node:path";
import { createDatabase } from "../db/database.js";
import { createBatchesRepository } from "../db/repositories/batches-repository.js";
import { createGeneratedImagesRepository } from "../db/repositories/generated-images-repository.js";
import { createReferenceImagesRepository } from "../db/repositories/reference-images-repository.js";
import { createTasksRepository, type TaskDraftInput } from "../db/repositories/tasks-repository.js";
import { loadEnv, type AppEnv } from "../config/env.js";
import { modelCapabilities, resolveTaskRequest } from "../config/model-capabilities.js";
import { FileStorage } from "../lib/file-storage.js";
import { createZipBuffer } from "../lib/zip-service.js";
import { QueueScheduler } from "./queue-scheduler.js";
import { ReferenceImageService } from "./reference-image-service.js";
import { ToApisClient } from "./toapis-client.js";

type BatchTaskInput = TaskDraftInput;

type BatchServiceOptions = {
  envOverrides?: Partial<NodeJS.ProcessEnv>;
  backgroundProcessing?: boolean;
};

type TaskRecord = {
  id: string;
  batch_id: string;
  prompt: string;
  model: string;
  aspect_ratio: string | null;
  resolution: string | null;
  size: string;
  n: number;
  reference_image_id: string | null;
};

export class BatchService {
  private readonly env: AppEnv;
  private readonly db;
  private readonly batchesRepository;
  private readonly tasksRepository;
  private readonly generatedImagesRepository;
  private readonly referenceImagesRepository;
  private readonly fileStorage;
  private readonly toApisClient;
  private readonly referenceImageService;
  private readonly scheduler;
  private readonly backgroundProcessing: boolean;

  constructor(options?: BatchServiceOptions) {
    this.env = loadEnv({
      ...process.env,
      ...options?.envOverrides
    });
    this.db = createDatabase(`${this.env.appDataDir}/app.sqlite`);
    this.batchesRepository = createBatchesRepository(this.db);
    this.tasksRepository = createTasksRepository(this.db);
    this.generatedImagesRepository = createGeneratedImagesRepository(this.db);
    this.referenceImagesRepository = createReferenceImagesRepository(this.db);
    this.fileStorage = new FileStorage(this.env.appDataDir);
    this.toApisClient = new ToApisClient(this.env.toapisApiKey);
    this.referenceImageService = new ReferenceImageService(
      this.fileStorage,
      this.referenceImagesRepository,
      this.toApisClient
    );
    this.backgroundProcessing = options?.backgroundProcessing ?? true;
    this.scheduler = new QueueScheduler({
      maxConcurrency: this.env.maxConcurrency,
      runTask: async (taskId) => this.runTask(taskId)
    });
  }

  getSettings() {
    return {
      maxConcurrency: this.env.maxConcurrency,
      maxBatchSize: this.env.maxBatchSize,
      models: Object.entries(modelCapabilities).map(([value, capability]) => ({
        value,
        label: capability.label,
        aspectRatios: capability.aspectRatios,
        resolutions: capability.resolutions,
        maxN: capability.maxN,
        supportsReferenceImages: capability.supportsReferenceImages
      }))
    };
  }

  createBatch(input: { name: string; tasks: BatchTaskInput[] }) {
    if (input.tasks.length === 0) {
      throw new Error("至少需要一条任务");
    }

    if (input.tasks.length > this.env.maxBatchSize) {
      throw new Error(`单批最多支持 ${this.env.maxBatchSize} 条任务`);
    }

    const preparedTasks = input.tasks.map((task) => {
      const resolved = resolveTaskRequest({
        model: task.model,
        aspectRatio: task.aspectRatio,
        resolution: task.resolution,
        n: task.n,
        hasReferenceImage: Boolean(task.referenceImageId)
      });

      return {
        ...task,
        size: resolved.size
      };
    });

    const batch = this.batchesRepository.create({
      name: input.name,
      status: this.backgroundProcessing ? "running" : "draft",
      settingsSnapshot: JSON.stringify({
        maxConcurrency: this.env.maxConcurrency,
        maxBatchSize: this.env.maxBatchSize
      })
    });
    const tasks = this.tasksRepository.createMany(batch.id, preparedTasks);

    this.batchesRepository.updateCounts(batch.id, {
      totalTasks: tasks.length,
      status: this.backgroundProcessing ? "running" : "draft"
    });

    if (this.backgroundProcessing) {
      tasks.forEach((task) => this.scheduler.enqueue(task.id));
    }

    return {
      batch: {
        ...batch,
        totalTasks: tasks.length,
        status: this.backgroundProcessing ? "running" : "draft"
      },
      tasks
    };
  }

  getBatch(batchId: string) {
    const batch = this.batchesRepository.getById(batchId);

    if (!batch) {
      throw new Error("批次不存在");
    }

    return {
      batch,
      tasks: this.tasksRepository.listByBatchId(batchId),
      images: this.generatedImagesRepository.listByBatchId(batchId),
      scheduler: this.scheduler.stats()
    };
  }

  listHistory(filters?: { q?: string; model?: string; date?: string }) {
    const batches = this.batchesRepository.list();

    return batches.map((batch) => {
      const tasks = this.tasksRepository.listByBatchId(String((batch as { id: string }).id));
      const images = this.generatedImagesRepository.listByBatchId(String((batch as { id: string }).id));

      const filteredTasks = tasks.filter((task) => {
        if (filters?.q && !String((task as { prompt: string }).prompt).includes(filters.q)) {
          return false;
        }
        if (filters?.model && String((task as { model: string }).model) !== filters.model) {
          return false;
        }
        if (filters?.date && !String((task as { created_at: string }).created_at).startsWith(filters.date)) {
          return false;
        }
        return true;
      });

      return {
        batch,
        tasks: filteredTasks,
        images
      };
    });
  }

  pauseBatch(batchId: string) {
    this.scheduler.pause();
    this.batchesRepository.updateCounts(batchId, { status: "paused" });
    return { ok: true };
  }

  resumeBatch(batchId: string) {
    this.scheduler.resume();
    this.batchesRepository.updateCounts(batchId, { status: "running" });
    return { ok: true };
  }

  retryTasks(taskIds: string[]) {
    const tasks = this.tasksRepository.listByIds(taskIds);
    tasks.forEach((task) => {
      this.tasksRepository.updateState(String((task as { id: string }).id), {
        status: "queued",
        errorMessage: null,
        remoteTaskId: null
      });
      if (this.backgroundProcessing) {
        this.scheduler.enqueue(String((task as { id: string }).id));
      }
    });

    return { retried: tasks.length };
  }

  createReferenceImage(input: { filename: string; mimeType: string; buffer: Buffer }) {
    return this.referenceImageService.createLocalReference(input);
  }

  deleteBatch(batchId: string) {
    const images = this.generatedImagesRepository.listByBatchId(batchId) as Array<{ local_path: string }>;
    images.forEach((image) => this.fileStorage.deleteFile(image.local_path));
    this.fileStorage.deleteBatchDirectory(batchId);
    this.generatedImagesRepository.deleteByBatchId(batchId);
    this.tasksRepository.deleteByBatchId(batchId);
    this.batchesRepository.delete(batchId);
    return { ok: true };
  }

  deleteImage(imageId: string) {
    const image = this.generatedImagesRepository.getById(imageId) as { local_path: string } | undefined;
    if (image) {
      this.fileStorage.deleteFile(image.local_path);
      this.generatedImagesRepository.delete(imageId);
    }
    return { ok: true };
  }

  async downloadImage(imageId: string) {
    const image = this.generatedImagesRepository.getById(imageId) as
      | { local_path: string; filename: string }
      | undefined;

    if (!image) {
      throw new Error("图片不存在");
    }

    return {
      filename: image.filename,
      stream: Readable.from(this.fileStorage.readFile(image.local_path))
    };
  }

  async downloadZip(input: { batchId?: string; imageIds?: string[] }) {
    const images = input.batchId
      ? this.generatedImagesRepository.listByBatchId(input.batchId)
      : this.generatedImagesRepository.listByIds(input.imageIds ?? []);

    const buffer = await createZipBuffer(
      (images as Array<{ filename: string; local_path: string }>).map((image) => ({
        filename: image.filename,
        buffer: this.fileStorage.readFile(image.local_path)
      }))
    );

    return {
      filename: `${input.batchId ?? "selected-images"}.zip`,
      stream: Readable.from(buffer)
    };
  }

  exportBatchImages(input: { batchId: string; destinationDir: string }) {
    const images = this.generatedImagesRepository.listByBatchId(input.batchId) as Array<{ local_path: string }>;

    if (images.length === 0) {
      throw new Error("当前批次还没有可导出的图片");
    }

    const exported = this.fileStorage.exportFiles({
      sourcePaths: images.map((image) => image.local_path),
      destinationDir: input.destinationDir
    });

    return {
      ok: true,
      exportedCount: exported.exportedPaths.length,
      destinationDir: exported.destinationDir
    };
  }

  async close() {
    this.db.close();
  }

  private async runTask(taskId: string) {
    const task = this.tasksRepository.getById(taskId) as TaskRecord | undefined;

    if (!task) {
      return { outcome: "failed" as const };
    }

    try {
      this.tasksRepository.updateState(taskId, { status: "submitting", errorMessage: null });

      const imageUrls = task.reference_image_id
        ? [await this.referenceImageService.ensureRemoteUrl(task.reference_image_id)]
        : undefined;

      const requestPayload = task.aspect_ratio && task.resolution
        ? resolveTaskRequest({
          model: task.model,
          aspectRatio: task.aspect_ratio,
          resolution: task.resolution,
          n: task.n,
          hasReferenceImage: Boolean(task.reference_image_id)
        })
        : {
          requestModel: modelCapabilities[task.model]?.requestModel ?? task.model,
          size: task.size,
          metadata: undefined
        };

      const created = await this.toApisClient.createImageTask({
        prompt: task.prompt,
        model: requestPayload.requestModel,
        size: requestPayload.size,
        resolution: requestPayload.resolution,
        n: task.n,
        metadata: requestPayload.metadata,
        imageUrls
      });

      this.tasksRepository.updateState(taskId, {
        status: "remote_queued",
        remoteTaskId: created.id
      });

      const settled = await this.pollTask(created.id);

      if (settled.status === "failed") {
        this.tasksRepository.updateState(taskId, {
          status: "failed",
          errorMessage: settled.error?.message ?? "远程任务失败"
        });
        this.refreshBatchStats(task.batch_id, "running");
        return { outcome: "failed" as const };
      }

      this.tasksRepository.updateState(taskId, { status: "downloading" });

      const urls = settled.result?.data?.map((item) => item.url) ?? [];
      let index = 0;
      for (const url of urls) {
        index += 1;
        const downloaded = await this.toApisClient.downloadImage(url);
        const extension = extname(new URL(url).pathname) || ".png";
        const filename = `${taskId}-${index}${extension}`;
        const localPath = this.fileStorage.writeGeneratedImage(task.batch_id, taskId, index, filename, downloaded.buffer);
        this.generatedImagesRepository.create({
          batchId: task.batch_id,
          taskId,
          filename,
          localPath,
          mimeType: downloaded.mimeType
        });
      }

      this.tasksRepository.updateState(taskId, { status: "completed" });
      this.refreshBatchStats(task.batch_id, "running");
      return { outcome: "completed" as const };
    } catch (error) {
      this.tasksRepository.updateState(taskId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "未知错误"
      });
      this.refreshBatchStats(task.batch_id, "running");
      return { outcome: "failed" as const };
    }
  }

  private async pollTask(taskId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await this.toApisClient.getImageTask(taskId);

      if (result.status === "completed" || result.status === "failed") {
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error("任务轮询超时");
  }

  private refreshBatchStats(batchId: string, fallbackStatus: string) {
    const counts = this.tasksRepository.countByBatchId(batchId);
    const nextStatus = counts.total > 0 && counts.completed + counts.failed === counts.total
      ? "completed"
      : fallbackStatus;

    this.batchesRepository.updateCounts(batchId, {
      totalTasks: counts.total,
      successCount: counts.completed,
      failedCount: counts.failed,
      status: nextStatus
    });
  }
}

export function createBatchService(options?: BatchServiceOptions) {
  return new BatchService(options);
}
