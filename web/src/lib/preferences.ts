import type { DefaultsState, ModelOption } from "./types";
import { getResolutionsForAspectRatio } from "./model-options";

const PREFERENCES_KEY = "image-generator-preferences";

type StoredPreferences = {
  defaults?: Partial<DefaultsState>;
  exportDirectory?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getStoredPreferences(): StoredPreferences {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return raw ? JSON.parse(raw) as StoredPreferences : {};
  } catch {
    return {};
  }
}

function pickModel(models: ModelOption[], requestedModel?: string) {
  return models.find((model) => model.value === requestedModel) ?? models[0];
}

function pickAspectRatio(model: ModelOption, requestedAspectRatio?: string) {
  if (requestedAspectRatio && model.aspectRatios.includes(requestedAspectRatio)) {
    return requestedAspectRatio;
  }

  if (model.aspectRatios.includes("16:9")) {
    return "16:9";
  }

  return model.aspectRatios[0] ?? "1:1";
}

function pickResolution(model: ModelOption, aspectRatio: string, requestedResolution?: string) {
  const compatibleResolutions = getResolutionsForAspectRatio(model, aspectRatio);

  if (requestedResolution && compatibleResolutions.includes(requestedResolution)) {
    return requestedResolution;
  }

  if (compatibleResolutions.includes("1K")) {
    return "1K";
  }

  return compatibleResolutions[0] ?? "standard";
}

export function loadPreferences(models: ModelOption[]) {
  const stored = getStoredPreferences();
  const model = pickModel(models, stored.defaults?.model);
  const aspectRatio = pickAspectRatio(model, stored.defaults?.aspectRatio);

  return {
    defaults: {
      model: model.value,
      aspectRatio,
      resolution: pickResolution(model, aspectRatio, stored.defaults?.resolution),
      n: Math.min(Math.max(stored.defaults?.n ?? 1, 1), model.maxN),
      globalReferenceImageId: null
    } satisfies DefaultsState,
    exportDirectory: stored.exportDirectory ?? ""
  };
}

export function savePreferences(input: {
  defaults: DefaultsState;
  exportDirectory: string;
}) {
  if (!isBrowser()) {
    return;
  }

  const payload: StoredPreferences = {
    defaults: {
      model: input.defaults.model,
      aspectRatio: input.defaults.aspectRatio,
      resolution: input.defaults.resolution,
      n: input.defaults.n
    },
    exportDirectory: input.exportDirectory
  };

  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(payload));
}
