import { useEffect, useState } from "react";
import { fetchActiveBatch, pauseBatch, resumeBatch } from "../lib/api";
export function useActiveBatch(batchId) {
    const [data, setData] = useState(null);
    useEffect(() => {
        if (!batchId) {
            setData(null);
            return;
        }
        let active = true;
        let timer;
        const poll = async () => {
            try {
                const next = await fetchActiveBatch(batchId);
                if (!active) {
                    return;
                }
                setData(next);
                if (next.batch.status !== "completed") {
                    timer = window.setTimeout(poll, 2000);
                }
            }
            catch {
                if (active) {
                    timer = window.setTimeout(poll, 3000);
                }
            }
        };
        void poll();
        return () => {
            active = false;
            if (timer) {
                window.clearTimeout(timer);
            }
        };
    }, [batchId]);
    return {
        activeBatch: data,
        async pause() {
            if (!batchId) {
                return;
            }
            await pauseBatch(batchId);
            setData((current) => current ? { ...current, scheduler: { ...current.scheduler, paused: true } } : current);
        },
        async resume() {
            if (!batchId) {
                return;
            }
            await resumeBatch(batchId);
            setData((current) => current ? { ...current, scheduler: { ...current.scheduler, paused: false } } : current);
        }
    };
}
