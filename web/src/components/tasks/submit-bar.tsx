type SubmitBarProps = {
  readyCount: number;
  maxBatchSize: number;
  expectedImages?: number;
  textConcurrency: number;
  imageConcurrency: number;
  submitting: boolean;
  settingsLoading: boolean;
  hasInvalidTasks?: boolean;
  errorMessage?: string | null;
  variant?: "top" | "bottom" | "inline";
  onSubmit: () => void;
};

export function SubmitBar({
  readyCount,
  maxBatchSize,
  expectedImages,
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
    <div className={`submit-bar ${variant === "inline" ? "workbench-submit" : variant === "top" ? "submit-bar-top" : ""}`}>
      <div>
        {variant !== "inline" ? <><strong>准备提交 {readyCount} 条任务</strong><p>单批最多 {maxBatchSize} 条，文生图并发 {textConcurrency}，图生图并发 {imageConcurrency}。</p></> : null}
        {expectedImages !== undefined && expectedImages > readyCount ? <span className="workbench-submit-count">预计 {expectedImages} 张图片</span> : null}
        {errorMessage ? <p className="submit-error" role="alert">{errorMessage}</p> : null}
      </div>
      <button className="primary-button large-button" disabled={isDisabled} onClick={onSubmit}>
        {submitting ? "提交中..." : variant === "inline" ? `批量生成（${readyCount} 页）` : "开始生成"}
      </button>
    </div>
  );
}
