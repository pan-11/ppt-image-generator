export type ModelOption = {
  value: string;
  label: string;
  sizes: string[];
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
  size: string;
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
  size: string;
  n: number;
  referenceMode: "none" | "row" | "global";
  referenceImageId: string | null;
};

export type TaskRecord = {
  id: string;
  prompt: string;
  model: string;
  size: string;
  n: number;
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
