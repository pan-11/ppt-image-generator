export type ProviderSetting = {
  id: string;
  name: string;
  baseUrl: string;
  notes: string;
  apiKeyMask: string;
  hasApiKey: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSettingsState = {
  activeProviderId: string | null;
  usingEnvFallback: boolean;
  providers: ProviderSetting[];
};

async function providerFetch<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? "请求失败");
  }
  return response.json() as Promise<T>;
}

export function fetchProviderSettings() {
  return providerFetch<ProviderSettingsState>("/api/provider-settings");
}

export function saveProviderSetting(input: {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  notes: string;
}) {
  const { id, ...payload } = input;
  return providerFetch<ProviderSetting>(
    id ? `/api/provider-settings/${id}` : "/api/provider-settings",
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export function activateProviderSetting(providerId: string) {
  return providerFetch<ProviderSettingsState>(`/api/provider-settings/${providerId}/activate`, {
    method: "POST"
  });
}
