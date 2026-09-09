import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "../components/layout/app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("uses a compact product header for the courseware workflow", () => {
    render(<AppShell><div>工作区</div></AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: "课件生图工作台" })).toBeInTheDocument();
    expect(screen.getByText("批量生成、补图与导出")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "中转站设置" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText("Image Generator")).not.toBeInTheDocument();
  });
});

it("keeps workbench navigation within the mounted page", () => {
  render(<AppShell workbench><div>编辑内容</div></AppShell>);
  expect(screen.getByRole("link", { name: "页面任务" })).toHaveAttribute("href", "#page-tasks");
  expect(screen.getByRole("link", { name: "生成历史" })).toHaveAttribute("href", "#history");
  expect(screen.getByRole("main")).toHaveClass("workbench-app");
});
