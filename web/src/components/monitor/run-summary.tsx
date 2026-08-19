export function RunSummary(props: {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  unknown: number;
  hasActiveBatch?: boolean;
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
        {props.hasActiveBatch === false ? null : props.paused ? (
          <button className="primary-button" onClick={props.onResume}>继续调度</button>
        ) : (
          <button className="ghost-button" onClick={props.onPause}>暂停补位</button>
        )}
      </div>

      {props.hasActiveBatch === false ? <p className="muted-copy">提交任务后可在这里暂停或继续队列。</p> : null}

      {props.hasActiveBatch !== false ? (
        <div className="summary-grid">
          <strong>等待中 <span>{props.queued}</span></strong>
          <strong>运行中 <span>{props.running}</span></strong>
          <strong>成功 <span>{props.completed}</span></strong>
          <strong>失败 <span>{props.failed}</span></strong>
          <strong>状态未知 <span>{props.unknown}</span></strong>
        </div>
      ) : null}
    </section>
  );
}
