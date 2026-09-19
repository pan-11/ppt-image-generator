import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchServiceError, type BatchService } from "../services/batch-service.js";
import { MAX_UPLOAD_BYTES } from "../services/courseware-image-service.js";

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
        note?: string;
        model: string;
        aspectRatio: string;
        resolution: string;
        size: string;
        n: number;
        referenceMode: string;
        referenceImageId: string | null;
      }>;
    };

    const validated = z.object({
      name: z.string().min(1),
      coursewareId: z.string().min(1).optional(),
      tasks: z.array(z.object({
        pageId: z.string().min(1).optional(), prompt: z.string().min(1), note: z.string().optional(),
        model: z.string().min(1), aspectRatio: z.string().min(1), resolution: z.string().min(1),
        size: z.string(), n: z.number().int().min(1), referenceMode: z.string(), referenceImageId: z.string().nullable()
      })).min(1)
    }).safeParse(payload);
    if (!validated.success) return reply.code(400).send({ code: "INVALID_REQUEST", message: "生图任务字段不完整或格式错误" });
    const created = batchService.createBatch(validated.data);
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

  app.post("/api/tasks/retry", async (request, reply) => {
    const payload = request.body as { taskIds: string[]; confirmUnknown?: boolean };
    try {
      return batchService.retryTasks(payload.taskIds, {
        confirmUnknown: payload.confirmUnknown
      });
    } catch (error) {
      if (error instanceof BatchServiceError) {
        reply.code(error.statusCode);
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  });

  app.post("/api/images/:imageId/children", async (request, reply) => {
    const { imageId } = request.params as { imageId: string };
    const payload = z.object({ tasks: z.array(z.object({ prompt: z.string().min(1), note: z.string().optional(), model: z.string().min(1), aspectRatio: z.string().min(1), resolution: z.string().min(1), size: z.string(), n: z.number().int().min(1), auxiliaryReferenceImageId: z.string().min(1).nullable().optional() })).min(1) }).safeParse(request.body);
    if (!payload.success) return reply.code(400).send({ code: "INVALID_REQUEST", message: "修改任务字段不完整或格式错误" });

    const created = batchService.createChildTasksFromImage({
      parentImageId: imageId,
      tasks: payload.data.tasks.map((task) => ({
        ...task,
        referenceMode: "row",
        referenceImageId: null
      }))
    });
    reply.code(201);
    return created;
  });

  app.post("/api/reference-images", { bodyLimit: MAX_UPLOAD_BYTES + 64 * 1024 }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

    if (!file) {
      reply.code(400);
      return { message: "缺少参考图文件" };
    }

    const buffer = await file.toBuffer();
    const record = await batchService.getReferenceImageService().upload({
      filename: file.filename,
      mimeType: file.mimetype,
      buffer
    });

    reply.code(201);
    return record;
  });
  app.get<{ Params: { id: string } }>("/api/reference-images/:id", async request => batchService.getReferenceImageService().metadata(request.params.id));
  app.get<{ Params: { id: string } }>("/api/reference-images/:id/content", async (request, reply) => {
    const asset = batchService.getReferenceImageService().getLocalAsset(request.params.id);
    return reply.type(asset.mimeType).send(asset.buffer);
  });
}
