import { CoursewareService, CoursewareError } from "./courseware-service.js";
import { TextlessService } from "./textless-service.js";
import { createImageJobResultsRepository } from "../db/repositories/image-job-results-repository.js";
import { Readable } from "node:stream";
import { basename } from "node:path";
import type { GenerationJobRecord } from "../db/repositories/generation-jobs-repository.js";
import { createDatabase } from "../db/database.js";
import { createBatchesRepository } from "../db/repositories/batches-repository.js";
import { createGeneratedImagesRepository } from "../db/repositories/generated-images-repository.js";
import { createGenerationJobsRepository } from "../db/repositories/generation-jobs-repository.js";
import { createReferenceImagesRepository } from "../db/repositories/reference-images-repository.js";
import { createTasksRepository, type TaskDraftInput } from "../db/repositories/tasks-repository.js";
import { loadEnv, type AppEnv } from "../config/env.js";
import { FileStorage } from "../lib/file-storage.js";
import { readImageDimensions, imageDimensionsMatch, imageAspectRatiosMatch } from "../lib/image-dimensions.js";
import sharp from "sharp";
import { createZipBuffer } from "../lib/zip-service.js";
import { ProviderJobScheduler } from "./provider-job-scheduler.js";
import { ReferenceImageService } from "./reference-image-service.js";
import { ToApisClient } from "./toapis-client.js";
import { ProviderSettingsService } from "./provider-settings-service-v2.js";
import { ENV_PROVIDER_ID } from "./provider-settings-service-v2.js";
import { ProviderAdapterRegistry } from "../providers/provider-adapter-registry.js";
import { ToApisAsyncAdapter } from "../providers/toapis-async-adapter.js";
import { Ym2OpenAiImagesAdapter } from "../providers/ym2-openai-images-adapter.js";
import { YunfeiHybridImagesAdapter } from "../providers/yunfei-hybrid-images-adapter.js";
import { GrsaiDrawAdapter } from "../providers/grsai-draw-adapter.js";
import { CangyuanImagesAdapter } from "../providers/cangyuan-images-adapter.js";
import {
  UnknownSubmissionError,
  RemoteGenerationFailedError,
  type AdapterGenerationRequest,
  type ReferenceAsset,
  type ProviderRuntimeConfig
} from "../providers/provider-adapter.js";

type BatchTaskInput = TaskDraftInput & { pageId?: string };

export type BatchServiceOptions = {
  envOverrides?: Partial<NodeJS.ProcessEnv>;
  backgroundProcessing?: boolean;
  clientFactory?: (apiKey: string, baseUrl?: string) => ToApisClient;
  adapterRegistry?: ProviderAdapterRegistry;
};

export class BatchServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BatchServiceError";
  }
}

type BatchProviderSnapshot = {
  providerId: string | null;
  providerRevision: string | null;
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
  remote_task_id: string | null;
  error_message: string | null;
};

type GeneratedImageRecord = {
  id: string;
  batch_id: string;
  task_id: string;
  filename: string;
  local_path: string;
  mime_type: string;
};

