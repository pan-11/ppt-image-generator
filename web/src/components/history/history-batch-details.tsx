import type { HistoryItem } from "../../lib/types";
import { formatTaskStatus } from "../../lib/status-labels";

const stageLabels: Record<string, string> = {
  submission: "提交失败",
  polling: "轮询失败",
  download: "下载失败",
  validation: "尺寸校验失败"
};

function jobTitle(job: HistoryItem["jobs"][number]) {
  if (!job.provider_id) return `图 ${job.output_index} · 尚未提交`;
  return `图 ${job.output_index} · ${job.provider_name ?? job.provider_id} · ${job.protocol_type ?? "未知协议"}`;
}

function dimensionSummary(job: HistoryItem["jobs"][number]) {
  if (!job.requested_size) return null;
  const actual = job.actual_width && job.actual_height
    ? `${job.actual_width}x${job.actual_height}`
    : "未返回";
  return `预期 ${job.requested_size} · 返回 ${actual}`;
}

export function HistoryBatchDetails({ item }: { item: HistoryItem }) {
  return <section className="history-batch-details" aria-label="批次详情">
    {item.tasks.map((task) => <article key={task.id} className="history-task-details">
      <p className="history-full-prompt">{task.prompt}</p>
      <p className="muted-copy">{task.model} · {formatTaskStatus(task.status)}</p>
      {task.error_message ? <p className="error-copy">{task.error_message}</p> : null}
      {(item.jobs ?? []).filter((job) => job.task_id === task.id).map((job) => <div key={job.id} className="generation-job-row">
        <strong>{jobTitle(job)}</strong>
        <span className={`status-chip status-${job.status}`}>{formatTaskStatus(job.status)}</span>
        {dimensionSummary(job) ? <p className="muted-copy">{dimensionSummary(job)}</p> : null}
        {job.error_stage ? <p className="error-copy">{stageLabels[job.error_stage] ?? job.error_stage}</p> : null}
        {job.error_message ? <p className="error-copy">{job.error_message}</p> : null}
      </div>)}
    </article>)}
  </section>;
}
