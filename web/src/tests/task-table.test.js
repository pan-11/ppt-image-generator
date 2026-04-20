import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TaskTable } from "../components/tasks/task-table";
describe("TaskTable", () => {
    it("creates one row per pasted prompt", async () => {
        const user = userEvent.setup();
        render(_jsx(Harness, {}));
        await user.click(screen.getByRole("button", { name: "批量粘贴" }));
        await user.type(screen.getByLabelText("提示词列表"), "forest fox{enter}glass city");
        await user.click(screen.getByRole("button", { name: "导入 2 条" }));
        expect(screen.getAllByPlaceholderText("输入提示词")).toHaveLength(2);
    });
});
function Harness() {
    const [rows, setRows] = useState([]);
    return (_jsx(TaskTable, { rows: rows, defaults: {
            model: "gpt-image-1",
            size: "1024x1024",
            n: 1,
            globalReferenceImageId: null
        }, settings: {
            models: [
                {
                    value: "gpt-image-1",
                    label: "GPT Image 1",
                    sizes: ["1024x1024"],
                    maxN: 10,
                    supportsReferenceImages: true
                }
            ],
            maxBatchSize: 50
        }, onRowsChange: setRows, onUploadReferenceImage: async () => ({
            id: "reference-1",
            filename: "ref.png",
            localPath: "ref.png"
        }) }));
}
