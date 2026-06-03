import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskTable } from "../components/tasks/task-table";
import type { TaskDraft } from "../lib/types";

afterEach(() => {
  cleanup();
});

describe("TaskTable", () => {
  it("shows thirty empty prompt rows by default", () => {
    render(<Harness />);

    expect(screen.getAllByRole("textbox")).toHaveLength(30);
    expect(screen.getByText("第 1 张图")).toBeInTheDocument();
    expect(screen.getByText("第 30 张图")).toBeInTheDocument();
  });

  it("keeps at least thirty rows after importing fewer pasted prompts", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByTestId("bulk-open"));
    await user.type(screen.getByTestId("bulk-paste-input"), "forest fox{enter}glass city");
    await user.click(screen.getByTestId("bulk-import"));

    expect(screen.getAllByRole("textbox")).toHaveLength(30);
    expect(screen.getByDisplayValue("forest fox")).toBeInTheDocument();
    expect(screen.getByDisplayValue("glass city")).toBeInTheDocument();
  });

  it("generates only the selected row", async () => {
    const user = userEvent.setup();
    const onGenerateRow = vi.fn();

    render(<Harness onGenerateRow={onGenerateRow} />);

    await user.type(screen.getAllByRole("textbox")[0], "single row prompt");
    await user.click(screen.getAllByRole("button", { name: "生成这张图" })[0]);

    expect(onGenerateRow).toHaveBeenCalledWith(0);
  });
});

function Harness(props: { onGenerateRow?: (index: number) => void }) {
  const [rows, setRows] = useState<TaskDraft[]>([]);

  return (
    <TaskTable
      rows={rows}
      defaults={{
        model: "gemini-2.5-flash-image-preview",
        aspectRatio: "1:1",
        resolution: "1K",
        n: 1,
        globalReferenceImageId: null
      }}
      settings={{
        models: [
          {
            value: "gemini-2.5-flash-image-preview",
            label: "gemini-2.5-flash-image-preview",
            aspectRatios: ["1:1", "16:9"],
            resolutions: ["1K"],
            maxN: 1,
            supportsReferenceImages: true
          }
        ],
        maxBatchSize: 100
      }}
      onRowsChange={setRows}
      generatingRowId={null}
      onGenerateRow={props.onGenerateRow ?? (() => undefined)}
      onUploadReferenceImage={async () => ({
        id: "reference-1",
        filename: "ref.png",
        localPath: "ref.png"
      })}
      onCreateChildTasks={async () => []}
    />
  );
}
