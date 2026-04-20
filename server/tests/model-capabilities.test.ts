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
});
