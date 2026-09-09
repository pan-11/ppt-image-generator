import { describe, expect, it } from "vitest";
import { parseBulkPromptImport } from "../lib/bulk-prompt-import";

const structuredText = `《课程总标题》
【页面编号】封面
【页面名称】乘法的初步认识
【生图提示词】
生成一张16:9横版封面。
保留明亮留白。
【画面核心文字】
乘法的初步认识
二年级数学
【关键画面元素】
数学乐园；AI助手
【页面编号】P1
【页面名称】系统故障
【生图提示词】生成一张系统故障页。
【画面核心文字】
系统异常
【关键画面元素】
控制屏；警示灯`;

describe("parseBulkPromptImport", () => {
  it("parses structured pages in source order and composes notes", () => {
    const result = parseBulkPromptImport(structuredText, 100);

    expect(result.mode).toBe("structured");
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      {
        pageNumber: "封面",
        pageName: "乘法的初步认识",
        note: "封面 · 乘法的初步认识",
        prompt: `【生图提示词】
生成一张16:9横版封面。
保留明亮留白。

【画面核心文字】
乘法的初步认识
二年级数学

【关键画面元素】
数学乐园；AI助手`
      },
      {
        pageNumber: "P1",
        pageName: "系统故障",
        note: "P1 · 系统故障",
        prompt: `【生图提示词】
生成一张系统故障页。

【画面核心文字】
系统异常

【关键画面元素】
控制屏；警示灯`
      }
    ]);
  });

  it("keeps simple line imports and leaves notes empty", () => {
    const result = parseBulkPromptImport(" forest fox \n\n glass city ", 100);

    expect(result).toEqual({
      mode: "lines",
      items: [
        { prompt: "forest fox", note: "" },
        { prompt: "glass city", note: "" }
      ],
      errors: []
    });
  });

  it("reports missing structured fields without falling back to line mode", () => {
    const result = parseBulkPromptImport(`【页面编号】P2
【页面名称】缺字段页面
【生图提示词】只有正文`, 100);

    expect(result.mode).toBe("structured");
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      "P2 缺少：画面核心文字、关键画面元素"
    ]);
  });

  it("rejects duplicate page numbers", () => {
    const repeated = `${structuredText}\n${structuredText.replace("封面", "P1")}`;
    const result = parseBulkPromptImport(repeated, 100);

    expect(result.mode).toBe("structured");
    expect(result.errors).toContain("页面编号重复：P1");
  });

  it("rejects empty input and imports beyond the batch limit", () => {
    expect(parseBulkPromptImport("  ", 100).errors).toEqual(["没有识别到有效提示词"]);
    expect(parseBulkPromptImport("one\ntwo\nthree", 2).errors).toEqual([
      "识别到 3 条提示词，单批最多 2 条"
    ]);
  });
});
