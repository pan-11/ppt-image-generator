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

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(confirm).toHaveBeenCalledWith("永久删除图片 \"scene.png\"？此操作无法撤销。");
    expect(onDeleteImage).not.toHaveBeenCalled();
  });
});
