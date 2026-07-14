import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LabPage from "../lab-page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("LabPage", () => {
  it("shows masked relay keys and never renders the stored key", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/lab/providers") {
        return jsonResponse([{ id: "provider-1", name: "中转站 A", baseUrl: "https://relay.example.com/v1", protocol: "toapis", enabled: true, notes: "1K 速度稳定", apiKeyMask: "****1234", hasApiKey: true, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" }]);
      }
      if (url === "/api/lab/benchmarks") {
        return jsonResponse([]);
      }
      return jsonResponse({ message: "not found" }, 404);
    }));

    render(<LabPage />);

    expect((await screen.findAllByText("中转站 A")).length).toBeGreaterThan(0);
    expect(screen.getByText("****1234")).toBeInTheDocument();
    expect(screen.getByText("1K 速度稳定")).toBeInTheDocument();
    expect(screen.queryByText("stored-secret-1234")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回生图工作台" })).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("模型")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("参考图（可选）")).toHaveAttribute("type", "file");
  });

  it("adds a relay configuration from the settings form", async () => {
    const user = userEvent.setup();
    let providers: unknown[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/lab/providers" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        providers = [{ ...body, id: "provider-2", protocol: "toapis", apiKeyMask: "****7890", hasApiKey: true, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" }];
        return jsonResponse(providers[0], 201);
      }
      if (url === "/api/lab/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/lab/benchmarks") {
        return jsonResponse([]);
      }
      return jsonResponse({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LabPage />);

    await user.type(screen.getByLabelText("中转站名称"), "中转站 B");
    await user.type(screen.getByLabelText("Base URL"), "https://relay-b.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "secret-7890");
    await user.type(screen.getByLabelText("测试备注"), "参考图测试成功，生成较快");
    await user.click(screen.getByRole("button", { name: "添加中转站" }));

    expect((await screen.findAllByText("中转站 B")).length).toBeGreaterThan(0);
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({ apiKey: "secret-7890", notes: "参考图测试成功，生成较快" });
    expect(screen.queryByText("secret-7890")).not.toBeInTheDocument();
  });

  it("submits a manual model and optional reference image as multipart data", async () => {
    const user = userEvent.setup();
    const provider = { id: "provider-3", name: "中转站 C", baseUrl: "https://relay-c.example.com/v1", protocol: "toapis", enabled: true, notes: "", apiKeyMask: "****3333", hasApiKey: true, createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" };
    let records: unknown[] = [];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/lab/providers") {
        return jsonResponse([provider]);
      }
      if (url === "/api/lab/benchmarks" && init?.method === "POST") {
        records = [{ id: "run-1", providerId: provider.id, providerName: provider.name, prompt: "参考图测试", model: "manual-image-model", aspectRatio: "16:9", resolution: "1K", testMode: "reference-image", referenceFilename: "reference.png", status: "completed", uploadMs: 10, submitMs: 20, generationMs: 30, downloadMs: 10, totalMs: 70, reportedUsage: null, reportedCost: null, errorMessage: null, imageUrl: "/api/lab/benchmarks/run-1/image", createdAt: "2026-07-14T00:00:00.000Z" }];
        return jsonResponse(records[0], 201);
      }
      if (url === "/api/lab/benchmarks") {
        return jsonResponse(records);
      }
      return jsonResponse({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LabPage />);

    expect((await screen.findAllByText("中转站 C")).length).toBeGreaterThan(0);
    const modelInput = screen.getByLabelText("模型");
    await user.clear(modelInput);
    await user.type(modelInput, "manual-image-model");
    await user.type(screen.getByLabelText("提示词"), "参考图测试");
    await user.upload(screen.getByLabelText("参考图（可选）"), new File(["image"], "reference.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "提交参考图测试" }));

    const benchmarkCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/lab/benchmarks" && call[1]?.method === "POST");
    const submittedForm = benchmarkCall?.[1]?.body as FormData;
    expect(submittedForm).toBeInstanceOf(FormData);
    expect(submittedForm.get("model")).toBe("manual-image-model");
    expect((submittedForm.get("referenceImage") as File).name).toBe("reference.png");
    expect(await screen.findByText("参考图")).toBeInTheDocument();
  });
});
