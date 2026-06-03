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
      maxConcurrency: 30,
      maxBatchSize: 100
    });
    expect(response.json().models[0]).toMatchObject({
      value: "gpt-image-2",
      label: "gpt-image-2（普通渠道，3 积分/张）",
      aspectRatios: expect.arrayContaining(["16:9"]),
      resolutions: expect.arrayContaining(["1K"])
    });
    expect(response.json().models[1]).toMatchObject({
      value: "gpt-image-1.5-official",
      label: "gpt-image-2-official（官方渠道，44 积分/张）"
    });

    await app.close();
  });
});
