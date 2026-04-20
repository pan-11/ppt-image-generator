import type { DefaultsState, ModelOption, TaskRecord } from "./types";

export function getModelOption(models: ModelOption[], value: string) {
  return models.find((model) => model.value === value) ?? models[0];
}

export function getAspectRatioDefault(model: ModelOption) {
  return model.aspectRatios[0] ?? "1:1";
}

export function getResolutionDefault(model: ModelOption) {
  return model.resolutions[0] ?? "1K";
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
  return {
    ...current,
    model: nextModel.value,
    aspectRatio: nextModel.aspectRatios.includes(current.aspectRatio)
      ? current.aspectRatio
      : getAspectRatioDefault(nextModel),
    resolution: nextModel.resolutions.includes(current.resolution)
      ? current.resolution
      : getResolutionDefault(nextModel),
    n: clampTaskCount(current.n, nextModel),
    ...(current.referenceMode !== undefined
      ? {
        referenceMode: nextModel.supportsReferenceImages ? current.referenceMode : "none",
        referenceImageId: nextModel.supportsReferenceImages ? current.referenceImageId ?? null : null
      }
      : {})
  };
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
