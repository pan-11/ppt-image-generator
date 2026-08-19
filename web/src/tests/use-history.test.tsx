import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHistory } from "../hooks/use-history";
import { fetchHistory } from "../lib/api";

vi.mock("../lib/api", () => ({
  deleteBatch: vi.fn(),
  deleteImage: vi.fn(),
  exportBatch: vi.fn(),
  fetchHistory: vi.fn()
}));

describe("useHistory", () => {
  beforeEach(() => {
    vi.mocked(fetchHistory).mockReset();
    vi.mocked(fetchHistory).mockResolvedValue([]);
  });

  it("loads history automatically when the panel mounts", async () => {
    const { result } = renderHook(() => useHistory());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(fetchHistory).toHaveBeenCalledTimes(1);
    });
  });

  it("exposes history loading failures to the panel", async () => {
    vi.mocked(fetchHistory).mockRejectedValue(new Error("加载历史记录失败"));

    const { result } = renderHook(() => useHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("加载历史记录失败");
    });
  });
});
