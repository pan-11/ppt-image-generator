import { useCallback, useEffect, useState } from "react";
import { deleteBatch, deleteImage, fetchHistory } from "../lib/api";
export function useHistory() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        const result = await fetchHistory();
        setHistory(result);
        setLoading(false);
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    return {
        history,
        loading,
        refresh,
        async deleteBatch(batchId) {
            await deleteBatch(batchId);
            await refresh();
        },
        async deleteImage(imageId) {
            await deleteImage(imageId);
            await refresh();
        }
    };
}
