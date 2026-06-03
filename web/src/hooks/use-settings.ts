import { useEffect, useState } from "react";
import { fetchSettings } from "../lib/api";
import type { Settings } from "../lib/types";

const gptImage2OfficialRatioResolutionMap = {
  "1:1": ["1K", "2K"],
  "3:2": ["1K", "2K"],
  "2:3": ["1K", "2K"],
  "4:3": ["1K", "2K"],
  "3:4": ["1K", "2K"],
  "5:4": ["1K", "2K"],
  "4:5": ["1K", "2K"],
  "16:9": ["1K", "2K", "4K"],
  "9:16": ["1K", "2K", "4K"],
  "2:1": ["1K", "2K", "4K"],
  "1:2": ["1K", "2K", "4K"],
  "21:9": ["1K", "2K", "4K"],
  "9:21": ["1K", "2K", "4K"]
};

const fallbackSettings: Settings = {
  maxConcurrency: 30,
  maxBatchSize: 100,
  models: [
    {
      value: "gpt-image-2",
      label: "gpt-image-2（普通渠道，3 积分/张）",
      aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"],
      resolutions: ["1K", "2K", "4K"],
      maxN: 10,
      supportsReferenceImages: true
    },
    {
      value: "gpt-image-1.5-official",
      label: "gpt-image-2-official（官方渠道，44 积分/张）",
      aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"],
      resolutions: ["1K", "2K", "4K"],
      supportedResolutionsByAspectRatio: gptImage2OfficialRatioResolutionMap,
      maxN: 4,
      supportsReferenceImages: true
    },
    {
      value: "gemini-2.5-flash-image-preview",
      label: "gemini-2.5-flash-image-preview",
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
      resolutions: ["1K"],
      maxN: 1,
      supportsReferenceImages: true
    },
    {
      value: "gemini-3.1-flash-image-preview",
      label: "gemini-3.1-flash-image-preview",
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
      resolutions: ["1K", "2K", "4K"],
      maxN: 1,
      supportsReferenceImages: true
    },
    {
      value: "gemini-3.1-flash-image-preview-official",
      label: "gemini-3.1-flash-image-preview-official",
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
      resolutions: ["1K", "2K", "4K"],
      maxN: 1,
      supportsReferenceImages: true
    },
    {
      value: "nano_banana_2",
      label: "nano_banana_2",
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
      resolutions: ["1K", "2K", "4K"],
      maxN: 1,
      supportsReferenceImages: true
    },
    {
      value: "gpt-image-1",
      label: "GPT Image 1",
      aspectRatios: ["1:1", "3:2", "2:3"],
      resolutions: ["standard"],
      maxN: 10,
      supportsReferenceImages: true
    },
    {
      value: "seedream-lite",
      label: "Seedream Lite",
      aspectRatios: ["1:1"],
      resolutions: ["standard"],
      maxN: 1,
      supportsReferenceImages: false
    }
  ]
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchSettings()
      .then((response) => {
        if (!active) {
          return;
        }
        setSettings(response);
        setError(null);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "加载配置失败");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { settings, loading, error };
}

export { fallbackSettings };
