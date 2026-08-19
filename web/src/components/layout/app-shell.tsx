import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">课件生产工具</p>
          <h1>课件生图工作台</h1>
          <p className="hero-subtitle">批量生成、补图与导出</p>
        </div>
        <a className="settings-link" href="/settings">中转站设置</a>
      </header>
      <section className="workspace-grid">{children}</section>
    </main>
  );
}
