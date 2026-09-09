// Local acceptance harness: every image call is simulated and uses a temporary database.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";
import type { ProviderAdapter } from "../src/providers/provider-adapter.js";

const directory = mkdtempSync(join(tmpdir(), "courseware-browser-"));
const calls: { prompt: string; references: number }[] = [];
const adapter: ProviderAdapter = {
  protocolType: "toapis-async",
  capabilities: () => [{ value: "gpt-image-2", label: "Mock image model", aspectRatios: ["16:9"], resolutions: ["1K"], maxN: 4, supportsReferenceImages: true }],
  resolveRequest: () => ({ requestSize: "1280x720", expectedDimensions: { width: 1280, height: 720 } }),
  generate: async (_provider, request) => {
    calls.push({ prompt: request.prompt, references: request.references.length });
    await new Promise((done) => setTimeout(done, 150));
    return { buffer: await sharp({ create: { width: 1280, height: 720, channels: 3, background: request.references.length ? "#b7d8c3" : "#c3d6ed" } }).png().toBuffer(), mimeType: "image/png" };
  },
  recover: async () => { throw new Error("The browser harness never uses remote recovery"); }
};
const app = await buildApp({ envOverrides: { APP_DATA_DIR: directory, TOAPIS_API_KEY: "mock-only", PORT: "3019" }, adapterRegistry: new ProviderAdapterRegistry([adapter]) });
const dist = resolve("web/dist");
app.get("/__qa/calls", async () => calls);
app.get("/*", async (request, reply) => {
  const requested = resolve(dist, `.${request.url.split("?")[0]}`);
  const target = requested.startsWith(`${dist}/`) || requested.startsWith(`${dist}\\`) ? requested : join(dist, "index.html");
  const file = existsSync(target) && extname(target) ? target : join(dist, "index.html");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  return reply.type(types[extname(file)] ?? "application/octet-stream").send(readFileSync(file));
});
await app.listen({ host: "127.0.0.1", port: 3019 });
console.log("Mock courseware acceptance server listening on http://127.0.0.1:3019");
process.on("SIGINT", () => { void app.close().then(() => process.exit(0)); });
