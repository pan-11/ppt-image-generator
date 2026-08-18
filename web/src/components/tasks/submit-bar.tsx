type SubmitBarProps = {
  readyCount: number;
  maxBatchSize: number;
  textConcurrency: number;
  imageConcurrency: number;
  submitting: boolean;
  settingsLoading: boolean;
  hasInvalidTasks?: boolean;
  errorMessage?: string | null;
  variant?: "top" | "bottom";
  onSubmit: () => void;
};

export function SubmitBar({
  readyCount,
  maxBatchSize,
  textConcurrency,
  imageConcurrency,
  submitting,
  settingsLoading,
  hasInvalidTasks = false,
  errorMessage,
  variant = "bottom",
  onSubmit
}: SubmitBarProps) {
  const isDisabled = submitting || settingsLoading || readyCount === 0 || hasInvalidTasks;

  return (
    <div className={`submit-bar ${variant === "top" ? "submit-bar-top" : ""}`}>
      <div>
        <strong>准备提交 {readyCount} 条任务</strong>
        <p>单批最多 {maxBatchSize} 条，文生图并发 {textConcurrency}，图生图并发 {imageConcurrency}。</p>
        {errorMessage ? <p className="submit-error">{errorMessage}</p> : null}
      </div>
      <button className="primary-button large-button" disabled={isDisabled} onClick={onSubmit}>
        {submitting ? "提交中..." : "开始生成"}
      </button>
    </div>
  );
}
