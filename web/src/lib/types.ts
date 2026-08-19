export type ModelOption = {
  value: string;
  label: string;
  aspectRatios: string[];
  resolutions: string[];
  supportedResolutionsByAspectRatio?: Record<string, string[]>;
  maxN: number;
  supportsReferenceImages: boolean;
};

export type GenerationRole = "text" | "image";

export type RoleSettings = {
  providerId: string;
  providerName: string;
  protocolType: "toapis-async" | "ym2-openai-images";
  maxConcurrency: number;
  models: ModelOption[];
};

export type Settings = {
  maxBatchSize: number;
  roles: Record<GenerationRole, RoleSettings>;
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
  note: string;
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
  note?: string | null;
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

export type GenerationJobRecord = {
  id: string;
  task_id: string;
  output_index: number;
  mode: "text" | "image";
  status: "queued" | "submitting" | "remote_queued" | "downloading" | "completed" | "failed" | "unknown";
  provider_id?: string | null;
  provider_name?: string | null;
  protocol_type?: string | null;
  requested_size?: string | null;
  actual_width?: number | null;
  actual_height?: number | null;
  error_stage?: string | null;
  error_message?: string | null;
};

export type ActiveBatchResponse = {
  batch: BatchRecord;
  tasks: TaskRecord[];
  jobs: GenerationJobRecord[];
  images: ImageRecord[];
  scheduler: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    unknown: number;
    paused: boolean;
  };
};

export type HistoryItem = {
  batch: ActiveBatchResponse["batch"];
  tasks: ActiveBatchResponse["tasks"];
  jobs: ActiveBatchResponse["jobs"];
  images: ActiveBatchResponse["images"];
};
