import type { ProtocolType, ProviderAdapter } from "./provider-adapter.js";

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<ProtocolType, ProviderAdapter>();

  constructor(adapters: ProviderAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.protocolType)) {
        throw new Error(`重复的中转站协议：${adapter.protocolType}`);
      }
      this.adapters.set(adapter.protocolType, adapter);
    }
  }

  require(protocolType: string) {
    const adapter = this.adapters.get(protocolType as ProtocolType);
    if (!adapter) {
      throw new Error(`不支持的中转站协议：${protocolType}`);
    }
    return adapter;
  }
}
