import type { BenchmarkRecord } from "../../lib/lab-api";

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function formatDuration(value: number | null) {
  return value === null ? "-" : `${(value / 1000).toFixed(1)} 秒`;
}

export function ComparisonTable({ records }: { records: BenchmarkRecord[] }) {
  const groups = Array.from(new Set(records.map((record) => record.providerId))).map((providerId) => {
    const providerRecords = records.filter((record) => record.providerId === providerId);
    const successes = providerRecords.filter((record) => record.status === "completed");
    const totalTimes = successes.map((record) => record.totalMs);
    return {
      providerId,
      name: providerRecords[0]?.providerName ?? providerId,
      runs: providerRecords.length,
      successes: successes.length,
      average: totalTimes.length > 0 ? totalTimes.reduce((sum, value) => sum + value, 0) / totalTimes.length : null,
      p50: percentile(totalTimes, 0.5),
      p95: percentile(totalTimes, 0.95),
      billed: successes.filter((record) => record.reportedCost !== null).length
    };
  });

  if (groups.length === 0) {
    return <p className="lab-empty">还没有测试记录</p>;
  }

  return (
    <div className="lab-table-scroll">
      <table className="lab-table">
        <thead><tr><th>中转站</th><th>成功率</th><th>平均总耗时</th><th>P50</th><th>P95</th><th>额度数据</th></tr></thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.providerId}>
              <td>{group.name}</td>
              <td>{group.successes}/{group.runs}（{Math.round(group.successes / group.runs * 100)}%）</td>
              <td>{formatDuration(group.average)}</td><td>{formatDuration(group.p50)}</td><td>{formatDuration(group.p95)}</td>
              <td>{group.billed > 0 ? `${group.billed} 条已返回` : "未返回"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
