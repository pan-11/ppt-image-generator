import { basename } from "node:path";
import { FileStorage } from "../lib/file-storage.js";
import { createReferenceImagesRepository } from "../db/repositories/reference-images-repository.js";
import { ToApisClient } from "./toapis-client.js";

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
    return this.createLocalReference({
      filename: input.filename,
      mimeType: input.mimeType,
      buffer: this.fileStorage.readFile(input.localPath)
    });
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
