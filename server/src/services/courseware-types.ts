export type PageDraft = {
  prompt: string;
  note: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceMode: "none" | "global" | "row";
  referenceImageId: string | null;
};

export type CoursewarePage = {
  id: string;
  position: number;
  sourcePageNumber: string;
  sourcePageName: string;
  draft: PageDraft;
  included: boolean;
  selectedImageId: string | null;
};

export type CoursewareDocument = {
  id: string;
  name: string;
  sourceKind: "import" | "manual" | "history" | "legacy-session";
  rawImportText: string | null;
  importMode: "structured" | "lines" | null;
  legacyBatchId: string | null;
  globalReferenceImageId: string | null;
  revision: number;
  pages: CoursewarePage[];
};

export type TextlessPage = {
  pageId: string;
  position: number;
  pageLabel: string;
  sourceImageId: string;
  taskId: string;
  aspectRatio: string;
  resolution: string;
};

export type TextlessRun = {
  id: string;
  coursewareId: string;
  requestId: string;
  sourceRevision: number;
  promptText: string;
  model: string;
  manifest: TextlessPage[];
};
