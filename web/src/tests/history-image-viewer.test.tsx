import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageGrid } from "../components/history/image-grid";
const images = [1, 2, 3].map((id) => ({ id: `i${id}`, filename: `${id}.png`, local_path: `/local/${id}.png` }));
const open = (name = "2.png") => fireEvent.click(screen.getByRole("button", { name: `查看 ${name} 大图` }));
const dialog = () => screen.getByRole("dialog", { name: "历史图片预览" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("history image viewer", () => {
  it("starts at the selected ID, supports arrows and never wraps", () => {
    render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
    open();
    expect(within(dialog()).getByRole("img")).toHaveAttribute("src", "/api/download/images/i2");
    fireEvent.keyDown(screen.getByRole("button", { name: "关闭" }), { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一张" }));
    fireEvent.click(screen.getByRole("button", { name: "下一张" }));
    expect(dialog()).toHaveTextContent("3 / 3");
    expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();
    expect(within(dialog()).getByRole("link", { name: "下载" })).toHaveAttribute("href", "/api/download/images/i3");
  });
  it("keeps selection across refresh reorder and closes when removed", async () => {
    const view = render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
    open();
    view.rerender(<ImageGrid images={[images[1], images[0], images[2]]} onDeleteImage={async () => undefined} />);
    expect(dialog()).toHaveTextContent("1 / 3");
    expect(within(dialog()).getByRole("img")).toHaveAttribute("alt", "2.png");
    view.rerender(<ImageGrid images={[images[0], images[2]]} onDeleteImage={async () => undefined} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("region", { name: "批次图片" })).toHaveFocus());
  });
  it("shows failed deletion and prevents duplicate deletion and navigation while pending", async () => {
    let reject!: (reason: Error) => void;
    const onDeleteImage = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ImageGrid images={images} onDeleteImage={onDeleteImage} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("button", { name: "删除中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();
    await act(async () => reject(new Error("删除失败请重试")));
    expect(screen.getByRole("alert")).toHaveTextContent("删除失败请重试");
    expect(onDeleteImage).toHaveBeenCalledWith("i2");
  });
  it("does not close a later viewer when an earlier deletion resolves", async () => {
    let resolve!: () => void;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ImageGrid images={images} onDeleteImage={() => new Promise<void>((done) => { resolve = done; })} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    open("3.png");
    await act(async () => resolve());
    expect(within(dialog()).getByRole("img")).toHaveAttribute("alt", "3.png");
  });
  it("returns focus to the original thumbnail after navigation and Escape", async () => {
    render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
    const trigger = screen.getByRole("button", { name: "查看 2.png 大图" });
    trigger.focus(); open();
    fireEvent.click(screen.getByRole("button", { name: "下一张" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "关闭" }), { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("returns focus to the history title if the batch disappears", async () => {
    const view = render(<><h2 id="history-title" tabIndex={-1}>历史</h2><ImageGrid images={images} onDeleteImage={async () => undefined} /></>);
    open();
    view.rerender(<h2 id="history-title" tabIndex={-1}>历史</h2>);
    await waitFor(() => expect(screen.getByRole("heading")).toHaveFocus());
  });
});

it("closes after successful deletion and focuses the strip even when original thumbnail remains", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "下一张" }));
  fireEvent.click(screen.getByRole("button", { name: "删除" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("region", { name: "批次图片" })).toHaveFocus());
});

it("focuses the strip when refresh removes a navigated selection but keeps the original thumbnail", async () => {
  const view = render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
  open("1.png");
  fireEvent.click(screen.getByRole("button", { name: "下一张" }));
  view.rerender(<ImageGrid images={[images[0], images[2]]} onDeleteImage={async () => undefined} />);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("region", { name: "批次图片" })).toHaveFocus());
});
