import type { FastifyInstance } from "fastify";
import type { BatchService } from "../services/batch-service.js";

export function registerHistoryRoutes(app: FastifyInstance, batchService: BatchService) {
  app.get("/api/history", async (request) => {
    const query = request.query as { q?: string; model?: string; date?: string };
    return batchService.listHistory(query);
  });

  app.delete("/api/history/batches/:batchId", async (request) => {
    const { batchId } = request.params as { batchId: string };
    return batchService.deleteBatch(batchId);
  });

  app.delete("/api/history/images/:imageId", async (request) => {
    const { imageId } = request.params as { imageId: string };
    return batchService.deleteImage(imageId);
  });

  app.post("/api/history/batches/:batchId/export", async (request) => {
    const { batchId } = request.params as { batchId: string };
    const payload = request.body as { destinationDir: string };
    return batchService.exportBatchImages({
      batchId,
      destinationDir: payload.destinationDir
    });
  });
}
