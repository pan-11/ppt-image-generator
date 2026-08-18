import type { EditorResultsCache } from "./editor-results-cache";
import type { TaskDraft } from "./types";

const EDITOR_SESSION_KEY = "image-generator-editor-session";

export type EditorSession = {
  rows: TaskDraft[];
  editorResults: EditorResultsCache;
  activeBatchId: string | null;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isEditorSession(value: unknown): value is EditorSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<EditorSession>;
  return Array.isArray(candidate.rows) &&
    Array.isArray(candidate.editorResults?.tasks) &&
    Array.isArray(candidate.editorResults?.images);
}

function normalizeEditorSession(session: EditorSession): EditorSession {
  return {
    ...session,
    rows: session.rows.map((row) => ({
      ...row,
      note: typeof row.note === "string" ? row.note : ""
    }))
  };
}

export function hasEditorSessionContent(session: EditorSession) {
  return session.rows.some((row) => row.prompt.trim() || row.submittedTaskId) ||
    session.editorResults.tasks.length > 0 ||
    session.editorResults.images.length > 0;
}

export function loadEditorSession() {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(EDITOR_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isEditorSession(parsed)) {
      return null;
    }

    const session = normalizeEditorSession(parsed);
    return hasEditorSessionContent(session) ? session : null;
  } catch {
    return null;
  }
}

export function saveEditorSession(session: EditorSession) {
  if (!canUseLocalStorage()) {
    return;
  }

  if (!hasEditorSessionContent(session)) {
    window.localStorage.removeItem(EDITOR_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify(session));
}
