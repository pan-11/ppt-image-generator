import { describe, expect, it } from "vitest";
import { currentPromptsMarkdown, currentPromptsText, originalPromptText } from "../lib/prompt-export";
import type { CoursewarePage } from "../lib/courseware-api";

const page = (id: string, position: number, prompt: string): CoursewarePage => ({
  id, position, sourcePageName: id, sourcePageNumber: "", included: false, selectedImageId: null,
  draft: { prompt, note: "", model: "gpt-image-2", aspectRatio: "16:9", resolution: "1K", n: 1, referenceMode: "none", referenceImageId: null }
});

describe("prompt reuse", () => {
  it("preserves the original verbatim including CRLF and surrounding spaces", () => {
    const raw = "  总标题\r\n\r\n正文  ";
    expect(originalPromptText(raw)).toBe(raw);
  });
  it("exports every page in order, including excluded and empty pages", () => {
    const text = currentPromptsText([page("末页", 2, "BETA"), page("封面", 0, "ALPHA\n多行"), page("空白", 1, "")]);
    expect(text.indexOf("ALPHA")).toBeLessThan(text.indexOf("空白"));
    expect(text.indexOf("空白")).toBeLessThan(text.indexOf("BETA"));
    expect(text).toContain("ALPHA\n多行");
  });
  it("uses a fence longer than backticks in the prompt", () => {
    expect(currentPromptsMarkdown([page("封面", 0, "正文\n````\n保留")])).toContain("`````text\n正文\n````\n保留\n`````");
  });
});
