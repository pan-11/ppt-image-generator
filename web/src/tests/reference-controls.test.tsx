import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskTable } from "../components/tasks/task-table";
import { TaskRow } from "../components/tasks/task-row";
import { BulkPasteModal } from "../components/tasks/bulk-paste-modal";
import { fallbackSettings } from "../hooks/use-settings";
import type { ReferenceImageRecord, TaskDraft } from "../lib/types";
import { fetchReferenceImage } from "../lib/api";
import { ReferenceImageField } from "../components/tasks/reference-image-field";

vi.mock("../lib/api", async (original) => ({ ...await original<object>(), fetchReferenceImage: vi.fn(async (id: string) => ({ id, filename: `${id}.png`, localPath: id })) }));
const model = fallbackSettings.roles.text.models[0];
const defaults = { model: model.value, aspectRatio: model.aspectRatios[0], resolution: model.resolutions[0], n: 1, globalReferenceImageId: null };
const reference = { id: "new-ref", filename: "robot.png", localPath: "robot.png" };
const row: TaskDraft = { ...defaults, id: "page-1", prompt: "exact prompt", note: "", referenceMode: "none", referenceImageId: null };
const upload = vi.fn<(file: File) => Promise<ReferenceImageRecord>>();
beforeEach(() => { upload.mockResolvedValue(reference); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Harness(props: { onShared?: ReturnType<typeof vi.fn>; onImport?: ReturnType<typeof vi.fn>; onChild?: ReturnType<typeof vi.fn>; initialRow?: TaskDraft; scope?: string }) {
  const [rows, setRows] = useState([props.initialRow ?? row]);
  return <TaskTable rows={rows} pageScopeId={props.scope} defaults={defaults} settings={fallbackSettings} onRowsChange={setRows} onGenerateRow={vi.fn()} onUploadReferenceImage={upload} onSharedReferenceChange={props.onShared} onImport={props.onImport} onCreateChildTasks={props.onChild ?? vi.fn().mockResolvedValue([])} previewImages={[{ id: "source", task_id: "task-1", filename: "source.png", local_path: "source.png" }]} batchTasks={[]} getPageSelection={() => ({ page: { id: "page-1", position: 0, sourcePageName: "", sourcePageNumber: "", included: true, selectedImageId: "source", draft: row }, detail: { images: [{ id: "source", task_id: "task-1", filename: "source.png", local_path: "source.png" }], tasks: [], links: [{ pageId: "page-1", taskId: "task-1", purpose: "original" }] }, onChange: vi.fn(), onMove: vi.fn(), first: true, last: true } as never)} />;
}

it("stages shared uploads and does not apply a cancelled dialog", async () => {
  const user = userEvent.setup(); const onShared = vi.fn();
  render(<Harness onShared={onShared} />);
  await user.click(screen.getByRole("button", { name: "共用参考图" }));
  const dialog = screen.getByRole("dialog", { name: "共用参考图" });
  expect(within(dialog).getByRole("checkbox", { name: /同时应用到/ })).not.toBeChecked();
  await user.upload(within(dialog).getByLabelText("上传共用参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  expect(await within(dialog).findByText("robot.png")).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(onShared).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "共用参考图" }));
  expect(screen.queryByText("robot.png")).not.toBeInTheDocument();
});

it("passes an explicit opt-out default when applying a staged shared upload", async () => {
  const user = userEvent.setup(); const onShared = vi.fn().mockResolvedValue(undefined);
  render(<Harness onShared={onShared} />);
  await user.click(screen.getByRole("button", { name: "共用参考图" }));
  await user.upload(screen.getByLabelText("上传共用参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "应用共用参考图" }));
  expect(onShared).toHaveBeenCalledWith(reference, false);
});

it("includes the staged reference in bulk import and marks imported rows global", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup(); const onImport = vi.fn().mockResolvedValue(undefined);
  render(<Harness onImport={onImport} />);
  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), { target: { value: "  first prompt  \nsecond prompt" } });
  await user.upload(screen.getByLabelText("上传本次导入共用参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByTestId("bulk-import"));
  expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ globalReferenceImageId: "new-ref" }), expect.arrayContaining([expect.objectContaining({ referenceMode: "global" })]));
});

it("shows row reference selection beside the prompt and blocks generation during upload", async () => {
  let resolve!: (value: ReferenceImageRecord) => void;
  upload.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "编辑提示词" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "本页参考图" }), "row");
  await user.upload(screen.getByLabelText("上传当前行参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();
  await act(async () => { resolve(reference); });
  expect(await screen.findByText("robot.png")).toBeVisible();
  expect(screen.getByRole("img", { name: "参考图 robot.png" })).toHaveAttribute("src", "/api/reference-images/new-ref/content");
  expect(screen.getByRole("textbox", { name: "提示词" })).toHaveValue("exact prompt");
});

it("keeps failed uploads visible and cancel restores generation without changing the prompt", async () => {
  upload.mockRejectedValueOnce(new Error("上传失败：文件损坏"));
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "编辑提示词" }));
  await user.upload(screen.getByLabelText("上传当前行参考图"), new File(["broken"], "broken.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("文件损坏");
  expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "取消上传" }));
  expect(screen.getByRole("button", { name: "生成这张图" })).toBeEnabled();
});

