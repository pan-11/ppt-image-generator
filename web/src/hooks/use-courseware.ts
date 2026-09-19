import { useCallback, useEffect, useRef, useState } from "react";
import { createCourseware, fetchCourseware, patchCourseware, uploadCoursewareImage, type CoursewareDetail, type CoursewareDocument } from "../lib/courseware-api";

const sessionKey = "image-generator-courseware-session";
type PendingUpload = { coursewareId: string; pageId: string; uploadId: string; expectedRevision: number; epoch: number; sentSequence: number; selectionVersion: number };
export function useCourseware() {
  const [document, setDocument] = useState<CoursewareDocument | null>(null);
  const [detail, setDetail] = useState<CoursewareDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const readyRef = useRef(false);
  const switchSequence = useRef(0);
  const current = useRef<CoursewareDocument | null>(null);
  const sequence = useRef(0);
  const savedSequence = useRef(0);
  const pending = useRef<Promise<CoursewareDocument | null> | null>(null);
  const conflict = useRef(false);
  const mounted = useRef(true);
  const installation = useRef(0);
  const imageMutation = useRef<Promise<void> | null>(null);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const uncertainUpload = useRef<PendingUpload | null>(null);
  const selectionVersions = useRef(new Map<string, number>());
  const latestDetail = useRef<CoursewareDetail | null>(null);
  const publishDetail = useCallback((next: CoursewareDetail | null) => { latestDetail.current = next; setDetail(next); }, []);

  const retain = useCallback(() => {
    try {
      if (current.current) localStorage.setItem(sessionKey, JSON.stringify({ document: current.current, dirty: sequence.current !== savedSequence.current }));
    } catch {
      setError("浏览器存储空间不足，请保持页面打开并重试保存。");
    }
  }, []);
  const install = useCallback((next: CoursewareDocument) => {
    installation.current += 1;
    uncertainUpload.current = null; selectionVersions.current.clear();
    current.current = next; sequence.current = 0; savedSequence.current = 0; conflict.current = false;
    setDocument(next); setLoadVersion((version) => version + 1); publishDetail(null); setError(null); retain();
  }, [publishDetail, retain]);
  const edit = useCallback((next: CoursewareDocument) => {
    if (current.current?.id !== next.id) return;
    for (const page of current.current.pages) {
      if (next.pages.find(item => item.id === page.id)?.selectedImageId !== page.selectedImageId) selectionVersions.current.set(page.id, (selectionVersions.current.get(page.id) ?? 0) + 1);
    }
    current.current = { ...next, revision: current.current.revision };
    sequence.current += 1;
    setDocument(current.current); retain();
  }, [retain]);
  const flush = useCallback(async (): Promise<CoursewareDocument | null> => {
    if (imageMutation.current) await imageMutation.current;
    if (pending.current) return pending.current;
    if (uncertainUpload.current) throw new Error("上次图片上传结果尚未确认，请先重试该图片上传；本地修改已保留。");
    if (conflict.current) throw new Error("课件已在其他窗口更新。本地草稿已保留，请先复制提示词，再重新打开课件。");
    const run = async () => {
      setSaving(true);
      try {
        while (current.current && savedSequence.current !== sequence.current) {
          const snapshot = current.current;
          const sentSequence = sequence.current;
          const saved = await patchCourseware(snapshot);
          if (!mounted.current) return saved;
          if (current.current?.id !== snapshot.id) return current.current;
          current.current = { ...current.current, revision: saved.revision };
          savedSequence.current = sentSequence;
          setDocument(current.current); retain();
        }
        setError(null);
        return current.current;
      } catch (cause) {
        if ((cause as { code?: string })?.code === "REVISION_CONFLICT") conflict.current = true;
        setError(cause instanceof Error ? cause.message : "课件保存失败，草稿保留在本机。");
        throw cause;
      } finally {
        setSaving(false); pending.current = null;
      }
    };
    if (sequence.current === savedSequence.current) return current.current;
    pending.current = run();
    return pending.current;
  }, [retain]);
  const uploadImage = useCallback((pageId: string, file: File, uploadId: string): Promise<void> => {
    const coursewareId = current.current?.id;
    const epoch = installation.current;
    const run = async () => {
      if (!coursewareId || current.current?.id !== coursewareId || installation.current !== epoch) throw new Error("课件已切换，请在当前课件重新上传。");
      const unresolved = uncertainUpload.current;
      if (unresolved && (unresolved.coursewareId !== coursewareId || unresolved.pageId !== pageId || unresolved.uploadId !== uploadId)) throw new Error("上次图片上传结果尚未确认，请先重试上次上传，再选择其他图片。");
      if (!unresolved) await flush();
      const snapshot = current.current;
      if (!snapshot || snapshot.id !== coursewareId || installation.current !== epoch) throw new Error("课件已切换，请重新上传。");
      const page = snapshot.pages.find(item => item.id === pageId);
      if (!page) throw new Error("页面不存在，请重新打开课件。");
      const context: PendingUpload = unresolved ?? { coursewareId, pageId, uploadId, expectedRevision: snapshot.revision, epoch, sentSequence: sequence.current, selectionVersion: selectionVersions.current.get(pageId) ?? 0 };
      const mutate = async () => {
        let loaded: CoursewareDetail;
        try {
          loaded = await uploadCoursewareImage(coursewareId, pageId, file, uploadId, context.expectedRevision);
        } catch (cause) {
          const recovered = await fetchCourseware(coursewareId).catch(() => null);
          if (!recovered?.images.some(item => item.id === uploadId && item.source === "upload" && item.page_id === pageId)) {
            if (current.current?.id === coursewareId && installation.current === epoch) {
              const status = (cause as { status?: number })?.status;
              uncertainUpload.current = !recovered && (status === undefined || status >= 500) ? context : null;
            }
            throw cause;
          }
          loaded = recovered;
        }
        if (!mounted.current || current.current?.id !== coursewareId || installation.current !== epoch) return;
        uncertainUpload.current = null;
        if (loaded.courseware.revision > context.expectedRevision + 1) throw Object.assign(new Error("图片已保存，但课件随后在其他窗口更新。本地草稿已保留，请重新打开课件后核对。"), { code: "REVISION_CONFLICT" });
        const uploadedPage = loaded.courseware.pages.find(item => item.id === pageId);
        current.current = { ...current.current, revision: loaded.courseware.revision, pages: current.current.pages.map(item => item.id === pageId && (selectionVersions.current.get(pageId) ?? 0) === context.selectionVersion ? { ...item, selectedImageId: uploadedPage?.selectedImageId ?? item.selectedImageId } : item) };
        if (sequence.current === context.sentSequence) savedSequence.current = sequence.current;
        setDocument(current.current); publishDetail({ ...loaded, courseware: current.current }); setError(null); retain();
      };
      const operation = mutate();
      imageMutation.current = operation;
      try { await operation; }
      catch (cause) {
        if (current.current?.id === coursewareId && installation.current === epoch) {
          if ((cause as { code?: string })?.code === "REVISION_CONFLICT") conflict.current = true;
          setError(cause instanceof Error ? cause.message : "图片上传失败，请重试。");
        }
        throw cause;
      } finally { if (imageMutation.current === operation) imageMutation.current = null; }
      if (current.current?.id === coursewareId && installation.current === epoch) await flush();
    };
    const queued = uploadQueue.current.catch(() => {}).then(run);
    uploadQueue.current = queued;
    return queued;
  }, [flush, publishDetail, retain]);
  const open = useCallback(async (id: string) => {
    if (!readyRef.current) throw new Error("正在恢复课件，请稍后再试。");
    const operation = ++switchSequence.current;
    if (conflict.current && current.current) {
      localStorage.setItem(`${sessionKey}-conflict-${current.current.id}`, JSON.stringify(current.current));
    } else await flush();
    const loaded = await fetchCourseware(id);
    if (operation !== switchSequence.current) return loaded.courseware;
    const latest = !conflict.current ? await flush() : null;
    if (operation !== switchSequence.current) return loaded.courseware;
    const selected = latest?.id === id && latest.revision > loaded.courseware.revision ? latest : loaded.courseware;
    const newerDetail = latestDetail.current;
    const selectedDetail = newerDetail?.courseware.id === id && newerDetail.courseware.revision > loaded.courseware.revision ? newerDetail : loaded;
    install(selected); publishDetail({ ...selectedDetail, courseware: selected });
    return selected;
  }, [flush, install, publishDetail]);
  const create = useCallback(async (next: CoursewareDocument) => {
    if (!readyRef.current) throw new Error("正在恢复课件，请稍后再试。");
    const operation = ++switchSequence.current;
    await flush();
    const saved = await createCourseware(next);
    if (operation !== switchSequence.current) return saved;
    await flush();
    if (operation !== switchSequence.current) return saved;
    install(saved);
    return saved;
  }, [flush, install]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const restore = async () => {
      let stored: { document: CoursewareDocument; dirty: boolean } | null = null;
      try {
        const raw = localStorage.getItem(sessionKey);
        if (!raw) return;
        stored = JSON.parse(raw) as { document: CoursewareDocument; dirty: boolean };
        if (!stored.document?.id || !Array.isArray(stored.document.pages)) return;
        const loaded = await fetchCourseware(stored.document.id);
        if (cancelled) return;
        install(loaded.courseware); publishDetail(loaded);
        if (stored.dirty) {
          current.current = stored.document; sequence.current = 1; setDocument(stored.document);
          if (stored.document.revision !== loaded.courseware.revision) {
            conflict.current = true;
            setError("课件已有更新，本地未保存草稿已保留。请复制提示词后重新打开，避免覆盖。");
          }
          retain();
        }
      } catch (cause) {
        if (!cancelled) {
          if (stored?.document?.id && Array.isArray(stored.document.pages)) {
            current.current = stored.document; setDocument(stored.document); setLoadVersion((version) => version + 1); conflict.current = true;
          }
          setError(`课件恢复失败，已保留本地内容。${cause instanceof Error ? cause.message : "请检查后端连接"}`);
        }
      } finally {
        if (!cancelled) { readyRef.current = true; setReady(true); }
      }
    };
    void restore();
    return () => { cancelled = true; mounted.current = false; };
  }, [install, publishDetail, retain]);
  useEffect(() => {
    if (!ready || !document || conflict.current) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 500);
    return () => clearTimeout(timer);
  }, [document, flush, ready]);
  const refresh = useCallback(async () => {
    const id = current.current?.id;
    const epoch = installation.current;
    if (!id) return;
    const loaded = await fetchCourseware(id);
    if (current.current?.id === id && mounted.current && installation.current === epoch && loaded.courseware.revision >= current.current.revision) publishDetail(loaded);
  }, [publishDetail]);
  const getCurrent = useCallback(() => current.current, []);
  useEffect(() => {
    if (!document?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(); } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "课件结果更新失败"); }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [document?.id, refresh]);
  return { document, detail, error, saving, ready, loadVersion, edit, create, open, install, flush, refresh, getCurrent, uploadImage };
}
