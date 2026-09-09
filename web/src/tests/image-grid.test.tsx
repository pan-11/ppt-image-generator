import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageGrid } from "../components/history/image-grid";

describe("ImageGrid", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders thumbnail previews for generated images", () => {
    render(
      <ImageGrid
        images={[
          {
            id: "image-1",
            filename: "scene.png",
            local_path: "app-data/batch/scene.png"
          }
        ]}
        onDeleteImage={async () => undefined}
      />
    );

    const preview = screen.getByRole("img", { name: "scene.png" });
    expect(preview).toHaveAttribute("src", "/api/download/images/image-1");
  });

  it("confirms the filename before permanently deleting an image", () => {
    const onDeleteImage = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ImageGrid
        images={[{ id: "image-1", filename: "scene.png", local_path: "scene.png" }]}
        onDeleteImage={onDeleteImage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看 scene.png 大图" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(confirm).toHaveBeenCalledWith("永久删除图片 \"scene.png\"？此操作无法撤销。");
    expect(onDeleteImage).not.toHaveBeenCalled();
  });
});

it("keeps all 23 images in order and opens the last image", () => {
  const images = Array.from({ length: 23 }, (_, index) => ({ id: `image-${index}`, filename: `image-${index}.png`, local_path: `/local/${index}` }));
  render(<ImageGrid images={images} onDeleteImage={async () => undefined} />);
  expect(screen.getAllByRole("img")).toHaveLength(23);
  expect(screen.queryByText("/local/22")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "查看 image-22.png 大图" }));
  expect(screen.getByRole("dialog", { name: "历史图片预览" })).toHaveTextContent("23 / 23");
  expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();
});
