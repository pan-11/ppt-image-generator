import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("settings routes", () => {
  it("returns the current queue limits", async () => {
    const app = await buildApp({
      envOverrides: {
        TOAPIS_API_KEY: "test-key"
      },
      backgroundProcessing: false
    });

    const response = await app.inject({ method: "GET", url: "/api/settings" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      maxConcurrency: 5,
      maxBatchSize: 50
    });

    await app.close();
  });
});
