import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageRecord } from "../../lib/types";
import { HistoryImageViewer } from "./history-image-viewer";

export function ImageGrid(props: {
  images: ImageRecord[];
  onDeleteImage: (imageId: string) => Promise<void>;
}) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  const stripRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const viewerOpen = useRef(false);
  const returnFocus = useCallback((focusStrip = false) => {
    const trigger = triggerRef.current;
    const strip = stripRef.current;
    queueMicrotask(() => {
      if (viewerOpen.current) return;
      if (!focusStrip && trigger?.isConnected) trigger.focus();
      else if (strip?.isConnected) strip.focus();
      else document.getElementById("history-title")?.focus();
    });
  }, []);
  const close = useCallback((focusStrip = false) => {
    viewerOpen.current = false;
    setSelectedImageId(null);
    returnFocus(focusStrip);
  }, [returnFocus]);
  useEffect(() => () => {
    if (viewerOpen.current) {
      viewerOpen.current = false;
      returnFocus();
    }
  }, [returnFocus]);
  return <>
    <div className="history-image-strip" ref={stripRef} tabIndex={0} role="region" aria-label="批次图片">
      {props.images.length === 0 ? <p className="muted-copy">该批次还没有落盘图片。</p> : null}
      {props.images.map((image, index) => <article key={image.id} className="history-thumbnail">
        <button className="history-thumbnail-button" aria-label={`查看 ${image.filename} 大图`} onClick={(event) => {
          triggerRef.current = event.currentTarget;
          viewerOpen.current = true;
          setSelectedImageId(image.id);
        }}>
          <img src={`/api/download/images/${image.id}`} alt={image.filename} loading="lazy" hidden={brokenIds.has(image.id)} onError={() => setBrokenIds((previous) => new Set(previous).add(image.id))} />
          {brokenIds.has(image.id) ? <span className="error-copy">图片加载失败<br />{image.filename}</span> : null}
        </button>
        <span className="history-thumbnail-label">图 {String(index + 1).padStart(2, "0")}</span>
      </article>)}
    </div>
    {selectedImageId ? <HistoryImageViewer images={props.images} selectedImageId={selectedImageId} onSelect={setSelectedImageId} onClose={close} onDeleteImage={props.onDeleteImage} /> : null}
  </>;
}
