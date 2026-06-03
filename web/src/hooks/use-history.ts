import { useCallback, useEffect, useState } from "react";
import { deleteBatch, deleteImage, exportBatch, fetchHistory } from "../lib/api";

type HistoryBatch = Awaited<ReturnType<typeof fetchHistory>>[number];

export function useHistory() {
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchHistory();
      setHistory(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    history,
    loading,
    lastExportMessage,
    refresh,
    async deleteBatch(batchId: string) {
      await deleteBatch(batchId);
      await refresh();
    },
    async deleteImage(imageId: string) {
      await deleteImage(imageId);
      await refresh();
    },
    async exportBatch(batchId: string, destinationDir: string) {
      const result = await exportBatch(batchId, destinationDir);
      setLastExportMessage(`已导出 ${result.exportedCount} 张图片到 ${result.destinationDir}`);
      return result;
    }
  };
}
