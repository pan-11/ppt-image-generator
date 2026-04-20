import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function parseEnvFile(content: string) {
  const parsed: Partial<NodeJS.ProcessEnv> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function readDotEnv() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env")
  ];

  for (const filename of candidates) {
    if (existsSync(filename)) {
      return parseEnvFile(readFileSync(filename, "utf8"));
    }
  }

  return {};
}

export function loadEnv(input: Partial<NodeJS.ProcessEnv>): AppEnv {
  const parsed = envSchema.parse({
    ...readDotEnv(),
    ...input
  });

  return {
    toapisApiKey: parsed.TOAPIS_API_KEY,
    appDataDir: parsed.APP_DATA_DIR,
    port: parsed.PORT,
    maxConcurrency: parsed.MAX_CONCURRENCY,
    maxBatchSize: parsed.MAX_BATCH_SIZE
  };
}
