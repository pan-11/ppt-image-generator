import { afterEach, expect, it, vi } from "vitest";
import { fetchHistory, HttpResponseError } from "../lib/api";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ['{"message":"读取记录失败","code":"INTERNAL"}', "读取记录失败"],
  ['{"error":"服务暂不可用"}', "服务暂不可用"],
  ['"连接失败"', "连接失败"],
  ["upstream unavailable\ntry later", "upstream unavailable\ntry later"],
  ["", "请求失败（HTTP 503）"],
  ['{"unexpected":{"trace":"retained"}}', "请求失败"],
  ["null", "请求失败"]
])("formats response %s and preserves status and diagnostics", async (body, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 503 })));
  const error = await fetchHistory().catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(HttpResponseError);
  expect(error).toMatchObject({ message, status: 503, diagnosticText: body });
});
