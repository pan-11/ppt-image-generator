import { useEffect, useState } from "react";
import { fetchSettings } from "../lib/api";
import type { Settings } from "../lib/types";

const fallbackSettings: Settings = {
  maxConcurrency: 5,
  maxBatchSize: 50,
  models: [
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
