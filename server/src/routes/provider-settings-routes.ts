import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProviderSettingsError,
  type ProviderSettingsService
} from "../services/provider-settings-service.js";

const providerSchema = z.object({
  name: z.string().trim().min(1, "请填写中转站名称"),
  baseUrl: z.string().trim().url("请填写有效的 Base URL"),
  apiKey: z.string().optional(),
  notes: z.string().max(2000, "备注不能超过 2000 个字符").optional()
});

function handleError(reply: { code(statusCode: number): unknown }, error: unknown) {
  const statusCode = error instanceof ProviderSettingsError ? error.statusCode : 400;
  reply.code(statusCode);
  return { message: error instanceof Error ? error.message : "请求失败" };
}

export function registerProviderSettingsRoutes(
  app: FastifyInstance,
  providerSettingsService: ProviderSettingsService
) {
  app.get("/api/provider-settings", async () => providerSettingsService.getPublicState());

  app.post("/api/provider-settings", async (request, reply) => {
    try {
      const payload = providerSchema.extend({
        apiKey: z.string().trim().min(1, "请填写 API Key")
      }).parse(request.body);
      reply.code(201);
      return providerSettingsService.saveProvider(payload);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.put("/api/provider-settings/:providerId", async (request, reply) => {
    try {
      const { providerId } = request.params as { providerId: string };
      const payload = providerSchema.parse(request.body);
      return providerSettingsService.saveProvider({ id: providerId, ...payload });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/api/provider-settings/:providerId/activate", async (request, reply) => {
    try {
      const { providerId } = request.params as { providerId: string };
      return providerSettingsService.activateProvider(providerId);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
