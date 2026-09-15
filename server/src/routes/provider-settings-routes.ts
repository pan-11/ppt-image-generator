import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProviderSettingsError,
  type ProviderSettingsService
} from "../services/provider-settings-service-v2.js";

const providerFields = {
  name: z.string().trim().min(1, "请填写中转站名称"),
  baseUrl: z.string().trim().url("请填写有效的 Base URL"),
  protocolType: z.enum([
    "toapis-async",
    "ym2-openai-images",
    "yunfei-hybrid-images",
    "grsai-draw",
    "cangyuan-images"
  ]).default("toapis-async"),
  yunfeiKeyType: z.enum([
    "gpt-image-2-1k",
    "gpt-image-2-4k",
    "banana-2",
    "banana-pro"
  ]).optional(),
  maxConcurrency: z.coerce.number().int().min(1).default(30),
  notes: z.string().max(2000, "备注不能超过 2000 个字符").optional()
};

function requireYunfeiKeyType(
  value: { protocolType: string; yunfeiKeyType?: string },
  context: z.RefinementCtx
) {
  if (value.protocolType === "yunfei-hybrid-images" && !value.yunfeiKeyType) {
    context.addIssue({
      code: "custom",
      path: ["yunfeiKeyType"],
      message: "请选择云飞密钥类型"
    });
  }
}

const createProviderSchema = z.object({
  ...providerFields,
  apiKey: z.string().trim().min(1, "请填写 API Key")
}).superRefine(requireYunfeiKeyType);

const updateProviderSchema = z.object({
  ...providerFields,
  apiKey: z.string().optional()
}).superRefine(requireYunfeiKeyType);

function handleError(reply: { code(statusCode: number): unknown }, error: unknown) {
  const statusCode = error instanceof ProviderSettingsError ? error.statusCode : 400;
  reply.code(statusCode);
  if (error instanceof z.ZodError) {
    return { message: error.issues[0]?.message ?? "请求失败" };
  }
  return { message: error instanceof Error ? error.message : "请求失败" };
}

export function registerProviderSettingsRoutes(
  app: FastifyInstance,
  providerSettingsService: ProviderSettingsService
) {
  app.get("/api/provider-settings", async () => providerSettingsService.getPublicState());

  app.post("/api/provider-settings", async (request, reply) => {
    try {
      const payload = createProviderSchema.parse(request.body);
      reply.code(201);
      return providerSettingsService.saveProvider(payload);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.put("/api/provider-settings/:providerId", async (request, reply) => {
    try {
      const { providerId } = request.params as { providerId: string };
      const payload = updateProviderSchema.parse(request.body);
      return providerSettingsService.saveProvider({ id: providerId, ...payload });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/api/provider-settings/roles/:role", async (request, reply) => {
    try {
      const { role } = z.object({ role: z.enum(["text", "image"]) }).parse(request.params);
      const { providerId } = z.object({ providerId: z.string().min(1) }).parse(request.body);
      return providerSettingsService.setRoleProvider(role, providerId);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
