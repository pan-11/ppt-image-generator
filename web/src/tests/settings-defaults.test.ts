import { afterEach, describe, expect, it } from "vitest";
import { fallbackSettings } from "../hooks/use-settings";
import { roleForDraft, validateDraftForRole } from "../lib/model-options";
import { loadPreferences } from "../lib/preferences";

afterEach(() => {
  window.localStorage.clear();
});

describe("settings defaults", () => {
  it("blocks unsupported reference inputs while allowing the same text-only model without a reference", () => {
    const role = { ...fallbackSettings.roles.image, models: fallbackSettings.roles.image.models.map(model => ({ ...model, supportsReferenceImages: false })) };
    const model = role.models[0];
    const draft = { model: model.value, aspectRatio: model.aspectRatios[0], resolution: model.resolutions[0], n: 1 };
    expect(validateDraftForRole(draft, role, true)).toContain("不支持参考图");
    expect(validateDraftForRole(draft, role, false)).toBeNull();
  });
  it("uses gpt-image-2 as the first fallback model and first-load default", () => {
    expect(fallbackSettings.roles.text.models[0]?.value).toBe("gpt-image-2");
    expect(fallbackSettings.roles.text.models[0]?.label).toBe("gpt-image-2（普通渠道，3 积分/张）");

    const loaded = loadPreferences(fallbackSettings.roles.text.models);
    expect(loaded.defaults.model).toBe("gpt-image-2");
    expect(loaded.defaults.aspectRatio).toBe("16:9");
    expect(loaded.defaults.resolution).toBe("1K");
  });

  it("chooses the image role only when the selected reference actually exists", () => {
    const draft = {
      id: "row-1",
      prompt: "scene",
      note: "",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "2K",
      n: 1,
      referenceMode: "global" as const,
      referenceImageId: null
    };

    expect(roleForDraft(draft, null)).toBe("text");
    expect(roleForDraft(draft, "global-reference")).toBe("image");
    expect(roleForDraft({ ...draft, referenceMode: "row", referenceImageId: "row-reference" }, null))
      .toBe("image");
  });

  it("reports unsupported values without normalizing the draft", () => {
    const draft = {
      id: "row-1",
      prompt: "scene",
      note: "",
      model: "gpt-image-2",
      aspectRatio: "4:3",
      resolution: "2K",
      n: 1,
      referenceMode: "none" as const,
      referenceImageId: null
    };
    const role = {
      providerId: "ym2",
      providerName: "YM2",
      protocolType: "ym2-openai-images" as const,
      maxConcurrency: 100,
      models: [{
        value: "gpt-image-2",
        label: "gpt-image-2（YM2）",
        aspectRatios: ["16:9"],
        resolutions: ["1K", "2K", "4K"],
        supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
        maxN: 10,
        supportsReferenceImages: true
      }]
    };

    expect(validateDraftForRole(draft, role)).toBe("当前YM2不支持比例 4:3");
    expect(draft).toMatchObject({ aspectRatio: "4:3", resolution: "2K" });
  });

  it("blocks a restored 4K value for a Yunfei 1K provider without rewriting it", () => {
    const draft = {
      id: "row-yunfei",
      prompt: "scene",
      note: "",
      model: "gpt-image-2",
      aspectRatio: "16:9",
      resolution: "4K",
      n: 1,
      referenceMode: "none" as const,
      referenceImageId: null
    };
    const role = {
      providerId: "yunfei-1k",
      providerName: "云飞 1K",
      protocolType: "yunfei-hybrid-images" as const,
      maxConcurrency: 100,
      models: [{
        value: "gpt-image-2",
        label: "gpt-image-2（云飞）",
        aspectRatios: ["16:9"],
        resolutions: ["1K"],
        supportedResolutionsByAspectRatio: { "16:9": ["1K"] },
        maxN: 10,
        supportsReferenceImages: true
      }]
    };

    expect(validateDraftForRole(draft, role)).toBe("当前云飞 1K不支持分辨率 4K");
    expect(draft.resolution).toBe("4K");
  });

  it("accepts 4K for a Yunfei Banana 2 provider", () => {
    const draft = {
      id: "row-banana-2",
      prompt: "scene",
      note: "",
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "16:9",
      resolution: "4K",
      n: 1,
      referenceMode: "none" as const,
      referenceImageId: null
    };
    const role = {
      providerId: "yunfei-banana-2",
      providerName: "云飞 香蕉2",
      protocolType: "yunfei-hybrid-images" as const,
      maxConcurrency: 100,
      models: [{
        value: "gemini-3.1-flash-image-preview",
        label: "Nano Banana 2",
        aspectRatios: ["16:9"],
        resolutions: ["1K", "2K", "4K"],
        supportedResolutionsByAspectRatio: { "16:9": ["1K", "2K", "4K"] },
        maxN: 10,
        supportsReferenceImages: true
      }]
    };

    expect(validateDraftForRole(draft, role)).toBeNull();
    expect(draft.resolution).toBe("4K");
  });
});
