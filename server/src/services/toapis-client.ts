type CreateImageTaskInput = {
  prompt: string;
  model: string;
  size: string;
  n: number;
  resolution?: string;
  metadata?: Record<string, unknown>;
  imageUrls?: string[];
};

type ImageTaskResponse = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  result?: {
    data: Array<{ url: string }>;
  };
  error?: {
    message?: string;
  };
};

export type CreateImageTaskResponse = {
  id?: unknown;
  task_id?: unknown;
  taskId?: unknown;
  status?: unknown;
  data?: unknown;
  result?: unknown;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function firstUrlFromData(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const imageSource = imageSourceFromRecord(asRecord(item));
      if (imageSource) {
        return imageSource;
      }
    }
    return null;
  }

  return imageSourceFromRecord(asRecord(value));
}

function imageSourceFromRecord(record: Record<string, unknown> | null) {
  const url = stringField(record, "url");
  if (url) {
    return url;
  }

  const base64 = stringField(record, "b64_json");
  if (!base64) {
    return null;
  }

  return base64.startsWith("data:image/")
    ? base64
    : `data:image/png;base64,${base64}`;
}

export function extractImageTaskId(response: unknown) {
  const root = asRecord(response);
  const data = asRecord(root?.data);

  return stringField(root, "id") ??
    stringField(root, "task_id") ??
    stringField(root, "taskId") ??
    stringField(data, "id") ??
    stringField(data, "task_id") ??
    stringField(data, "taskId");
}

export function extractFirstImageUrl(response: unknown) {
  const root = asRecord(response);
  const result = asRecord(root?.result);

  return firstUrlFromData(root?.data) ??
    firstUrlFromData(result?.data) ??
    stringField(root, "url") ??
    stringField(result, "url");
}

export class ToApisClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://toapis.com/v1"
  ) {}

  async uploadReferenceImage(input: { filename: string; mimeType: string; buffer: Buffer }) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
      input.filename
    );

    const response = await fetch(`${this.baseUrl}/uploads/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`上传参考图失败：${response.status}`);
    }

    const data = await response.json() as { data?: { url?: string }; url?: string };
    const remoteUrl = data.data?.url ?? data.url;

    if (!remoteUrl) {
      throw new Error("上传参考图后未返回可用 URL");
    }

    return remoteUrl;
  }

  async createImageTask(input: CreateImageTaskInput) {
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model: input.model,
        size: input.size,
        resolution: input.resolution,
        n: input.n,
        metadata: input.metadata,
        image_urls: input.imageUrls
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`创建任务失败：${response.status} ${text}`);
    }

    return response.json() as Promise<CreateImageTaskResponse>;
  }

  async getImageTask(taskId: string) {
    const response = await fetch(`${this.baseUrl}/images/generations/${taskId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`查询任务失败：${response.status} ${text}`);
    }

    return response.json() as Promise<ImageTaskResponse>;
  }

  async downloadImage(url: string) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`下载结果图失败：${response.status}`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "image/png"
    };
  }
}
