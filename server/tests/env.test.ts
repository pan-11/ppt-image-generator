import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("loadEnv", () => {
  it("reads the ToAPIs key and default concurrency", () => {
    const env = loadEnv({
      TOAPIS_API_KEY: "test-key",
      APP_DATA_DIR: "tmp/app-data"
    });

    expect(env.toapisApiKey).toBe("test-key");
    expect(env.maxConcurrency).toBe(30);
    expect(env.maxBatchSize).toBe(100);
    expect(env.appDataDir).toContain("tmp/app-data");
  });
});
