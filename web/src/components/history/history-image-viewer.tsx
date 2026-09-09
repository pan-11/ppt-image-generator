import { useEffect, useRef, useState } from "react";
import type { ImageRecord } from "../../lib/types";
import { ModalDialog } from "../ui/modal-dialog";

export function HistoryImageViewer(props: {
  images: ImageRecord[];
  selectedImageId: string;
  onSelect: (imageId: string) => void;
  onClose: (focusStrip?: boolean) => void;
  onDeleteImage: (imageId: string) => Promise<void>;
}) {
  const index = props.images.findIndex((image) => image.id === props.selectedImageId);
  const image = props.images[index];
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!image) props.onClose(true);
  }, [image, props.onClose]);
  if (!image) return null;
  const move = (offset: number) => {
    if (!deleting && props.images[index + offset]) {
      setError(null);
      props.onSelect(props.images[index + offset].id);
    }
  };
  const deleteImage = async () => {
    if (deleting || !window.confirm(`永久删除图片 "${image.filename}"？此操作无法撤销。`)) return;
    setDeleting(true);
    setError(null);
    try {
      await props.onDeleteImage(image.id);
      if (mounted.current) props.onClose(true);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      if (mounted.current) setDeleting(false);
    }
  };
  return <ModalDialog open label="历史图片预览" className="history-image-viewer" onClose={props.onClose}>
    <div onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
      <div className="panel-heading"><h3>{image.filename}</h3><button className="ghost-button" data-modal-initial-focus onClick={() => props.onClose()}>关闭</button></div>
      <p className="muted-copy">{index + 1} / {props.images.length}</p>
      <div className="history-viewer-frame">
        <img src={`/api/download/images/${image.id}`} alt={image.filename} onError={() => setBrokenId(image.id)} hidden={brokenId === image.id} />
        {brokenId === image.id ? <p className="error-copy">图片加载失败：{image.filename}</p> : null}
      </div>
      <div className="history-viewer-actions">
        <button className="ghost-button" disabled={deleting || index === 0} onClick={() => move(-1)}>上一张</button>
        <button className="ghost-button" disabled={deleting || index === props.images.length - 1} onClick={() => move(1)}>下一张</button>
        <a className="ghost-button" href={`/api/download/images/${image.id}`}>下载</a>
        <button className="ghost-button danger-button" disabled={deleting} onClick={() => void deleteImage()}>{deleting ? "删除中..." : "删除"}</button>
      </div>
      {error ? <p className="error-copy" role="alert">{error}</p> : null}
      <details className="history-file-info"><summary>文件信息</summary><p>{image.local_path}</p></details>
    </div>
  </ModalDialog>;
}
