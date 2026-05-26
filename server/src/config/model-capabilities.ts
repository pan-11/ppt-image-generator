type RequestStyle = "legacy-size" | "ratio-metadata" | "ratio-resolution";

type SizeMap = Record<string, Record<string, string>>;

export type ModelCapability = {
  label: string;
  requestModel: string;
  requestStyle: RequestStyle;
  aspectRatios: string[];
  resolutions: string[];
  maxN: number;
  supportsReferenceImages: boolean;
  sizeMap?: SizeMap;
};

export type ResolvedTaskRequest = {
  requestModel: string;
  size: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
};

const sharedGeminiRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

export const modelCapabilities: Record<string, ModelCapability> = {
  "gpt-image-2": {
    label: "gpt-image-2",
    requestModel: "gpt-image-2",
    requestStyle: "ratio-resolution",
    aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"],
    resolutions: ["1K", "2K", "4K"],
    maxN: 10,
    supportsReferenceImages: true,
    sizeMap: {
      "1:1": {
        "1K": "1:1",
        "2K": "1:1"
      },
      "3:2": {
        "1K": "3:2",
        "2K": "3:2"
      },
      "2:3": {
        "1K": "2:3",
        "2K": "2:3"
      },
      "4:3": {
        "2K": "4:3"
      },
      "3:4": {
        "2K": "3:4"
      },
      "5:4": {
        "2K": "5:4"
      },
      "4:5": {
        "2K": "4:5"
      },
      "16:9": {
        "2K": "16:9",
        "4K": "16:9"
      },
      "9:16": {
        "2K": "9:16",
        "4K": "9:16"
      },
      "2:1": {
        "2K": "2:1",
        "4K": "2:1"
      },
      "1:2": {
        "2K": "1:2",
        "4K": "1:2"
      },
      "21:9": {
        "2K": "21:9",
        "4K": "21:9"
      },
      "9:21": {
        "2K": "9:21",
        "4K": "9:21"
      }
    }
  },
  "gpt-image-1.5-official": {
    label: "gpt-image-1.5-official",
    requestModel: "gpt-image-1.5-official",
    requestStyle: "ratio-resolution",
    aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"],
    resolutions: ["1K", "2K", "4K"],
    maxN: 4,
    supportsReferenceImages: true,
    sizeMap: {
      "1:1": {
        "1K": "1:1",
        "2K": "1:1"
      },
      "3:2": {
        "1K": "3:2",
        "2K": "3:2"
      },
      "2:3": {
        "1K": "2:3",
        "2K": "2:3"
      },
      "4:3": {
        "2K": "4:3"
      },
      "3:4": {
        "2K": "3:4"
      },
      "5:4": {
        "2K": "5:4"
      },
      "4:5": {
        "2K": "4:5"
      },
      "16:9": {
        "2K": "16:9",
        "4K": "16:9"
      },
      "9:16": {
        "2K": "9:16",
        "4K": "9:16"
      },
      "2:1": {
        "2K": "2:1",
        "4K": "2:1"
      },
      "1:2": {
        "2K": "1:2",
        "4K": "1:2"
      },
      "21:9": {
        "2K": "21:9",
        "4K": "21:9"
      },
      "9:21": {
        "2K": "9:21",
        "4K": "9:21"
      }
    }
  },
  "gemini-2.5-flash-image-preview": {
    label: "gemini-2.5-flash-image-preview",
    requestModel: "gemini-2.5-flash-image-preview",
    requestStyle: "ratio-metadata",
    aspectRatios: [...sharedGeminiRatios],
    resolutions: ["1K"],
    maxN: 1,
    supportsReferenceImages: true
  },
  "gemini-3.1-flash-image-preview": {
    label: "gemini-3.1-flash-image-preview",
    requestModel: "gemini-3.1-flash-image-preview",
    requestStyle: "ratio-metadata",
    aspectRatios: [...sharedGeminiRatios, "21:9"],
    resolutions: ["1K", "2K", "4K"],
    maxN: 1,
    supportsReferenceImages: true
  },
  "gemini-3.1-flash-image-preview-official": {
    label: "gemini-3.1-flash-image-preview-official",
    requestModel: "gemini-3.1-flash-image-preview-official",
    requestStyle: "ratio-metadata",
    aspectRatios: [...sharedGeminiRatios, "21:9"],
    resolutions: ["1K", "2K", "4K"],
    maxN: 1,
    supportsReferenceImages: true
  },
  nano_banana_2: {
    label: "nano_banana_2",
    requestModel: "gemini-3-pro-image-preview",
    requestStyle: "ratio-metadata",
    aspectRatios: [...sharedGeminiRatios, "21:9"],
    resolutions: ["1K", "2K", "4K"],
    maxN: 1,
    supportsReferenceImages: true
  },
  "gpt-image-1": {
    label: "GPT Image 1",
    requestModel: "gpt-image-1",
    requestStyle: "legacy-size",
    aspectRatios: ["1:1", "3:2", "2:3"],
    resolutions: ["standard"],
    maxN: 10,
    supportsReferenceImages: true,
    sizeMap: {
      "1:1": {
        standard: "1024x1024"
      },
      "3:2": {
        standard: "1536x1024"
      },
      "2:3": {
        standard: "1024x1536"
      }
    }
  },
  "seedream-lite": {
    label: "Seedream Lite",
    requestModel: "seedream-lite",
    requestStyle: "legacy-size",
    aspectRatios: ["1:1"],
    resolutions: ["standard"],
    maxN: 1,
    supportsReferenceImages: false,
    sizeMap: {
      "1:1": {
        standard: "1024x1024"
      }
    }
  }
};

function resolveOrientation(aspectRatio: string) {
  const [width, height] = aspectRatio.split(":").map(Number);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) {
    return undefined;
  }

  return width > height ? "landscape" : "portrait";
}

export function resolveTaskRequest(input: {
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  hasReferenceImage: boolean;
}): ResolvedTaskRequest {
  const capability = modelCapabilities[input.model];

  if (!capability) {
    throw new Error(`Unknown model: ${input.model}`);
  }

  if (!capability.aspectRatios.includes(input.aspectRatio)) {
    throw new Error(`${input.model} does not support aspect ratio ${input.aspectRatio}`);
  }

  if (!capability.resolutions.includes(input.resolution)) {
    throw new Error(`${input.model} does not support resolution ${input.resolution}`);
  }

  if (input.n < 1 || input.n > capability.maxN) {
    throw new Error(`${input.model} supports between 1 and ${capability.maxN} images per task`);
  }

  if (input.hasReferenceImage && !capability.supportsReferenceImages) {
    throw new Error(`${input.model} does not support reference images`);
  }

  if (capability.requestStyle === "legacy-size") {
    const size = capability.sizeMap?.[input.aspectRatio]?.[input.resolution];

    if (!size) {
      throw new Error(`${input.model} does not support ${input.aspectRatio} at ${input.resolution}`);
    }

    return {
      requestModel: capability.requestModel,
      size
    };
  }

  if (capability.requestStyle === "ratio-resolution") {
    const size = capability.sizeMap?.[input.aspectRatio]?.[input.resolution];

    if (!size) {
      throw new Error(`${input.model} does not support ${input.aspectRatio} at ${input.resolution}`);
    }

    return {
      requestModel: capability.requestModel,
      size,
      resolution: input.resolution.toLowerCase()
    };
  }

  const orientation = resolveOrientation(input.aspectRatio);

  return {
    requestModel: capability.requestModel,
    size: input.aspectRatio,
    metadata: {
      resolution: input.resolution,
      ...(orientation ? { orientation } : {})
    }
  };
}
