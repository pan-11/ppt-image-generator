const taskStatusLabels: Record<string, string> = {
  queued: "等待中",
  submitting: "运行中",
  remote_queued: "运行中",
  remote_in_progress: "运行中",
  running: "运行中",
  downloading: "下载中",
  completed: "成功",
  failed: "失败",
  paused: "已暂停"
};

export function formatTaskStatus(status: string) {
  return taskStatusLabels[status] ?? "状态未知";
}
