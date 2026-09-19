import { basename } from "node:path";
import { FileStorage } from "../lib/file-storage.js";
import { createReferenceImagesRepository } from "../db/repositories/reference-images-repository.js";
import { ToApisClient } from "./toapis-client.js";
import type { ReferenceAsset } from "../providers/provider-adapter.js";
import { CoursewareError } from "./courseware-service.js";
import { validateImageUpload, type ImageUpload } from "./courseware-image-service.js";

export class ReferenceImageService {
  private readonly providerRemoteUrls = new Map<string, string>();

  constructor(
    private readonly fileStorage: FileStorage,
    private readonly referenceImagesRepository: ReturnType<typeof createReferenceImagesRepository>
  ) {}

  createLocalReference(input: { filename: string; mimeType: string; buffer: Buffer }) {
    const placeholder = this.referenceImagesRepository.create({
      filename: input.filename,
      localPath: "",
      mimeType: input.mimeType
    });
    const localPath = this.fileStorage.writeReferenceImage(placeholder.id, input.filename, input.buffer);
    this.referenceImagesRepository.updateLocalPath(placeholder.id, localPath);

    return {
      ...placeholder,
      localPath
    };
  }

  createFromGeneratedImage(input: { filename: string; localPath: string; mimeType: string }) {
    let buffer: Buffer;
    try { buffer = this.fileStorage.readFile(input.localPath); }
    catch { throw new CoursewareError(409, "REFERENCE_UNAVAILABLE", "源图片不可用，请重新上传或选择其他图片"); }
    return this.createLocalReference({
      filename: input.filename,
      mimeType: input.mimeType,
      buffer
    });
  }

  async upload(input: ImageUpload) {
    const metadata = await validateImageUpload(input);
    const record = this.createLocalReference({ ...input, filename: metadata.filename });
    return { id: record.id, localPath: record.localPath, ...metadata, url: `/api/reference-images/${record.id}/content` };
  }

  async metadata(id: string) {
    const asset = this.getLocalAsset(id);
    const metadata = await validateImageUpload(asset);
    const record = this.referenceImagesRepository.getById(id) as { local_path: string };
    return { id, localPath: record.local_path, ...metadata, url: `/api/reference-images/${id}/content` };
  }

  getLocalAsset(referenceImageId: string): ReferenceAsset {
    const existing = this.referenceImagesRepository.getById(referenceImageId) as
      | { id: string; filename: string; local_path: string; mime_type: string }
      | undefined;
    if (!existing) throw new CoursewareError(409, "REFERENCE_UNAVAILABLE", "参考图不可用，请重新上传或选择不使用");
    let buffer: Buffer;
    try { buffer = this.fileStorage.readFile(existing.local_path); }
    catch { throw new CoursewareError(409, "REFERENCE_UNAVAILABLE", "参考图不可用，请重新上传或选择不使用"); }
    return {
      id: existing.id,
      filename: existing.filename || basename(existing.local_path),
      mimeType: existing.mime_type,
      buffer
    };
  }

  async ensureRemoteUrl(referenceImageId: string, client: ToApisClient, providerCacheKey: string) {
    const existing = this.referenceImagesRepository.getById(referenceImageId) as
      | { id: string; filename: string; local_path: string; mime_type: string; remote_url: string | null }
      | undefined;

    if (!existing) {
      throw new Error("参考图不存在");
    }

    if (providerCacheKey === "env" && existing.remote_url) {
      return existing.remote_url;
    }

    const cacheKey = `${providerCacheKey}:${referenceImageId}`;
    const cached = this.providerRemoteUrls.get(cacheKey);
    if (cached) {
      return cached;
    }

    const remoteUrl = await client.uploadReferenceImage({
      filename: existing.filename || basename(existing.local_path),
      mimeType: existing.mime_type,
      buffer: this.fileStorage.readFile(existing.local_path)
    });

    if (providerCacheKey === "env") {
      this.referenceImagesRepository.updateRemoteUrl(referenceImageId, remoteUrl);
    } else {
      this.providerRemoteUrls.set(cacheKey, remoteUrl);
    }
    return remoteUrl;
  }
}
