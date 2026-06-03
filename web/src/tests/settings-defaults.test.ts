import { afterEach, describe, expect, it } from "vitest";
import { fallbackSettings } from "../hooks/use-settings";
import { loadPreferences } from "../lib/preferences";

afterEach(() => {
  window.localStorage.clear();
});

describe("settings defaults", () => {
  it("uses gpt-image-2 as the first fallback model and first-load default", () => {
    expect(fallbackSettings.models[0]?.value).toBe("gpt-image-2");
    expect(fallbackSettings.models[0]?.label).toBe("gpt-image-2（普通渠道，3 积分/张）");

    const loaded = loadPreferences(fallbackSettings.models);
    expect(loaded.defaults.model).toBe("gpt-image-2");
    expect(loaded.defaults.aspectRatio).toBe("16:9");
    expect(loaded.defaults.resolution).toBe("1K");
  });
});
