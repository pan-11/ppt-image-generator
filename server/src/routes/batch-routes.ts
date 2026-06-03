import type { FastifyInstance } from "fastify";
import type { BatchService } from "../services/batch-service.js";

export function registerBatchRoutes(app: FastifyInstance, batchService: BatchService) {
  app.get("/api/batches/:batchId", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return batchService.getBatch(batchId);
  });

  app.post("/api/batches", async (request, reply) => {
    const payload = request.body as {
      name: string;
      tasks: Array<{
        prompt: string;
        model: string;
        aspectRatio: string;
        resolution: string;
        size: string;
        n: number;
        referenceMode: string;
        referenceImageId: string | null;
      }>;
    };

    const created = batchService.createBatch(payload);
    reply.code(201);
    return created;
  });

  app.post("/api/batches/:batchId/pause", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return batchService.pauseBatch(batchId);
  });

  app.post("/api/batches/:batchId/resume", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return batchService.resumeBatch(batchId);
  });

  app.post("/api/tasks/retry", async (request) => {
    const payload = request.body as { taskIds: string[] };
    return batchService.retryTasks(payload.taskIds);
  });

  app.post("/api/images/:imageId/children", async (request, reply) => {
    const { imageId } = request.params as { imageId: string };
    const payload = request.body as {
      tasks: Array<{
        prompt: string;
        model: string;
        aspectRatio: string;
        resolution: string;
        size: string;
        n: number;
      }>;
    };

    const created = batchService.createChildTasksFromImage({
      parentImageId: imageId,
      tasks: payload.tasks.map((task) => ({
        ...task,
        referenceMode: "row",
        referenceImageId: null
      }))
    });
    reply.code(201);
    return created;
  });

  app.post("/api/reference-images", async (request, reply) => {
    const file = await request.file();

    if (!file) {
      reply.code(400);
      return { message: "缺少参考图文件" };
    }

    const buffer = await file.toBuffer();
    const record = batchService.createReferenceImage({
      filename: file.filename,
      mimeType: file.mimetype,
      buffer
    });

    reply.code(201);
    return record;
  });
}
