import type { FastifyInstance } from "fastify";
import type { BatchService } from "../services/batch-service.js";

export function registerDownloadRoutes(app: FastifyInstance, batchService: BatchService) {
  app.get("/api/download/images/:imageId", async (request, reply) => {
    const { imageId } = request.params as { imageId: string };
    const download = await batchService.downloadImage(imageId);
    reply.type(download.mimeType).header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`);
    return reply.send(download.stream);
  });

  app.get("/api/download/zip", async (request, reply) => {
    const query = request.query as { batchId?: string };
    const download = await batchService.downloadZip({ batchId: query.batchId });
    reply.header("Content-Disposition", `attachment; filename="${download.filename}"`);
    return reply.send(download.stream);
  });

  app.post("/api/download/zip", async (request, reply) => {
    const payload = request.body as { batchId?: string; imageIds?: string[] };
    const download = await batchService.downloadZip(payload);
    reply.header("Content-Disposition", `attachment; filename="${download.filename}"`);
    return reply.send(download.stream);
  });
}
