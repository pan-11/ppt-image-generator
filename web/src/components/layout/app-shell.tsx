import type { PropsWithChildren } from "react";

export function AppShell({ children, workbench = false }: PropsWithChildren<{ workbench?: boolean }>) {
  return (
    <main className={`app-shell${workbench ? " workbench-app" : ""}`}>
      <header className={workbench ? "workbench-header" : "hero-panel"}>
        <div>
          {!workbench ? <p className="eyebrow">课件生产工具</p> : null}
          <h1>课件生图工作台</h1>
          {!workbench ? <p className="hero-subtitle">批量生成、补图与导出</p> : null}
        </div>
        <nav aria-label="工作台导航">
          {workbench ? <><a className="settings-link" href="#page-tasks">页面任务</a><a className="settings-link" href="#history">生成历史</a></> : null}
          <a className="settings-link" href="/settings">中转站设置</a>
        </nav>
      </header>
      <section className="workspace-grid">{children}</section>
    </main>
  );
}
