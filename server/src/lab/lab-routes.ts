import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ProviderLabService } from "./provider-lab-service.js";

const providerSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  apiKey: z.string().optional(),
  notes: z.string().max(2000).optional(),
  enabled: z.boolean().optional()
});

const benchmarkSchema = z.object({
  providerId: z.string().uuid(),
  prompt: z.string().trim().min(1),
  model: z.string().trim().min(1),
  aspectRatio: z.string().trim().min(1),
  resolution: z.string().trim().min(1)
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

async function parseBenchmarkRequest(request: FastifyRequest) {
  if (!request.isMultipart()) {
    return { payload: benchmarkSchema.parse(request.body), referenceImage: undefined };
  }

  const fields: Record<string, string> = {};
  let referenceImage: { filename: string; mimeType: string; buffer: Buffer } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      if (part.fieldname === "referenceImage") {
        if (!part.mimetype.startsWith("image/")) {
          throw new Error("参考图必须是图片文件");
        }
        referenceImage = { filename: part.filename, mimeType: part.mimetype, buffer };
      }
      continue;
    }
    fields[part.fieldname] = String(part.value);
  }

  return { payload: benchmarkSchema.parse(fields), referenceImage };
}

export function registerLabRoutes(app: FastifyInstance, labService: ProviderLabService) {
  app.get("/api/lab/providers", async () => labService.listProviders());

  app.post("/api/lab/providers", async (request, reply) => {
    try {
      const payload = providerSchema.extend({ apiKey: z.string().trim().min(1) }).parse(request.body);
      reply.code(201);
      return labService.saveProvider(payload);
    } catch (error) {
      reply.code(400);
      return { message: errorMessage(error) };
    }
  });

  app.put("/api/lab/providers/:providerId", async (request, reply) => {
    try {
      const { providerId } = request.params as { providerId: string };
      const payload = providerSchema.parse(request.body);
      return labService.saveProvider({ id: providerId, ...payload });
    } catch (error) {
      reply.code(400);
      return { message: errorMessage(error) };
    }
  });

  app.post("/api/lab/providers/:providerId/check", async (request, reply) => {
    try {
      const { providerId } = request.params as { providerId: string };
      return await labService.checkProvider(providerId);
    } catch (error) {
      reply.code(400);
      return { message: errorMessage(error) };
    }
  });

  app.get("/api/lab/benchmarks", async () => labService.listBenchmarks());

  app.post("/api/lab/benchmarks", async (request, reply) => {
    try {
      const { payload, referenceImage } = await parseBenchmarkRequest(request);
      const result = await labService.runBenchmark({ ...payload, referenceImage });
      reply.code(201);
      return result;
    } catch (error) {
      const message = errorMessage(error);
      reply.code(message.includes("正在运行") ? 409 : 400);
      return { message };
    }
  });

  app.get("/api/lab/benchmarks/:runId/image", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const image = labService.getBenchmarkImage(runId);
    if (!image) {
      reply.code(404);
      return { message: "测试图片不存在" };
    }
    reply.type(image.mimeType);
    return reply.send(image.buffer);
  });
}
