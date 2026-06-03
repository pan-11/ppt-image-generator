export type ModelOption = {
  value: string;
  label: string;
  aspectRatios: string[];
  resolutions: string[];
  supportedResolutionsByAspectRatio?: Record<string, string[]>;
  maxN: number;
  supportsReferenceImages: boolean;
};

export type Settings = {
  maxConcurrency: number;
  maxBatchSize: number;
  models: ModelOption[];
};

export type DefaultsState = {
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  globalReferenceImageId: string | null;
};

export type ReferenceImageRecord = {
  id: string;
  filename: string;
  localPath: string;
};

export type TaskDraft = {
  id: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceMode: "none" | "row" | "global";
  referenceImageId: string | null;
  submittedTaskId?: string | null;
};

export type TaskRecord = {
  id: string;
  batch_id?: string;
  prompt: string;
  model: string;
  aspect_ratio?: string | null;
  resolution?: string | null;
  size: string;
  n: number;
  reference_mode?: string;
  reference_image_id?: string | null;
  parent_image_id?: string | null;
  status: string;
  error_message?: string | null;
};

export type BatchRecord = {
  id: string;
  name: string;
  status: string;
  total_tasks: number;
  success_count: number;
  failed_count: number;
  created_at: string;
};

export type ImageRecord = {
  id: string;
  task_id?: string;
  filename: string;
  local_path: string;
};

export type ActiveBatchResponse = {
  batch: BatchRecord;
  tasks: TaskRecord[];
  images: ImageRecord[];
  scheduler: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    paused: boolean;
  };
};
