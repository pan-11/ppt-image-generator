import type { ImageRecord } from "../../lib/types";

function getImagePreviewUrl(imageId: string) {
  return `/api/download/images/${imageId}`;
}

export function ImageGrid(props: {
  images: ImageRecord[];
  onDeleteImage: (imageId: string) => Promise<void>;
}) {
  if (props.images.length === 0) {
    return <p className="muted-copy">该批次还没有落盘图片。</p>;
  }

  return (
    <div className="image-grid">
      {props.images.map((image) => (
        <article key={image.id} className="image-card">
          <img
            className="image-preview"
            src={getImagePreviewUrl(image.id)}
            alt={image.filename}
            loading="lazy"
          />
          <div className="image-meta">
            <strong>{image.filename}</strong>
            <span>{image.local_path}</span>
          </div>
          <div className="image-actions">
            <a className="ghost-button" href={getImagePreviewUrl(image.id)}>下载</a>
            <button
              className="ghost-button danger-button"
              onClick={() => {
                if (window.confirm(`永久删除图片 "${image.filename}"？此操作无法撤销。`)) {
                  void props.onDeleteImage(image.id);
                }
              }}
            >
              删除
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