export class BatchService {
  private readonly coursewareService;
  private readonly textlessService;
  private readonly imageJobResults;
  private readonly env: AppEnv;
  private readonly db;
  private readonly batchesRepository;
  private readonly tasksRepository;
  private readonly generatedImagesRepository;
  private readonly generationJobsRepository;
  private readonly referenceImagesRepository;
  private readonly fileStorage;
  private readonly clientFactory;
  private readonly referenceImageService;
  private readonly scheduler;
  private readonly providerSettingsService;
  private readonly adapterRegistry;
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
    this.generationJobsRepository = createGenerationJobsRepository(this.db);
    this.referenceImagesRepository = createReferenceImagesRepository(this.db);
    this.coursewareService = new CoursewareService(this.db, this.env.maxBatchSize);
    this.imageJobResults = createImageJobResultsRepository(this.db);
    this.fileStorage = new FileStorage(this.env.appDataDir);
    this.clientFactory = options?.clientFactory ?? ((apiKey: string, baseUrl?: string) => (
      baseUrl ? new ToApisClient(apiKey, baseUrl) : new ToApisClient(apiKey)
    ));
    this.referenceImageService = new ReferenceImageService(
      this.fileStorage,
      this.referenceImagesRepository
    );
    this.backgroundProcessing = options?.backgroundProcessing ?? true;
    this.adapterRegistry = options?.adapterRegistry ?? new ProviderAdapterRegistry([
      new ToApisAsyncAdapter((apiKey, baseUrl) => this.clientFactory(apiKey, baseUrl)),
      new Ym2OpenAiImagesAdapter(),
      new YunfeiHybridImagesAdapter(),
      new GrsaiDrawAdapter(),
      new CangyuanImagesAdapter()
    ]);
    this.providerSettingsService = new ProviderSettingsService(this.env.appDataDir, {
      environment: {
        apiKey: this.env.toapisApiKey,
        maxConcurrency: this.env.maxConcurrency
      },
      hasRevisionDependency: (providerId, providerRevision) => (
        this.generationJobsRepository.hasProviderRevisionDependency(providerId, providerRevision)
      ),
      protocolCapabilities: (provider) => {
        const adapter = this.adapterRegistry.require(provider.protocolType);
        return {
          text: adapter.capabilities(provider, "text").length > 0,
          image: adapter.capabilities(provider, "image").length > 0
        };
      }
    });
    this.scheduler = new ProviderJobScheduler({
      resolveLane: (jobId) => {
        const job = this.generationJobsRepository.getById(jobId);
        if (!job) throw new Error("生图作业不存在");
        const provider = this.resolveProviderForJob(job);
        return { providerId: provider.id, maxConcurrency: provider.maxConcurrency };
      },
      runJob: async (jobId) => this.runGenerationJob(jobId)
    });
    this.textlessService = new TextlessService(
      this.db, this.coursewareService, this.referenceImageService,
      (input, beforeEnqueue) => this.createBatch(input, beforeEnqueue),
      (task, image) => this.prepareTask(task, "image", [{ id: image.id, filename: image.filename, mimeType: image.mime_type, buffer: this.fileStorage.readFile(image.local_path) }])
    );
    if (this.backgroundProcessing) this.recoverTextlessJobs();
  }

  getCoursewareService() { return this.coursewareService; }
  getTextlessService() { return this.textlessService; }

  getSettings() {
    const text = this.getRoleSettings("text");
    const image = this.getRoleSettings("image");
    return {
      maxBatchSize: this.env.maxBatchSize,
      roles: { text, image }
    };
  }

  private getRoleSettings(mode: "text" | "image") {
    const provider = this.providerSettingsService.getRoleProvider(mode);
    const adapter = this.adapterRegistry.require(provider.protocolType);
    return {
      providerId: provider.id,
      providerName: provider.name,
      protocolType: provider.protocolType,
      maxConcurrency: provider.maxConcurrency,
      models: adapter.capabilities(provider, mode)
    };
  }

  createBatch(input: { name: string; tasks: BatchTaskInput[]; coursewareId?: string }, beforeEnqueue?: (tasks: Array<{ id: string }>) => void) {
    if (input.coursewareId) {
      const doc = this.coursewareService.require(input.coursewareId);
      if (input.tasks.some(t => !doc.pages.some(p => p.id === t.pageId))) throw new CoursewareError(409, "INVALID_PAGE", "任务页面不属于本课件");
    }
    if (input.tasks.length === 0) {
      throw new Error("至少需要一条任务");
    }

    if (input.tasks.length > this.env.maxBatchSize) {
      throw new Error(`单批最多支持 ${this.env.maxBatchSize} 条任务`);
    }

    const preparedTasks = input.tasks.map((task) => this.prepareTask(
      task,
      task.referenceImageId ? "image" : "text"
    ));

    const { batch, tasks, jobs } = this.db.transaction(() => {
      const batch = this.batchesRepository.create({
        name: input.name,
        status: this.backgroundProcessing ? "running" : "draft",
        settingsSnapshot: JSON.stringify({
          maxConcurrency: this.env.maxConcurrency,
          maxBatchSize: this.env.maxBatchSize
        })
      });
      const tasks = this.tasksRepository.createMany(batch.id, preparedTasks);
      const jobs = tasks.flatMap((task, index) => this.generationJobsRepository.createForTask({
        taskId: task.id,
        count: task.n,
        mode: preparedTasks[index]?.referenceImageId ? "image" : "text"
      }));

      this.batchesRepository.updateCounts(batch.id, {
        totalTasks: tasks.length,
        status: this.backgroundProcessing ? "running" : "draft"
      });

      if (input.coursewareId) tasks.forEach((task, index) => this.coursewareService.links.create({ taskId: task.id, coursewareId: input.coursewareId!, pageId: input.tasks[index].pageId!, purpose: "original", textlessRunId: null, sourceImageId: null }));
      beforeEnqueue?.(tasks);
      return { batch, tasks, jobs };
    })();

    if (this.backgroundProcessing) {
      jobs.forEach((job) => this.scheduler.enqueue(job.id));
    }

    return {
      batch: {
        ...batch,
        totalTasks: tasks.length,
        status: this.backgroundProcessing ? "running" : "draft"
      },
      tasks,
      jobs
    };
  }

  createChildTasksFromImage(input: { parentImageId: string; tasks: BatchTaskInput[] }) {
    if (input.tasks.length === 0) {
      throw new Error("鑷冲皯闇€瑕佷竴鏉′换鍔?");
    }

    const parentImage = this.generatedImagesRepository.getById(input.parentImageId) as GeneratedImageRecord | undefined;

    if (!parentImage) {
      throw new Error("鍙傝€冪粨鏋滃浘涓嶅瓨鍦?");
    }

    const batch = this.batchesRepository.getById(parentImage.batch_id) as { id: string; status: string } | undefined;

    if (!batch) {
      throw new Error("鎵规涓嶅瓨鍦?");
    }

    const counts = this.tasksRepository.countByBatchId(parentImage.batch_id);
    if (counts.total + input.tasks.length > this.env.maxBatchSize) {
      throw new Error(`Single batch supports up to ${this.env.maxBatchSize} tasks`);
    }

    const reference = this.referenceImageService.createFromGeneratedImage({
      filename: parentImage.filename,
      localPath: parentImage.local_path,
      mimeType: parentImage.mime_type
    });

    const preparedTasks = input.tasks.map((task) => this.prepareTask({
      ...task,
      referenceMode: "row",
      referenceImageId: reference.id,
      parentImageId: parentImage.id
    }, "image"));

    const { createdTasks, jobs } = this.db.transaction(() => {
      const createdTasks = this.tasksRepository.createMany(parentImage.batch_id, preparedTasks);
      const jobs = createdTasks.flatMap((task) => this.generationJobsRepository.createForTask({
        taskId: task.id,
        count: task.n,
        mode: "image"
      }));
      const nextCounts = this.tasksRepository.countByBatchId(parentImage.batch_id);
      this.batchesRepository.updateCounts(parentImage.batch_id, {
        totalTasks: nextCounts.total,
        successCount: nextCounts.completed,
        failedCount: nextCounts.failed,
        status: this.backgroundProcessing ? "running" : batch.status
      });

      const parentLink = this.coursewareService.links.get(parentImage.task_id);
      if (parentLink?.purpose === "textless") throw new CoursewareError(409, "TEXTLESS_CHILD", "请从定稿候选图创建变体");
      if (parentLink) createdTasks.forEach(task => this.coursewareService.links.create({ ...parentLink, taskId: task.id, purpose: "variation", textlessRunId: null, sourceImageId: parentImage.id }));
      return { createdTasks, jobs };
    })();

    if (this.backgroundProcessing) {
      jobs.forEach((job) => this.scheduler.enqueue(job.id));
    }

    const tasks = this.tasksRepository.listByIds(createdTasks.map((task) => task.id));
    return { tasks, jobs };
  }

  getBatch(batchId: string) {
    const batch = this.batchesRepository.getById(batchId);

    if (!batch) {
      throw new Error("批次不存在");
    }

    const tasks = this.tasksRepository.listByBatchId(batchId);
    const jobs = this.generationJobsRepository.listByBatchId(batchId);
    const scheduler = this.scheduler.stats();

    return {
      batch,
      tasks,
      jobs: this.withProviderNames(jobs),
      images: this.generatedImagesRepository.listByBatchId(batchId),
      scheduler: {
        queued: jobs.filter((job) => job.status === "queued").length,
        running: jobs.filter((job) => ["submitting", "remote_queued", "downloading"].includes(job.status)).length,
        completed: jobs.filter((job) => job.status === "completed").length,
        failed: jobs.filter((job) => job.status === "failed").length,
        unknown: jobs.filter((job) => job.status === "unknown").length,
        paused: scheduler.paused
      }
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
        jobs: this.withProviderNames(this.generationJobsRepository.listByTaskIds(
          filteredTasks.map((task) => String((task as { id: string }).id))
        )),
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

  retryTasks(taskIds: string[], options: { confirmUnknown?: boolean } = {}) {
    const tasks = this.tasksRepository.listByIds(taskIds);
    tasks.forEach((task) => this.ensureGenerationJobsForRetry(task as TaskRecord));
    const jobs = this.generationJobsRepository.listByTaskIds(
      tasks.map((task) => String((task as { id: string }).id))
    );
    const retryable = jobs.filter((job) => job.status === "failed" || job.status === "unknown");
    if (!options.confirmUnknown && retryable.some((job) => job.status === "unknown")) {
      throw new BatchServiceError(
        409,
        "UNKNOWN_CHARGE_RISK",
        "该请求状态未知，中转站可能已经扣费。仍要重新生成吗？"
      );
    }

    for (const job of retryable) {
      if (this.canRecoverFailedJob(job)
        && this.coursewareService.links.get(job.task_id)?.purpose === "textless") {
        try { this.resolveProviderForJob(job); }
        catch (error) { throw new BatchServiceError(409, "PROVIDER_REVISION_MISMATCH", error instanceof Error ? error.message : "无法恢复记录的中转站"); }
      }
    }
    for (const job of retryable) {
      const recoverable = this.canRecoverFailedJob(job);
      if (!recoverable) this.generationJobsRepository.clearProviderBinding(job.id);
      this.generationJobsRepository.updateState(job.id, {
        status: "queued",
        actualWidth: null,
        actualHeight: null,
        errorStage: null,
        errorMessage: null,
        ...(recoverable ? {} : { remoteTaskId: null, remoteResultUrl: null })
      });
      this.tasksRepository.updateState(job.task_id, { status: "queued", errorMessage: null });
      if (this.backgroundProcessing) this.scheduler.enqueue(job.id);
    }

    return {
      retriedJobs: retryable.length,
      affectedTasks: new Set(retryable.map((job) => job.task_id)).size
    };
  }

  private canRecoverFailedJob(job: GenerationJobRecord) {
    const legacyRemoteFailure = job.error_stage === "polling" && (
      (job.protocol_type === "grsai-draw" && /^GrsAI 任务失败(?:：|$)/.test(job.error_message ?? ""))
      || (job.protocol_type === "cangyuan-images" && job.error_message === "沧元任务失败，请查看中转站控制台的失败原因")
    );
    return job.status === "failed" && job.error_stage !== "remote_failure" && !legacyRemoteFailure
      && Boolean(job.remote_task_id || job.remote_result_url);
  }

  async restoreTextlessRun(runId: string) {
    const detail = this.textlessService.detail(runId);
    const jobs = this.generationJobsRepository.listByTaskIds(detail.pages.map(page => page.taskId));
    for (const job of jobs) {
      if (job.status !== "failed" || job.error_stage !== "validation") continue;
      const local = this.db.prepare("select i.id,i.local_path from image_job_results r join generated_images i on i.id=r.image_id where r.job_id=? and r.attempt_number=? and r.validation_status='invalid' order by r.rowid desc limit 1").get(job.id, job.attempt_count) as { id: string; local_path: string } | undefined;
      const size = /^(\d+)x(\d+)$/.exec(job.requested_size ?? "");
      if (!local || !size) continue;
      let validation;
      try {
        validation = await this.validateJobImage(job.task_id, this.fileStorage.readFile(local.local_path), { width: Number(size[1]), height: Number(size[2]) });
      } catch { continue; }
      if (validation.dimensionError || !validation.dimensions) continue;
      const dimensions = validation.dimensions;
      this.db.transaction(() => {
        const current = this.generationJobsRepository.getById(job.id);
        if (!current || current.status !== "failed" || current.error_stage !== "validation"
          || current.attempt_count !== job.attempt_count || current.updated_at !== job.updated_at) return;
        const updated = this.db.prepare("update image_job_results set validation_status='valid',actual_width=?,actual_height=? where image_id=? and job_id=? and attempt_number=? and validation_status='invalid'")
          .run(dimensions.width, dimensions.height, local.id, job.id, job.attempt_count);
        if (!updated.changes) return;
        this.generationJobsRepository.updateState(job.id, { status: "completed", actualWidth: dimensions.width, actualHeight: dimensions.height, errorStage: null, errorMessage: null });
        const task = this.tasksRepository.getById(job.task_id);
        if (task) this.refreshTaskFromJobs(task.id, task.batch_id);
      })();
    }
    return this.textlessService.detail(runId);
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

  getAppDataDir() {
    return this.env.appDataDir;
  }

  hasActiveTasks() {
    const stats = this.scheduler.stats();
    return stats.queued > 0 || stats.running > 0;
  }

  private resolveProviderForJob(job: GenerationJobRecord) {
    if ((job.remote_task_id || job.remote_result_url) && job.provider_id && job.provider_revision) {
      try {
        const recorded = this.providerSettingsService.getConfiguredProvider(job.provider_id);
        if (recorded.configRevision === job.provider_revision) return recorded;
      } catch {
        // A genuinely new generation below uses the current role provider.
      }
    }
    if ((job.remote_task_id || job.remote_result_url) && this.coursewareService.links.get(job.task_id)?.purpose === "textless") throw new Error("记录的中转站配置已变更，无法安全恢复去字任务");
    return this.providerSettingsService.getRoleProvider(job.mode);
  }

  private recoverTextlessJobs() {
    const jobs = this.db.prepare("select j.* from generation_jobs j join courseware_task_links l on l.task_id=j.task_id where l.purpose='textless' and j.status in ('queued','submitting','remote_queued','downloading')").all() as GenerationJobRecord[];
    for (const job of jobs) {
      const local = this.db.prepare("select i.local_path,r.actual_width,r.actual_height from image_job_results r join generated_images i on i.id=r.image_id where r.job_id=? and r.attempt_number=? and r.validation_status='valid' order by r.rowid desc limit 1").get(job.id, job.attempt_count) as { local_path: string; actual_width: number | null; actual_height: number | null } | undefined;
      let localDimensions: { width: number; height: number } | null = null;
      if (local) {
        try {
          const dimensions = readImageDimensions(this.fileStorage.readFile(local.local_path));
          if (dimensions.width === local.actual_width && dimensions.height === local.actual_height) localDimensions = dimensions;
        } catch {
          // A missing or unreadable artifact cannot repair the interrupted job.
        }
      }
      if (localDimensions) {
        this.generationJobsRepository.updateState(job.id, { status: "completed", actualWidth: localDimensions.width, actualHeight: localDimensions.height, errorStage: null, errorMessage: null });
      } else if (job.status !== "queued" && !job.remote_task_id && !job.remote_result_url) {
        this.generationJobsRepository.updateState(job.id, { status: "unknown", errorStage: "recovery", errorMessage: "程序中断，无法确认是否已提交，请确认费用风险后重试" });
      } else {
        try { this.resolveProviderForJob(job); this.generationJobsRepository.updateState(job.id, { status: "queued" }); this.scheduler.enqueue(job.id); }
        catch (error) { this.generationJobsRepository.updateState(job.id, { status: "failed", errorStage: "recovery", errorMessage: error instanceof Error ? error.message : "恢复失败" }); }
      }
      const task = this.tasksRepository.getById(job.task_id);
      if (task) this.refreshTaskFromJobs(task.id, task.batch_id);
    }
  }

  private withProviderNames(jobs: GenerationJobRecord[]) {
    return jobs.map((job) => {
      if (!job.provider_id) return { ...job, provider_name: null };
      try {
        return {
          ...job,
          provider_name: this.providerSettingsService.getConfiguredProvider(job.provider_id).name
        };
      } catch {
        return { ...job, provider_name: job.provider_id };
      }
    });
  }

  private adapterRequest(task: TaskRecord): AdapterGenerationRequest {
    return {
      prompt: task.prompt,
      model: task.model,
      aspectRatio: task.aspect_ratio ?? task.size,
      resolution: task.resolution ?? "1K",
      references: task.reference_image_id
        ? [this.referenceImageService.getLocalAsset(task.reference_image_id)]
        : []
    };
  }

  private prepareTask(task: BatchTaskInput, mode: "text" | "image", referenceOverride?: ReferenceAsset[]): BatchTaskInput {
    const provider = this.providerSettingsService.getRoleProvider(mode);
    const adapter = this.adapterRegistry.require(provider.protocolType);
    const capability = adapter.capabilities(provider, mode)
      .find((item) => item.value === task.model);
    if (!capability) throw new Error(`当前${provider.name}不支持模型 ${task.model}`);
    if (!capability.aspectRatios.includes(task.aspectRatio)) {
      throw new Error(`当前${provider.name}不支持比例 ${task.aspectRatio}`);
    }
    const resolutions = capability.supportedResolutionsByAspectRatio?.[task.aspectRatio]
      ?? capability.resolutions;
    if (!resolutions.includes(task.resolution)) {
      throw new Error(`当前${provider.name}不支持分辨率 ${task.resolution}`);
    }
    if (task.n < 1 || task.n > capability.maxN) {
      throw new Error(`当前${provider.name}每条任务支持 1 到 ${capability.maxN} 张图`);
    }
    if (mode === "image" && !capability.supportsReferenceImages) {
      throw new Error(`当前${provider.name}不支持参考图`);
    }
    const request: AdapterGenerationRequest = {
      prompt: task.prompt,
      model: task.model,
      aspectRatio: task.aspectRatio,
      resolution: task.resolution,
      references: referenceOverride ?? (task.referenceImageId
        ? [this.referenceImageService.getLocalAsset(task.referenceImageId)]
        : [])
    };
    const resolved = adapter.resolveRequest(provider, request);
    return { ...task, size: resolved.requestSize };
  }

  private async runGenerationJob(jobId: string) {
    const job = this.generationJobsRepository.getById(jobId);
    if (!job) return { outcome: "failed" as const };
    const task = this.tasksRepository.getById(job.task_id) as TaskRecord | undefined;
    if (!task) return { outcome: "failed" as const };

    let stage = "submission";
    try {
      const provider = this.resolveProviderForJob(job);
      const adapter = this.adapterRegistry.require(provider.protocolType);
      const request = this.adapterRequest(task);
      const capability = adapter.capabilities(provider, job.mode)
        .find((item) => item.value === task.model);
      if (!capability) throw new Error(`当前中转站不支持模型 ${task.model}`);
      const resolved = adapter.resolveRequest(provider, request);
      const canRecover = Boolean(
        (job.remote_task_id || job.remote_result_url)
        && job.provider_id === provider.id
        && job.provider_revision === provider.configRevision
      );
      if (!canRecover) this.generationJobsRepository.clearProviderBinding(job.id);
      this.generationJobsRepository.bindProvider(job.id, {
        providerId: provider.id,
        providerRevision: provider.configRevision,
        protocolType: provider.protocolType,
        requestedSize: resolved.requestSize
      });
      const attemptCount = this.generationJobsRepository.startAttempt(job.id);
      this.generationJobsRepository.updateState(job.id, {
        status: "submitting",
        errorStage: null,
        errorMessage: null
      });
      this.tasksRepository.updateState(task.id, { status: "running", errorMessage: null });

      const onRemoteReference = (remote: { taskId?: string; resultUrl?: string }) => {
        if (remote.taskId) {
          stage = "polling";
          this.generationJobsRepository.updateState(job.id, {
            status: "remote_queued",
            remoteTaskId: remote.taskId
          });
        }
        if (remote.resultUrl) {
          stage = "download";
          this.generationJobsRepository.updateState(job.id, {
            status: "downloading",
            remoteResultUrl: remote.resultUrl
          });
        }
      };
      const image = canRecover
        ? await adapter.recover(provider, request, {
            taskId: job.remote_task_id ?? undefined,
            resultUrl: job.remote_result_url ?? undefined
          }, onRemoteReference)
        : await adapter.generate(provider, request, onRemoteReference);

      stage = "validation";
      const { dimensions, dimensionError } = await this.validateJobImage(task.id, image.buffer, resolved.expectedDimensions);

      const extension = image.mimeType === "image/jpeg"
        ? ".jpg"
        : image.mimeType === "image/webp"
          ? ".webp"
          : ".png";
      const filename = `${task.id}-${job.output_index}-attempt-${attemptCount}${extension}`;
      const localPath = this.fileStorage.writeGeneratedJobImage(task.batch_id, filename, image.buffer);
      this.db.transaction(() => {
        const savedImage = this.generatedImagesRepository.create({
          batchId: task.batch_id,
          taskId: task.id,
          filename,
          localPath,
          mimeType: image.mimeType
        });
        this.imageJobResults.create({ imageId: savedImage.id, jobId: job.id, attemptNumber: attemptCount, validationStatus: dimensionError ? "invalid" : dimensions ? "valid" : "unverified", actualWidth: dimensions?.width ?? null, actualHeight: dimensions?.height ?? null });
      })();

      if (dimensionError) {
        this.generationJobsRepository.updateState(job.id, {
          status: "failed",
          actualWidth: dimensions?.width ?? null,
          actualHeight: dimensions?.height ?? null,
          errorStage: "validation",
          errorMessage: dimensionError
        });
        this.refreshTaskFromJobs(task.id, task.batch_id);
        return { outcome: "failed" as const };
      }

      this.generationJobsRepository.updateState(job.id, {
        status: "completed",
        actualWidth: dimensions?.width ?? null,
        actualHeight: dimensions?.height ?? null,
        errorStage: null,
        errorMessage: null
      });
      this.refreshTaskFromJobs(task.id, task.batch_id);
      return { outcome: "completed" as const };
    } catch (error) {
      this.generationJobsRepository.updateState(job.id, {
        status: error instanceof UnknownSubmissionError ? "unknown" : "failed",
        errorStage: error instanceof RemoteGenerationFailedError ? "remote_failure" : stage,
        errorMessage: error instanceof Error ? error.message : "未知错误"
      });
      this.refreshTaskFromJobs(task.id, task.batch_id);
      return { outcome: "failed" as const };
    }
  }

  private async validateJobImage(taskId: string, buffer: Buffer, expected?: { width: number; height: number }) {
    let dimensions: { width: number; height: number } | null = null;
    let dimensionError: string | null = null;
    try { dimensions = readImageDimensions(buffer); }
    catch (error) {
      if (expected) dimensionError = error instanceof Error ? error.message : "无法识别返回图片尺寸";
    }
    if (dimensions && expected && !imageDimensionsMatch(dimensions, expected)) {
      dimensionError = `返回尺寸 ${dimensions.width}x${dimensions.height}，预期 ${expected.width}x${expected.height}`;
    }
    const pageLink = this.coursewareService.links.get(taskId);
    if (pageLink?.purpose === "textless" && pageLink.sourceImageId) {
      const source = this.coursewareService.image(pageLink.sourceImageId);
      if (!source || !dimensions) dimensionError = "无法验证去字图片或源图尺寸";
      else {
        try {
          const original = await sharp(this.fileStorage.readFile(source.local_path), { failOn: "warning" }).rotate().raw().toBuffer({ resolveWithObject: true });
          const output = await sharp(buffer, { failOn: "warning" }).rotate().raw().toBuffer({ resolveWithObject: true });
          if (!imageAspectRatiosMatch(original.info, output.info)) dimensionError = "去字结果与源图比例不同";
        } catch { dimensionError = "无法完整解码去字结果或源图"; }
      }
    }
    return { dimensions, dimensionError };
  }

  private refreshTaskFromJobs(taskId: string, batchId: string) {
    const jobs = this.generationJobsRepository.listByTaskId(taskId);
    const active = jobs.filter((job) => ["queued", "submitting", "remote_queued", "downloading"].includes(job.status));
    if (active.length > 0) {
      this.tasksRepository.updateState(taskId, {
        status: active.some((job) => job.status !== "queued") ? "running" : "queued"
      });
    } else if (jobs.length > 0 && jobs.every((job) => job.status === "completed")) {
      this.tasksRepository.updateState(taskId, { status: "completed", errorMessage: null });
    } else {
      const terminalError = [...jobs].reverse().find((job) => job.error_message);
      this.tasksRepository.updateState(taskId, {
        status: "failed",
        errorMessage: terminalError?.error_message ?? "生图失败"
      });
    }
    this.refreshBatchStats(batchId, "running");
  }

  private ensureGenerationJobsForRetry(task: TaskRecord) {
    if (this.generationJobsRepository.listByTaskId(task.id).length > 0) return;
    const existingImages = this.generatedImagesRepository.listByTaskId(task.id) as unknown[];
    const missingCount = Math.max(0, task.n - existingImages.length);
    if (missingCount === 0) return;
    const jobs = this.generationJobsRepository.createMissingForLegacyTask({
      taskId: task.id,
      firstOutputIndex: existingImages.length + 1,
      count: missingCount,
      mode: task.reference_image_id ? "image" : "text"
    });
    for (const job of jobs) {
      this.generationJobsRepository.updateState(job.id, {
        status: "failed",
        errorMessage: task.error_message ?? "旧任务待重试"
      });
    }
    if (task.remote_task_id && jobs.length === 1) {
      const snapshot = this.getBatchProviderSnapshot(task.batch_id);
      const providerId = snapshot.providerId ?? ENV_PROVIDER_ID;
      try {
        const provider = this.providerSettingsService.getConfiguredProvider(providerId);
        const revisionMatches = providerId === ENV_PROVIDER_ID
          || snapshot.providerRevision === provider.configRevision;
        if (revisionMatches) {
          this.generationJobsRepository.bindProvider(jobs[0].id, {
            providerId: provider.id,
            providerRevision: provider.configRevision,
            protocolType: provider.protocolType,
            requestedSize: task.size
          });
          this.generationJobsRepository.updateState(jobs[0].id, {
            status: "failed",
            remoteTaskId: task.remote_task_id,
            errorMessage: task.error_message
          });
        }
      } catch {
        return;
      }
    }
  }

  getProviderSettingsService() {
    return this.providerSettingsService;
  }

  private getBatchProviderSnapshot(batchId: string): BatchProviderSnapshot {
    const batch = this.batchesRepository.getById(batchId) as { settings_snapshot?: unknown } | undefined;
    if (!batch || typeof batch.settings_snapshot !== "string") {
      return { providerId: null, providerRevision: null };
    }
    try {
      const parsed = JSON.parse(batch.settings_snapshot) as Record<string, unknown>;
      return {
        providerId: typeof parsed.providerId === "string" ? parsed.providerId : null,
        providerRevision: typeof parsed.providerRevision === "string" ? parsed.providerRevision : null
      };
    } catch {
      return { providerId: null, providerRevision: null };
    }
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
