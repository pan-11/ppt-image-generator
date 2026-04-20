import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">Local Batch Runner</p>
          <h1>Image Generator</h1>
        </div>
        <p className="hero-copy">
          一次性提交最多 50 条任务，固定并发 5 条自动补位，结果图和历史全部保留在本机。
        </p>
      </header>
      <section className="workspace-grid">{children}</section>
    </main>
  );
}
