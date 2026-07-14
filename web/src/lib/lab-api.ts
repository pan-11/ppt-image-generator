export type LabProvider = {
  id: string;
  name: string;
  baseUrl: string;
  protocol: "toapis";
  enabled: boolean;
  notes: string;
  apiKeyMask: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCheck = {
  reachable: boolean;
  authorized: boolean;
  statusCode: number | null;
  latencyMs: number;
  message?: string;
};

export type BenchmarkRecord = {
  id: string;
  providerId: string;
  providerName: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  testMode: "text-to-image" | "reference-image";
  referenceFilename: string | null;
  status: "completed" | "failed";
  uploadMs: number;
  submitMs: number;
  generationMs: number;
  downloadMs: number;
  totalMs: number;
  reportedUsage: unknown | null;
  reportedCost: unknown | null;
  errorMessage: string | null;
  imageUrl: string | null;
  createdAt: string;
};

async function labFetch<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? "请求失败");
  }
  return response.json() as Promise<T>;
}

export function fetchLabProviders() {
  return labFetch<LabProvider[]>("/api/lab/providers");
}

export function saveLabProvider(input: {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  notes: string;
  enabled: boolean;
}) {
  const url = input.id ? `/api/lab/providers/${input.id}` : "/api/lab/providers";
  const { id, ...payload } = input;
  return labFetch<LabProvider>(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function checkLabProvider(providerId: string) {
  return labFetch<ProviderCheck>(`/api/lab/providers/${providerId}/check`, { method: "POST" });
}

export function fetchBenchmarks() {
  return labFetch<BenchmarkRecord[]>("/api/lab/benchmarks");
}

export function runBenchmark(input: {
  providerId: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
}, referenceImage?: File | null) {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => form.append(key, value));
  if (referenceImage) {
    form.append("referenceImage", referenceImage);
  }
  return labFetch<BenchmarkRecord>("/api/lab/benchmarks", {
    method: "POST",
    body: form
  });
}
