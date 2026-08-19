export type ProtocolType = "toapis-async" | "ym2-openai-images";
export type GenerationMode = "text" | "image";

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocolType: ProtocolType;
  configRevision: string;
  maxConcurrency: number;
};

export type ReferenceAsset = {
  id: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type AdapterGenerationRequest = {
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  references: ReferenceAsset[];
};

export type AdapterRemoteReference = {
  taskId?: string;
  resultUrl?: string;
};

export type AdapterGeneratedImage = {
  buffer: Buffer;
  mimeType: string;
};

export type AdapterResolvedRequest = {
  requestSize: string;
  expectedDimensions?: { width: number; height: number };
};

export type AdapterModelCapability = {
  value: string;
  label: string;
  aspectRatios: string[];
  resolutions: string[];
  supportedResolutionsByAspectRatio?: Record<string, string[]>;
  maxN: number;
  supportsReferenceImages: boolean;
};

export interface ProviderAdapter {
  readonly protocolType: ProtocolType;
  capabilities(mode: GenerationMode): AdapterModelCapability[];
  resolveRequest(request: AdapterGenerationRequest): AdapterResolvedRequest;
  generate(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage>;
  recover(
    provider: ProviderRuntimeConfig,
    request: AdapterGenerationRequest,
    remote: AdapterRemoteReference,
    onRemoteReference: (reference: AdapterRemoteReference) => void
  ): Promise<AdapterGeneratedImage>;
}

export class UnknownSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownSubmissionError";
  }
}

export function isProtocolType(value: unknown): value is ProtocolType {
  return value === "toapis-async" || value === "ym2-openai-images";
}
