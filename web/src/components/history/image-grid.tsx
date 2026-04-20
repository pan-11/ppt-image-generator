import type { ImageRecord } from "../../lib/types";

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
          <div className="image-meta">
            <strong>{image.filename}</strong>
            <span>{image.local_path}</span>
          </div>
          <div className="image-actions">
            <a className="ghost-button" href={`/api/download/images/${image.id}`}>下载</a>
            <button className="ghost-button danger-button" onClick={() => void props.onDeleteImage(image.id)}>删除</button>
          </div>
        </article>
      ))}
    </div>
  );
}
