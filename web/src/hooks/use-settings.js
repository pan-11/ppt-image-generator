import { useEffect, useState } from "react";
import { fetchSettings } from "../lib/api";
const fallbackSettings = {
    maxConcurrency: 5,
    maxBatchSize: 50,
    models: [
        {
            value: "gpt-image-1",
            label: "GPT Image 1",
            sizes: ["1024x1024", "1536x1024", "1024x1536"],
            maxN: 10,
            supportsReferenceImages: true
        }
    ]
};
export function useSettings() {
    const [settings, setSettings] = useState(fallbackSettings);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
