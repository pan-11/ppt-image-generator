import type { CoursewarePage } from "./courseware-api";
export const originalPromptText = (raw: string) => raw;
export const pageLabel = (page: CoursewarePage) => [page.sourcePageNumber, page.sourcePageName].filter(Boolean).join(" · ") || page.draft.note || `第 ${page.position + 1} 页`;
export const currentPromptsText = (pages: CoursewarePage[]) => [...pages].sort((a, b) => a.position - b.position).map((page) => `${pageLabel(page)}\n${page.draft.prompt}`).join("\n\n");
export const currentPromptsMarkdown = (pages: CoursewarePage[]) => [...pages].sort((a, b) => a.position - b.position).map((page) => {
  const longest = Math.max(2, ...(page.draft.prompt.match(/`+/g) ?? []).map((match) => match.length));
  const fence = "`".repeat(longest + 1);
  return `## ${pageLabel(page)}\n\n${fence}text\n${page.draft.prompt}\n${fence}`;
}).join("\n\n");
