export function RunSummary(props: {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}) {
  return (
    <section className="panel monitor-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">运行监控</p>
          <h2>当前批次队列</h2>
        </div>
        {props.paused ? (
          <button className="primary-button" onClick={props.onResume}>继续调度</button>
        ) : (
          <button className="ghost-button" onClick={props.onPause}>暂停补位</button>
        )}
      </div>

      <div className="summary-grid">
        <strong>等待中 {props.queued}</strong>
        <strong>运行中 {props.running}</strong>
        <strong>成功 {props.completed}</strong>
        <strong>失败 {props.failed}</strong>
      </div>
    </section>
  );
}
