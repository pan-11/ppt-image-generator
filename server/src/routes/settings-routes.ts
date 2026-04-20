import type { FastifyInstance } from "fastify";
import type { BatchService } from "../services/batch-service.js";

export function registerSettingsRoutes(app: FastifyInstance, batchService: BatchService) {
  app.get("/api/settings", async () => batchService.getSettings());
}
