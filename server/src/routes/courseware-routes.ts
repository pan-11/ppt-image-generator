import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { BatchService } from "../services/batch-service.js";
import { CoursewareError } from "../services/courseware-service.js";
import { createImagePptx } from "../lib/pptx-service.js";

const page = z.object({ id: z.string().min(1), position: z.number().int().nonnegative(), sourcePageNumber: z.string(), sourcePageName: z.string(), included: z.boolean(), selectedImageId: z.string().nullable(), draft: z.object({ prompt: z.string(), note: z.string(), model: z.string(), aspectRatio: z.string(), resolution: z.string(), n: z.number().int().min(1), referenceMode: z.enum(["none", "global", "row"]), referenceImageId: z.string().nullable() }) });
const mutable = z.object({ name: z.string().min(1), globalReferenceImageId: z.string().nullable().default(null), pages: z.array(page) });
const create = mutable.extend({ sourceKind: z.enum(["import", "manual", "history", "legacy-session"]), rawImportText: z.string().nullable(), importMode: z.enum(["structured", "lines"]).nullable(), legacyBatchId: z.null().optional() });
const selection = z.object({ expectedRevision: z.number().int().nonnegative(), pageIds: z.array(z.string()).max(100) });
async function handle(reply: FastifyReply, action: () => unknown) {
  try { return await action(); }
  catch (error) {
    if (error instanceof CoursewareError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    if (error instanceof z.ZodError) return reply.code(400).send({ code: "INVALID_REQUEST", message: "请求字段不完整或格式错误" });
    throw error;
  }
}
function download(reply: FastifyReply, buffer: Buffer, filename: string) { return reply.type("application/vnd.openxmlformats-officedocument.presentationml.presentation").header("Content-Disposition", `attachment; filename="${filename}"`).send(buffer); }
export function registerCoursewareRoutes(app: FastifyInstance, batches: BatchService) {
  const service = batches.getCoursewareService();
  const textless = batches.getTextlessService();
  app.get("/api/coursewares", async () => ({ coursewares: service.records.list() }));
  app.put<{ Params: { id: string } }>("/api/coursewares/:id", { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => handle(reply, () => service.create({ ...create.parse(request.body), id: request.params.id, legacyBatchId: null, revision: 0 })));
  app.get<{ Params: { id: string } }>("/api/coursewares/:id", async (request, reply) => handle(reply, () => service.detail(request.params.id)));
  app.patch<{ Params: { id: string } }>("/api/coursewares/:id", { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => handle(reply, () => service.update(request.params.id, mutable.extend({ expectedRevision: z.number().int().nonnegative() }).strict().parse(request.body))));
  app.post<{ Params: { batchId: string } }>("/api/coursewares/from-history/:batchId", async (request, reply) => handle(reply, () => service.fromHistory(request.params.batchId).courseware));
  app.post<{ Params: { id: string } }>("/api/coursewares/:id/export-pptx", async (request, reply) => handle(reply, async () => {
    const input = selection.parse(request.body);
    const selected = service.selected(request.params.id, input.expectedRevision, input.pageIds);
    const buffer = await createImagePptx(selected.map(({ page, image }) => ({ path: image.local_path, label: `第 ${page.position + 1} 页` })));
    return download(reply, buffer, "courseware-final.pptx");
  }));
  app.post<{ Params: { id: string } }>("/api/coursewares/:id/textless-runs", async (request, reply) => handle(reply, () => textless.create(request.params.id, selection.extend({ requestId: z.string().min(1), model: z.string().min(1), regenerate: z.boolean().default(false) }).parse(request.body))));
  app.get<{ Params: { id: string } }>("/api/coursewares/:id/textless-runs", async (request, reply) => handle(reply, () => { service.require(request.params.id); return { runs: textless.runs.list(request.params.id) }; }));
  app.get<{ Params: { runId: string } }>("/api/textless-runs/:runId", async (request, reply) => handle(reply, () => textless.detail(request.params.runId)));
  app.post<{ Params: { runId: string } }>("/api/textless-runs/:runId/export-pptx", async (request, reply) => handle(reply, async () => { const { variant } = z.object({ variant: z.enum(["final", "textless"]) }).parse(request.body); return download(reply, await textless.export(request.params.runId, variant), `courseware-${variant}.pptx`); }));
}
