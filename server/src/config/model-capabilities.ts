export type ModelCapability = {
  label: string;
  sizes: string[];
  maxN: number;
  supportsReferenceImages: boolean;
};

export const modelCapabilities: Record<string, ModelCapability> = {
  "gpt-image-1": {
    label: "GPT Image 1",
    sizes: ["1024x1024", "1536x1024", "1024x1536"],
    maxN: 10,
    supportsReferenceImages: true
  },
  "gemini-2.5-flash-image-preview": {
    label: "Gemini 2.5 Flash Image Preview",
    sizes: ["1024x1024"],
    maxN: 1,
    supportsReferenceImages: true
  },
  "seedream-lite": {
    label: "Seedream Lite",
    sizes: ["1024x1024"],
    maxN: 1,
    supportsReferenceImages: false
  }
};

export function validateTaskInput(input: {
  model: string;
  size: string;
  n: number;
  hasReferenceImage: boolean;
}) {
  const capability = modelCapabilities[input.model];

  if (!capability) {
    throw new Error(`未知模型：${input.model}`);
  }

  if (!capability.sizes.includes(input.size)) {
    throw new Error(`${input.model} 不支持尺寸 ${input.size}`);
  }

  if (input.n < 1 || input.n > capability.maxN) {
    throw new Error(`${input.model} 仅支持 1 到 ${capability.maxN} 张`);
  }

  if (input.hasReferenceImage && !capability.supportsReferenceImages) {
    throw new Error(`${input.model} 不支持参考图`);
  }
}
