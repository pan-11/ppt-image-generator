type SubmitBarProps = {
  readyCount: number;
  maxBatchSize: number;
  maxConcurrency: number;
  submitting: boolean;
  settingsLoading: boolean;
  errorMessage?: string | null;
  variant?: "top" | "bottom";
  onSubmit: () => void;
};

export function SubmitBar({
  readyCount,
  maxBatchSize,
  maxConcurrency,
  submitting,
  settingsLoading,
  errorMessage,
  variant = "bottom",
  onSubmit
}: SubmitBarProps) {
  const isDisabled = submitting || settingsLoading || readyCount === 0;

  return (
    <div className={`submit-bar ${variant === "top" ? "submit-bar-top" : ""}`}>
      <div>
        <strong>准备提交 {readyCount} 条任务</strong>
        <p>单批最多 {maxBatchSize} 条，固定并发 {maxConcurrency} 条。</p>
        {errorMessage ? <p className="submit-error">{errorMessage}</p> : null}
      </div>
      <button className="primary-button large-button" disabled={isDisabled} onClick={onSubmit}>
        {submitting ? "提交中..." : "开始生成"}
      </button>
    </div>
  );
}
