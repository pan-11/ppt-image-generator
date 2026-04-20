import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = await buildApp({
      envOverrides: {
        TOAPIS_API_KEY: "test-key"
      },
      backgroundProcessing: false
    });
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
