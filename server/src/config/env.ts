import { z } from "zod";

const envSchema = z.object({
  TOAPIS_API_KEY: z.string().min(1),
  APP_DATA_DIR: z.string().default("app-data"),
  PORT: z.coerce.number().int().positive().default(3017),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(5),
  MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(50)
});

export type AppEnv = {
  toapisApiKey: string;
  appDataDir: string;
  port: number;
  maxConcurrency: number;
  maxBatchSize: number;
};

export function loadEnv(input: Partial<NodeJS.ProcessEnv>): AppEnv {
  const parsed = envSchema.parse(input);

  return {
    toapisApiKey: parsed.TOAPIS_API_KEY,
    appDataDir: parsed.APP_DATA_DIR,
    port: parsed.PORT,
    maxConcurrency: parsed.MAX_CONCURRENCY,
    maxBatchSize: parsed.MAX_BATCH_SIZE
  };
}
