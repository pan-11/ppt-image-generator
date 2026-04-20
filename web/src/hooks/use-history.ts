import { useCallback, useEffect, useState } from "react";
import { deleteBatch, deleteImage, fetchHistory } from "../lib/api";

type HistoryBatch = Awaited<ReturnType<typeof fetchHistory>>[number];

export function useHistory() {
  const [history, setHistory] = useState<HistoryBatch[]>([]);
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
    async deleteBatch(batchId: string) {
      await deleteBatch(batchId);
      await refresh();
    },
    async deleteImage(imageId: string) {
      await deleteImage(imageId);
      await refresh();
    }
  };
}
