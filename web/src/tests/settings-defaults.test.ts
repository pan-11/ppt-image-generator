import { describe, expect, it } from "vitest";
import { fallbackSettings } from "../hooks/use-settings";
import { loadPreferences } from "../lib/preferences";

describe("settings defaults", () => {
  it("uses gpt-image-2 as the first fallback model and first-load default", () => {
    expect(fallbackSettings.models[0]?.value).toBe("gpt-image-2");

    const loaded = loadPreferences(fallbackSettings.models);
    expect(loaded.defaults.model).toBe("gpt-image-2");
  });
});
