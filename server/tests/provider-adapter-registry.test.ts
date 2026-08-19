import { describe, expect, it } from "vitest";
import type { ProviderAdapter } from "../src/providers/provider-adapter.js";
import { ProviderAdapterRegistry } from "../src/providers/provider-adapter-registry.js";

function fakeAdapter(protocolType: ProviderAdapter["protocolType"]): ProviderAdapter {
  return {
    protocolType,
    capabilities: () => [],
    resolveRequest: () => ({ requestSize: "1:1" }),
    generate: async () => ({ buffer: Buffer.from("image"), mimeType: "image/png" }),
    recover: async () => ({ buffer: Buffer.from("image"), mimeType: "image/png" })
  };
}

describe("ProviderAdapterRegistry", () => {
  it("resolves adapters only by explicit protocol type", () => {
    const toApis = fakeAdapter("toapis-async");
    const ym2 = fakeAdapter("ym2-openai-images");
    const registry = new ProviderAdapterRegistry([toApis, ym2]);

    expect(registry.require("toapis-async")).toBe(toApis);
    expect(registry.require("ym2-openai-images")).toBe(ym2);
    expect(() => registry.require("https://relay.example.com/v1"))
      .toThrow("不支持的中转站协议");
  });

  it("rejects duplicate protocol registrations", () => {
    const first = fakeAdapter("toapis-async");
    const second = fakeAdapter("toapis-async");

    expect(() => new ProviderAdapterRegistry([first, second]))
      .toThrow("重复的中转站协议");
  });
});
