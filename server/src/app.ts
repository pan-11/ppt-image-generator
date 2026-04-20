import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerBatchRoutes } from "./routes/batch-routes.js";
import { registerDownloadRoutes } from "./routes/download-routes.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerHistoryRoutes } from "./routes/history-routes.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import { createBatchService } from "./services/batch-service.js";

export async function buildApp(options?: {
  envOverrides?: Partial<NodeJS.ProcessEnv>;
  backgroundProcessing?: boolean;
}) {
  const app = Fastify({ logger: false });
  const batchService = createBatchService(options);

  await app.register(cors, { origin: true });
  await app.register(multipart);

  registerHealthRoutes(app);
  registerSettingsRoutes(app, batchService);
  registerBatchRoutes(app, batchService);
  registerHistoryRoutes(app, batchService);
  registerDownloadRoutes(app, batchService);

  app.addHook("onClose", async () => {
    await batchService.close();
  });

  return app;
}
