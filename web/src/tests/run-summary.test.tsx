import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunSummary } from "../components/monitor/run-summary";

describe("RunSummary", () => {
  it("shows queued and running counts", () => {
    render(
      <RunSummary
        queued={45}
        running={5}
        completed={3}
        failed={1}
        unknown={2}
      />
    );

    expect(screen.getByText("等待中 45")).toBeInTheDocument();
    expect(screen.getByText("运行中 5")).toBeInTheDocument();
    expect(screen.getByText("状态未知 2")).toBeInTheDocument();
  });
});
