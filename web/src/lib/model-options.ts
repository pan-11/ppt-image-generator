import type {
  DefaultsState,
  GenerationRole,
  ModelOption,
  RoleSettings,
  TaskDraft,
  TaskRecord
} from "./types";

export function getModelOption(models: ModelOption[], value: string) {
  return models.find((model) => model.value === value) ?? models[0];
}

export function roleForDraft(
  draft: Pick<TaskDraft, "referenceMode" | "referenceImageId">,
  globalReferenceImageId: string | null
): GenerationRole {
  const hasReference = draft.referenceMode === "row"
    ? Boolean(draft.referenceImageId)
    : draft.referenceMode === "global"
      ? Boolean(globalReferenceImageId)
      : false;
  return hasReference ? "image" : "text";
}

export function validateDraftForRole(
  draft: Pick<TaskDraft, "model" | "aspectRatio" | "resolution" | "n">,
  role: RoleSettings
) {
  const model = role.models.find((item) => item.value === draft.model);
  if (!model) return `当前${role.providerName}不支持模型 ${draft.model}`;
  if (!model.aspectRatios.includes(draft.aspectRatio)) {
    return `当前${role.providerName}不支持比例 ${draft.aspectRatio}`;
  }
  const resolutions = getResolutionsForAspectRatio(model, draft.aspectRatio);
  if (!resolutions.includes(draft.resolution)) {
    return `当前${role.providerName}不支持分辨率 ${draft.resolution}`;
  }
  if (draft.n < 1 || draft.n > model.maxN) {
    return `当前${role.providerName}单行最多生成 ${model.maxN} 张`;
  }
  return null;
}

export function getAspectRatioDefault(model: ModelOption) {
  return model.aspectRatios[0] ?? "1:1";
}

export function getResolutionDefault(model: ModelOption) {
  return model.resolutions[0] ?? "1K";
}

export function getResolutionsForAspectRatio(model: ModelOption, aspectRatio: string) {
  return model.supportedResolutionsByAspectRatio?.[aspectRatio] ?? model.resolutions;
}

export function getAspectRatiosForResolution(model: ModelOption, resolution: string) {
  if (!model.supportedResolutionsByAspectRatio) {
    return model.aspectRatios;
  }

  return model.aspectRatios.filter((aspectRatio) => (
    model.supportedResolutionsByAspectRatio?.[aspectRatio]?.includes(resolution)
  ));
}

export function clampTaskCount(count: number, model: ModelOption) {
  return Math.min(Math.max(count, 1), model.maxN);
}

type ModelSelectable = {
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceMode?: "none" | "row" | "global";
  referenceImageId?: string | null;
};

export function applyModelSelection<T extends ModelSelectable>(
  nextModel: ModelOption,
  current: T
) {
  return normalizeModelSelection(nextModel, {
    ...current,
    model: nextModel.value,
    n: clampTaskCount(current.n, nextModel),
    ...(current.referenceMode !== undefined
      ? {
        referenceMode: nextModel.supportsReferenceImages ? current.referenceMode : "none",
        referenceImageId: nextModel.supportsReferenceImages ? current.referenceImageId ?? null : null
      }
      : {})
  });
}

export function normalizeModelSelection<T extends ModelSelectable>(
  model: ModelOption,
  current: T
) {
  const aspectRatio = model.aspectRatios.includes(current.aspectRatio)
    ? current.aspectRatio
    : getAspectRatioDefault(model);
  const compatibleResolutions = getResolutionsForAspectRatio(model, aspectRatio);
  const resolution = compatibleResolutions.includes(current.resolution)
    ? current.resolution
    : compatibleResolutions[0] ?? getResolutionDefault(model);

  return {
    ...current,
    model: model.value,
    aspectRatio,
    resolution,
    n: clampTaskCount(current.n, model)
  };
}

export function applyAspectRatioSelection<T extends ModelSelectable>(
  model: ModelOption,
  current: T,
  aspectRatio: string
) {
  return normalizeModelSelection(model, {
    ...current,
    aspectRatio
  });
}

export function createDefaultsState(model: ModelOption): DefaultsState {
  return {
    model: model.value,
    aspectRatio: getAspectRatioDefault(model),
    resolution: getResolutionDefault(model),
    n: 1,
    globalReferenceImageId: null
  };
}

export function formatResolutionLabel(resolution: string | null | undefined) {
  if (!resolution) {
    return "";
  }

  return resolution === "standard" ? "标准" : resolution;
}

export function formatTaskDimensions(task: Pick<TaskRecord, "aspect_ratio" | "resolution" | "size" | "n">) {
  const ratio = task.aspect_ratio ?? task.size;
  const resolution = formatResolutionLabel(task.resolution);

  return [ratio, resolution, `${task.n} 张`].filter(Boolean).join(" · ");
}
