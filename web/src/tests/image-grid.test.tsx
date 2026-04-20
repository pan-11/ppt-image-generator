import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageGrid } from "../components/history/image-grid";

describe("ImageGrid", () => {
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
});
