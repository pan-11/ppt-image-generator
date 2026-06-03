export type RemoteImageTask = {
  status: "queued" | "in_progress" | "completed" | "failed";
  result?: {
    data: Array<{ url: string }>;
  };
  error?: {
    message?: string;
  };
};

export const defaultImageTaskPolling = {
  maxAttempts: 400,
  intervalMs: 8000,
  retryableErrorIntervalMs: 15000
};

function isRetryablePollingError(error: unknown) {
  return error instanceof Error && error.message.includes("429");
}

export async function pollRemoteImageTask(
  taskId: string,
  getImageTask: (taskId: string) => Promise<RemoteImageTask>,
  options?: Partial<typeof defaultImageTaskPolling>
) {
  const maxAttempts = options?.maxAttempts ?? defaultImageTaskPolling.maxAttempts;
  const intervalMs = options?.intervalMs ?? defaultImageTaskPolling.intervalMs;
  const retryableErrorIntervalMs = options?.retryableErrorIntervalMs ?? defaultImageTaskPolling.retryableErrorIntervalMs;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result: RemoteImageTask;
    try {
      result = await getImageTask(taskId);
    } catch (error) {
      if (!isRetryablePollingError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryableErrorIntervalMs));
      continue;
    }

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("任务轮询超时");
}
