import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../settings-page";
import type { ProviderSetting, ProviderSettingsState } from "../lib/provider-settings-api";
import { AppShell } from "../components/layout/app-shell";

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

function provider(overrides: Partial<ProviderSetting> = {}): ProviderSetting {
  return {
    id: "provider-1",
    name: "中转站 A",
    baseUrl: "https://relay.example.com/v1",
    notes: "正式生图",
    apiKeyMask: "****1234",
    hasApiKey: true,
    protocolType: "ym2-openai-images",
    yunfeiKeyType: undefined,
    maxConcurrency: 100,
    readonly: false,
    capabilities: { text: true, image: true },
    isActiveText: false,
    isActiveImage: false,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides
  };
}

describe("SettingsPage", () => {
  it("links the production workspace to formal relay settings", () => {
    render(<AppShell><div>workspace</div></AppShell>);

    expect(screen.getByRole("link", { name: "中转站设置" })).toHaveAttribute("href", "/settings");
  });

  it("shows independent role selectors and the read-only environment provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      activeTextProviderId: "env:toapis",
      activeImageProviderId: "env:toapis",
      providers: [provider({
        id: "env:toapis",
        name: "环境默认 ToAPIs",
        protocolType: "toapis-async",
        maxConcurrency: 30,
        readonly: true,
        notes: "来自 .env",
        capabilities: { text: true, image: true },
        isActiveText: true,
        isActiveImage: true
      })]
    })));

    render(<SettingsPage />);

    expect(await screen.findByLabelText("文生图中转站")).toHaveValue("env:toapis");
    expect(screen.getByLabelText("图生图中转站")).toHaveValue("env:toapis");
    expect(screen.getByText("来自 .env（只读）")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "中转站设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回生图工作台" })).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("名称")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("协议类型")).toBeInTheDocument();
    expect(screen.queryByLabelText("云飞密钥类型")).not.toBeInTheDocument();
    expect(screen.getByLabelText("最大并发")).toHaveAttribute("max", "100");
    expect(screen.getByLabelText("备注")).toBeInTheDocument();
    expect(screen.queryByText("基准测试")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("比例")).not.toBeInTheDocument();
  });

  it("creates a Yunfei provider with a conditional key product", async () => {
    const user = userEvent.setup();
    let state: ProviderSettingsState = {
      activeTextProviderId: "env:toapis",
      activeImageProviderId: "env:toapis",
      providers: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/provider-settings" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        state = {
          ...state,
          providers: [provider({
            name: body.name,
            baseUrl: body.baseUrl,
            protocolType: body.protocolType,
            yunfeiKeyType: body.yunfeiKeyType,
            notes: body.notes
          })]
        };
        return jsonResponse(state.providers[0], 201);
      }
      return jsonResponse(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await screen.findByRole("heading", { name: "中转站设置" });
    expect(screen.queryByLabelText("云飞密钥类型")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("协议类型"), "yunfei-hybrid-images");
    const keyTypeSelect = screen.getByLabelText("云飞密钥类型") as HTMLSelectElement;
    expect(Array.from(keyTypeSelect.options).map((option) => [option.value, option.textContent])).toEqual([
      ["gpt-image-2-1k", "GPT Image 2 · 1K"],
      ["gpt-image-2-4k", "GPT Image 2 · 4K"],
      ["banana-2", "香蕉2（支持 1K / 2K / 4K）"],
      ["banana-pro", "香蕉Pro（支持 1K / 2K / 4K）"]
    ]);
    expect(keyTypeSelect).toHaveValue("gpt-image-2-1k");
    await user.selectOptions(keyTypeSelect, "banana-2");
    await user.type(screen.getByLabelText("名称"), "云飞 香蕉2");
    await user.type(screen.getByLabelText("Base URL"), "https://img.yunfei.best");
    await user.type(screen.getByLabelText("API Key"), "yunfei-secret-4321");
    await user.click(screen.getByRole("button", { name: "保存中转站" }));

    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody).toMatchObject({
      protocolType: "yunfei-hybrid-images",
      yunfeiKeyType: "banana-2"
    });
    expect(postBody).not.toHaveProperty("resolutionTier");
    expect(await screen.findByText("密钥类型 香蕉2")).toBeInTheDocument();
    expect(screen.queryByText("yunfei-secret-4321")).not.toBeInTheDocument();
  });

  it("edits a Yunfei key product while leaving the stored key masked", async () => {
    const user = userEvent.setup();
    const state: ProviderSettingsState = {
      activeTextProviderId: "provider-1",
      activeImageProviderId: "provider-1",
      providers: [provider({
        name: "云飞 香蕉Pro",
        protocolType: "yunfei-hybrid-images",
        yunfeiKeyType: "banana-pro",
        isActiveText: true,
        isActiveImage: true
      })]
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(state));
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await user.click(await screen.findByRole("button", { name: "编辑云飞 香蕉Pro" }));

    expect(screen.getByLabelText("云飞密钥类型")).toHaveValue("banana-pro");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(screen.queryByDisplayValue("****1234")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
      protocolType: "yunfei-hybrid-images",
      yunfeiKeyType: "banana-pro",
      apiKey: ""
    });
  });

  it("creates a provider with protocol and concurrency and renders only its masked key", async () => {
    const user = userEvent.setup();
    let state: ProviderSettingsState = {
      activeTextProviderId: "env:toapis",
      activeImageProviderId: "env:toapis",
      providers: []
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/provider-settings" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        state = { ...state, providers: [provider({ name: body.name, baseUrl: body.baseUrl, notes: body.notes })] };
        return jsonResponse(state.providers[0], 201);
      }
      return jsonResponse(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await screen.findByRole("heading", { name: "中转站设置" });
    await user.type(screen.getByLabelText("名称"), "中转站 A");
    await user.type(screen.getByLabelText("Base URL"), "https://relay.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "secret-key-1234");
    await user.selectOptions(screen.getByLabelText("协议类型"), "ym2-openai-images");
    await user.clear(screen.getByLabelText("最大并发"));
    await user.type(screen.getByLabelText("最大并发"), "100");
    await user.type(screen.getByLabelText("备注"), "正式生图");
    await user.click(screen.getByRole("button", { name: "保存中转站" }));

    expect(await screen.findByText("****1234")).toBeInTheDocument();
    expect(screen.queryByText("secret-key-1234")).not.toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      name: "中转站 A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "secret-key-1234",
      protocolType: "ym2-openai-images",
      maxConcurrency: 100,
      notes: "正式生图"
    });
  });

  it("selects text and image providers independently", async () => {
    const user = userEvent.setup();
    let state: ProviderSettingsState = {
      activeTextProviderId: "env:toapis",
      activeImageProviderId: "env:toapis",
      providers: [provider({ id: "env:toapis", name: "环境默认 ToAPIs", readonly: true }), provider()]
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/roles/") && init?.method === "POST") {
        const role = url.endsWith("/text") ? "text" : "image";
        const { providerId } = JSON.parse(String(init.body));
        state = role === "text"
          ? { ...state, activeTextProviderId: providerId }
          : { ...state, activeImageProviderId: providerId };
        return jsonResponse(state);
      }
      return jsonResponse(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await user.selectOptions(await screen.findByLabelText("文生图中转站"), "provider-1");
    await user.selectOptions(screen.getByLabelText("图生图中转站"), "provider-1");

    const roleCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/roles/"));
    expect(roleCalls.map((call) => String(call[0]))).toEqual([
      "/api/provider-settings/roles/text",
      "/api/provider-settings/roles/image"
    ]);
    expect(roleCalls.every((call) => JSON.parse(String(call[1]?.body)).providerId === "provider-1"))
      .toBe(true);
  });

  it("edits with a blank key and displays an unsafe-edit conflict", async () => {
    const user = userEvent.setup();
    const state: ProviderSettingsState = {
      activeTextProviderId: "provider-1",
      activeImageProviderId: "provider-1",
      providers: [provider({ isActiveText: true, isActiveImage: true })]
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/provider-1") && init?.method === "PUT") {
        return jsonResponse({ message: "仍有远程任务依赖当前中转站配置，请先完成或处理这些任务" }, 409);
      }
      return jsonResponse(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    await user.click(await screen.findByRole("button", { name: "编辑中转站 A" }));
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    await user.clear(screen.getByLabelText("Base URL"));
    await user.type(screen.getByLabelText("Base URL"), "https://relay.example.com/v2");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("仍有远程任务依赖当前中转站配置，请先完成或处理这些任务");
    });
    const body = JSON.parse(String(fetchMock.mock.calls.find((call) => call[1]?.method === "PUT")?.[1]?.body));
    expect(body.apiKey).toBe("");
  });
});
