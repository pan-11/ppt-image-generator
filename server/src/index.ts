import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv(process.env);
const app = await buildApp();

try {
  await app.listen({ host: "127.0.0.1", port: env.port });
  console.log(`Server listening on http://127.0.0.1:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
