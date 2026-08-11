import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../settings-page";
import type { ProviderSettingsState } from "../lib/provider-settings-api";
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

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-1",
    name: "中转站 A",
    baseUrl: "https://relay.example.com/v1",
    notes: "正式生图",
    apiKeyMask: "****1234",
    hasApiKey: true,
    isActive: false,
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

  it("shows env fallback and only the formal provider controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      activeProviderId: null,
      usingEnvFallback: true,
      providers: []
    })));

    render(<SettingsPage />);

    expect(await screen.findByText("环境变量配置")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "中转站设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回生图工作台" })).toHaveAttribute("href", "/");
    expect(screen.getByLabelText("名称")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("备注")).toBeInTheDocument();
    expect(screen.queryByText("基准测试")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("比例")).not.toBeInTheDocument();
  });

  it("creates a provider and renders only its masked key", async () => {
    const user = userEvent.setup();
    let state: ProviderSettingsState = {
      activeProviderId: null,
      usingEnvFallback: true,
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

    await screen.findByText("环境变量配置");
    await user.type(screen.getByLabelText("名称"), "中转站 A");
    await user.type(screen.getByLabelText("Base URL"), "https://relay.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "secret-key-1234");
    await user.type(screen.getByLabelText("备注"), "正式生图");
    await user.click(screen.getByRole("button", { name: "保存中转站" }));

    expect(await screen.findByText("****1234")).toBeInTheDocument();
    expect(screen.queryByText("secret-key-1234")).not.toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      name: "中转站 A",
      baseUrl: "https://relay.example.com/v1",
      apiKey: "secret-key-1234",
      notes: "正式生图"
    });
  });

  it("edits a provider with a blank key and activates it", async () => {
    const user = userEvent.setup();
    let state: ProviderSettingsState = {
      activeProviderId: null,
      usingEnvFallback: true,
      providers: [provider()]
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/provider-1") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        state = { ...state, providers: [provider({ name: body.name, notes: body.notes })] };
        return jsonResponse(state.providers[0]);
      }
      if (url.endsWith("/provider-1/activate") && init?.method === "POST") {
        state = {
          activeProviderId: "provider-1",
          usingEnvFallback: false,
          providers: state.providers.map((item) => ({ ...item, isActive: true }))
        };
        return jsonResponse(state);
      }
      return jsonResponse(state);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsPage />);

    expect(await screen.findByText("****1234")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑中转站 A" }));
    const nameInput = screen.getByLabelText("名称");
    await user.clear(nameInput);
    await user.type(nameInput, "中转站 A 更新");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
      name: "中转站 A 更新",
      apiKey: ""
    });

    await user.click(screen.getByRole("button", { name: "设为当前使用中转站 A 更新" }));
    expect(await screen.findByText("当前使用")).toBeInTheDocument();
    expect(screen.getByText("中转站 A 更新", { selector: "strong" })).toBeInTheDocument();
  });

  it("shows the backend conflict message when activation is blocked", async () => {
    const user = userEvent.setup();
    const state: ProviderSettingsState = {
      activeProviderId: null,
      usingEnvFallback: true,
      providers: [provider()]
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/activate") && init?.method === "POST") {
        return jsonResponse({ message: "请等待当前任务完成后再切换中转站" }, 409);
      }
      return jsonResponse(state);
    }));
    render(<SettingsPage />);

    await user.click(await screen.findByRole("button", { name: "设为当前使用中转站 A" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("请等待当前任务完成后再切换中转站");
    });
  });
});
