import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { StaticPreviewPage } from "../components/preview/static-preview-page";

afterEach(() => {
  cleanup();
});

describe("StaticPreviewPage", () => {
  it("shows thirty main PPT prompt rows", () => {
    render(<StaticPreviewPage />);

    expect(screen.getAllByLabelText(/第\d+页主提示词/)).toHaveLength(30);
  });

  it("shows a multi-level horizontal generation branch on the first row", () => {
    render(<StaticPreviewPage />);

    expect(screen.getByTestId("preview-node-result-1")).toBeInTheDocument();
    expect(screen.getByTestId("preview-node-result-2")).toBeInTheDocument();
    expect(screen.getByTestId("preview-node-result-3")).toBeInTheDocument();
    expect(screen.getByTestId("preview-node-result-4")).toBeInTheDocument();
    expect(screen.getAllByText("以这个图为参考图")).not.toHaveLength(0);
  });

  it("adds another child prompt input under a result image", async () => {
    const user = userEvent.setup();
    render(<StaticPreviewPage />);

    const firstPromptList = screen.getByTestId("preview-prompts-result-1");
    expect(within(firstPromptList).getAllByLabelText(/子提示词/)).toHaveLength(2);

    await user.click(screen.getByTestId("preview-add-prompt-result-1"));

    expect(within(firstPromptList).getAllByLabelText(/子提示词/)).toHaveLength(3);
  });
});
