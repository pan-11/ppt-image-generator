import { describe, expect, it } from "vitest";
import { formatTaskStatus } from "../lib/status-labels";

describe("formatTaskStatus", () => {
  it("maps internal task states to consistent Chinese labels", () => {
    expect(formatTaskStatus("queued")).toBe("等待中");
    expect(formatTaskStatus("remote_in_progress")).toBe("运行中");
    expect(formatTaskStatus("downloading")).toBe("下载中");
    expect(formatTaskStatus("completed")).toBe("成功");
    expect(formatTaskStatus("failed")).toBe("失败");
    expect(formatTaskStatus("custom_state")).toBe("状态未知");
  });
});