it("submits fixed source plus per-draft auxiliary without rewriting edit text", async () => {
  const user = userEvent.setup(); const onChild = vi.fn().mockResolvedValue([]);
  render(<Harness onChild={onChild} />);
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "  keep exact edit  ");
  await user.upload(screen.getByLabelText("上传补充参考图 1"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "新增一条" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 2" }), "second edit");
  await user.click(screen.getByRole("button", { name: "生成子图" }));
  await waitFor(() => expect(onChild).toHaveBeenCalledWith("source", [expect.objectContaining({ prompt: "  keep exact edit  ", auxiliaryReferenceImageId: "new-ref", referenceImageId: null }), expect.objectContaining({ prompt: "second edit", auxiliaryReferenceImageId: null })]));
});

it("ignores late upload completion after cancelling and after switching the referenced asset", async () => {
  let resolve!: (value: ReferenceImageRecord) => void;
  upload.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const onChange = vi.fn(); const user = userEvent.setup();
  const { rerender } = render(<ReferenceImageField referenceId={null} label="上传参考图" onUpload={upload} onChange={onChange} />);
  await user.upload(screen.getByLabelText("上传参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "取消上传" }));
  await act(async () => resolve(reference));
  expect(onChange).not.toHaveBeenCalled();
  upload.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await user.upload(screen.getByLabelText("上传参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  rerender(<ReferenceImageField referenceId="other" label="上传参考图" onUpload={upload} onChange={onChange} />);
  await act(async () => resolve(reference));
  expect(await screen.findByText("other.png")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

it("blocks dependent generation when restored metadata fails until the reference is removed", async () => {
  vi.mocked(fetchReferenceImage).mockRejectedValueOnce(new Error("missing file"));
  const onBlockedChange = vi.fn(); const user = userEvent.setup();
  function Field() { const [id, setId] = useState<string | null>("missing"); return <ReferenceImageField referenceId={id} label="上传参考图" onUpload={upload} onChange={(record) => setId(record?.id ?? null)} onBlockedChange={onBlockedChange} />; }
  render(<Field />);
  expect(await screen.findByRole("alert")).toHaveTextContent("参考图不可用，请重新上传或选择不使用");
  expect(onBlockedChange).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "取消使用" }));
  await waitFor(() => expect(onBlockedChange).toHaveBeenLastCalledWith(false));
});

it("preserves auxiliary across collapse and removes only auxiliary when cancelled", async () => {
  const user = userEvent.setup(); const onChild = vi.fn().mockResolvedValue([]);
  render(<Harness onChild={onChild} />);
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "change only robot");
  await user.upload(screen.getByLabelText("上传补充参考图 1"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  expect(screen.getByText("robot.png")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "取消使用" }));
  expect(screen.getByRole("img", { name: "固定原图 source.png" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "生成子图" }));
  expect(onChild).toHaveBeenCalledWith("source", [expect.objectContaining({ auxiliaryReferenceImageId: null, prompt: "change only robot" })]);
});

it("allows selecting a reference from a text-only model and exposes image-role validation", async () => {
  const user = userEvent.setup();
  function TextOnlyRow() { const [rows, setRows] = useState([row]); return <TaskTable rows={rows} defaults={defaults} settings={{ ...fallbackSettings, roles: { text: { ...fallbackSettings.roles.text, models: [{ ...model, supportsReferenceImages: false }] }, image: { ...fallbackSettings.roles.image, models: [{ ...model, value: "image-model" }] } } }} onRowsChange={setRows} onGenerateRow={vi.fn()} onUploadReferenceImage={upload} onCreateChildTasks={vi.fn()} />; }
  render(<TextOnlyRow />);
  await user.click(screen.getByRole("button", { name: "编辑提示词" }));
  expect(screen.getByRole("combobox", { name: "本页参考图" })).toBeEnabled();
  await user.upload(screen.getByLabelText("上传当前行参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  expect(await screen.findByText(/不支持模型/)).toBeVisible();
  expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();
});

it("explains reference blocking while the prompt editor is collapsed", async () => {
  vi.mocked(fetchReferenceImage).mockRejectedValueOnce(new Error("missing file"));
  render(<Harness initialRow={{ ...row, referenceMode: "row", referenceImageId: "missing" }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled());
  expect(await screen.findByText("参考图正在处理或不可用，请打开编辑提示词查看详情。", { selector: "p" })).toBeVisible();
});

it("does not apply a late row upload after changing to follow an empty shared reference", async () => {
  let resolve!: (value: ReferenceImageRecord) => void;
  upload.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "编辑提示词" }));
  await user.upload(screen.getByLabelText("上传当前行参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "本页参考图" }), "global");
  await act(async () => resolve(reference));
  expect(screen.getByRole("combobox", { name: "本页参考图" })).toHaveValue("global");
  expect(screen.queryByText("robot.png")).not.toBeInTheDocument();
});

it("clears staged bulk references when switching courseware during upload", async () => {
  let resolve!: (value: ReferenceImageRecord) => void;
  upload.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const user = userEvent.setup(); const { rerender } = render(<Harness scope="course-a" />);
  await user.click(screen.getByRole("button", { name: "批量导入提示词" }));
  fireEvent.change(screen.getByTestId("bulk-paste-input"), { target: { value: "old course text" } });
  await user.upload(screen.getByLabelText("上传本次导入共用参考图"), new File(["image"], "robot.png", { type: "image/png" }));
  rerender(<Harness scope="course-b" />);
  await act(async () => resolve(reference));
  expect(screen.queryByText("robot.png")).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("old course text")).not.toBeInTheDocument();
});

it("rejects oversized references before upload and retains the existing thumbnail", async () => {
  const user = userEvent.setup(); const onChange = vi.fn();
  render(<ReferenceImageField referenceId="old" label="上传参考图" onUpload={upload} onChange={onChange} />);
  expect(await screen.findByText("old.png")).toBeVisible();
  const file = new File(["image"], "huge.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 + 1 });
  await user.upload(screen.getByLabelText("上传参考图"), file);
  expect(await screen.findByRole("alert")).toHaveTextContent("超过 20 MiB");
  expect(upload).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "参考图 old.png" })).toBeVisible();
});

it("exposes final-image upload on unsaved empty pages without candidates", async () => {
  const onUploadFinalImage = vi.fn().mockResolvedValue(undefined); const user = userEvent.setup();
  render(<TaskTable rows={[row]} defaults={defaults} settings={fallbackSettings} onRowsChange={vi.fn()} onGenerateRow={vi.fn()} onUploadReferenceImage={upload} onCreateChildTasks={vi.fn()} onUploadFinalImage={onUploadFinalImage} />);
  const file = new File(["image"], "final.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("上传成品图"), file);
  expect(onUploadFinalImage).toHaveBeenCalledWith("page-1", file, expect.any(String));
});

it("uses uploaded images without source tasks as fixed parents for modifications", async () => {
  const user = userEvent.setup(); const onChild = vi.fn().mockResolvedValue([]);
  const image = { id: "uploaded-parent", task_id: null, filename: "uploaded.png", local_path: "uploaded.png", source: "upload" as const, courseware_id: "course", page_id: row.id };
  render(<TaskRow rowNumber={1} row={row} roles={fallbackSettings.roles} globalReferenceImageId="shared" pageSelection={{ page: { id: row.id, included: true, selectedImageId: image.id, draft: row, position: 0, sourcePageName: "", sourcePageNumber: "" }, detail: { courseware: { id: "course" }, images: [image], tasks: [], links: [] }, onChange: vi.fn(), onMove: vi.fn(), first: true, last: true } as never} onChange={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onGenerate={vi.fn()} onUploadReference={upload} onCreateChildTasks={onChild} />);
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "edit uploaded source");
  await user.upload(screen.getByLabelText("上传补充参考图 1"), new File(["image"], "robot.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "生成子图" }));
  expect(onChild).toHaveBeenCalledWith(image.id, [expect.objectContaining({ prompt: "edit uploaded source", referenceImageId: null, auxiliaryReferenceImageId: reference.id })]);
});

it("preserves reference selection when a newly selected image model cannot accept it", async () => {
  const user = userEvent.setup();
  const roles = { ...fallbackSettings.roles, image: { ...fallbackSettings.roles.image, models: [model, { ...model, value: "unsupported-reference", label: "Unsupported reference", supportsReferenceImages: false }] } };
  function Row() { const [draft, setDraft] = useState({ ...row, referenceMode: "row" as const, referenceImageId: "existing" }); return <TaskRow rowNumber={1} row={draft} roles={roles} globalReferenceImageId={null} onChange={(next) => setDraft(next as typeof draft)} onDuplicate={vi.fn()} onDelete={vi.fn()} onGenerate={vi.fn()} onUploadReference={upload} onCreateChildTasks={vi.fn()} />; }
  render(<Row />);
  await user.click(screen.getByRole("button", { name: "页面参数" }));
  await screen.findByText("existing.png");
  await user.selectOptions(screen.getByRole("combobox", { name: "模型" }), "unsupported-reference");
  expect(screen.getByRole("combobox", { name: "本页参考图" })).toHaveValue("row");
  expect(screen.getByText("existing.png")).toBeVisible();
  expect(screen.getByRole("button", { name: "生成这张图" })).toBeDisabled();
  expect(screen.getByText(/当前图生图模型不支持参考图/)).toBeVisible();
});

it("blocks child generation when the image-role model lacks reference support", async () => {
  const user = userEvent.setup();
  const roles = { ...fallbackSettings.roles, image: { ...fallbackSettings.roles.image, models: [{ ...model, supportsReferenceImages: false }] } };
  render(<TaskRow rowNumber={1} row={row} roles={roles} globalReferenceImageId={null} previewImages={[{ id: "parent", task_id: "task", filename: "parent.png", local_path: "parent.png" }]} onChange={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onGenerate={vi.fn()} onUploadReference={upload} onCreateChildTasks={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  await user.type(screen.getByRole("textbox", { name: "子提示词 1" }), "edit");
  expect(screen.getByRole("button", { name: "生成子图" })).toBeDisabled();
  expect(screen.getByText(/当前图生图模型不支持参考图/)).toBeVisible();
});

it("starts bulk import with the current shared reference and allows explicitly opting out", async () => {
  const user = userEvent.setup(); const onImport = vi.fn();
  render(<BulkPasteModal open maxBatchSize={100} initialReferenceId="shared" onUploadReference={upload} onClose={vi.fn()} onImport={onImport} />);
  fireEvent.change(screen.getByTestId("bulk-paste-input"), { target: { value: "prompt" } });
  expect(await screen.findByText("shared.png")).toBeVisible();
  await user.click(screen.getByTestId("bulk-import"));
  expect(onImport).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ globalReferenceImageId: "shared" }));
  await user.click(screen.getByRole("button", { name: "取消使用" }));
  await user.click(screen.getByTestId("bulk-import"));
  expect(onImport).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ globalReferenceImageId: null }));
});

it("summarizes page modes and shows how many opt-out pages shared apply can include", async () => {
  const user = userEvent.setup();
  const rows: TaskDraft[] = [{ ...row, id: "global", referenceMode: "global" }, { ...row, id: "custom", referenceMode: "row", referenceImageId: "custom" }, { ...row, id: "none", referenceMode: "none" }];
  render(<TaskTable rows={rows} defaults={{ ...defaults, globalReferenceImageId: "shared" }} settings={fallbackSettings} onRowsChange={vi.fn()} onGenerateRow={vi.fn()} onUploadReferenceImage={upload} onCreateChildTasks={vi.fn()} onSharedReferenceChange={vi.fn()} />);
  expect(screen.getByText("跟随共用图 1 页 · 专用图 1 页 · 不使用 1 页")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "共用参考图" }));
  expect(screen.getByRole("checkbox", { name: "同时应用到已选“不使用”的页面（1 页）" })).not.toBeChecked();
});

it("opens references through row status and keeps prompt, parameters and image editor mutually exclusive", async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "参考图：无" }));
  expect(screen.getByRole("textbox", { name: "提示词" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "本页参考图" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "页面参数" }));
  expect(screen.queryByRole("textbox", { name: "提示词" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "模型" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "基于此图修改" }));
  expect(screen.queryByRole("combobox", { name: "模型" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "子提示词 1" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "参考图：无" }));
  expect(screen.queryByRole("textbox", { name: "子提示词 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "提示词" })).toBeVisible();
});
