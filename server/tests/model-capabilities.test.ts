import { describe, expect, it } from "vitest";
import { modelCapabilities, resolveTaskRequest } from "../src/config/model-capabilities.js";

describe("model capabilities", () => {
  it("keeps gemini 3.1 preview and official as two distinct request models", () => {
    expect(modelCapabilities["gemini-3.1-flash-image-preview"]?.requestModel).toBe("gemini-3.1-flash-image-preview");
    expect(modelCapabilities["gemini-3.1-flash-image-preview-official"]?.requestModel).toBe("gemini-3.1-flash-image-preview-official");

    expect(resolveTaskRequest({
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "16:9",
      resolution: "1K",
      n: 1,
      hasReferenceImage: false
    }).requestModel).toBe("gemini-3.1-flash-image-preview");

    expect(resolveTaskRequest({
      model: "gemini-3.1-flash-image-preview-official",
      aspectRatio: "16:9",
      resolution: "1K",
      n: 1,
      hasReferenceImage: false
    }).requestModel).toBe("gemini-3.1-flash-image-preview-official");
  });

  it("exposes gpt-image-2 as its own request model", () => {
    expect(modelCapabilities["gpt-image-2"]?.requestModel).toBe("gpt-image-2");

    expect(resolveTaskRequest({
      model: "gpt-image-2",
      aspectRatio: "1:1",
      resolution: "1K",
      n: 1,
      hasReferenceImage: false
    }).requestModel).toBe("gpt-image-2");

    expect(resolveTaskRequest({
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "4K",
      n: 1,
      hasReferenceImage: false
    })).toMatchObject({
      requestModel: "gpt-image-2",
      size: "16:9",
      resolution: "4k"
    });

    expect(() => resolveTaskRequest({
      model: "gpt-image-2",
      aspectRatio: "1:1",
      resolution: "4K",
      n: 1,
      hasReferenceImage: false
    })).toThrow(/does not support 1:1 at 4K/i);
  });

  it("keeps gpt-image-1.5-official as a distinct official model", () => {
    expect(modelCapabilities["gpt-image-1.5-official"]?.requestModel).toBe("gpt-image-1.5-official");

    expect(resolveTaskRequest({
      model: "gpt-image-1.5-official",
      aspectRatio: "16:9",
      resolution: "4K",
      n: 1,
      hasReferenceImage: false
    })).toMatchObject({
      requestModel: "gpt-image-1.5-official",
      size: "16:9",
      resolution: "4k"
    });
  });
});
