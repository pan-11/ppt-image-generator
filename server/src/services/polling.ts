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
  intervalMs: 1500
};

export async function pollRemoteImageTask(
  taskId: string,
  getImageTask: (taskId: string) => Promise<RemoteImageTask>,
  options?: Partial<typeof defaultImageTaskPolling>
) {
  const maxAttempts = options?.maxAttempts ?? defaultImageTaskPolling.maxAttempts;
  const intervalMs = options?.intervalMs ?? defaultImageTaskPolling.intervalMs;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await getImageTask(taskId);

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("任务轮询超时");
}
