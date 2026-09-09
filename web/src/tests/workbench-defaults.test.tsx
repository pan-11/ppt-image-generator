import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DefaultsBar } from "../components/tasks/defaults-bar";
import { fallbackSettings } from "../hooks/use-settings";
const model = fallbackSettings.roles.text.models[0];
const defaults = { model: model.value, aspectRatio: model.aspectRatios[0], resolution: model.resolutions[0], n: 1, globalReferenceImageId: null };
afterEach(cleanup);
it("keeps default fields mounted through collapse without changing saved parameters", () => {
  const onDefaultsChange = vi.fn();
  render(<DefaultsBar defaults={defaults} roles={fallbackSettings.roles} uploading={false} globalReferenceImage={null} onDefaultsChange={onDefaultsChange} onUploadGlobalReference={vi.fn()} />);
  const field = screen.getByLabelText("模型");
  expect(field).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "修改参数" }));
  expect(field).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "收起参数" }));
  expect(screen.getByLabelText("模型")).toBe(field);
  expect(field).not.toBeVisible();
  expect(onDefaultsChange).not.toHaveBeenCalled();
});
it("exposes unsupported defaults and validation even before expanding", () => {
  render(<DefaultsBar defaults={{ ...defaults, model: "unsupported" }} roles={fallbackSettings.roles} uploading={false} globalReferenceImage={null} onDefaultsChange={vi.fn()} onUploadGlobalReference={vi.fn()} />);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("模型")).toBeVisible();
});
