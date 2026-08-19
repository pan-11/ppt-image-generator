import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../components/layout/app-shell";

describe("AppShell", () => {
  it("uses a compact product header for the courseware workflow", () => {
    render(<AppShell><div>工作区</div></AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: "课件生图工作台" })).toBeInTheDocument();
    expect(screen.getByText("批量生成、补图与导出")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "中转站设置" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText("Image Generator")).not.toBeInTheDocument();
  });
});
