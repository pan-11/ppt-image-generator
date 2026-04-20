import { basename } from "node:path";
import { FileStorage } from "../lib/file-storage.js";
import { createReferenceImagesRepository } from "../db/repositories/reference-images-repository.js";
import { ToApisClient } from "./toapis-client.js";

export class ReferenceImageService {
  constructor(
    private readonly fileStorage: FileStorage,
    private readonly referenceImagesRepository: ReturnType<typeof createReferenceImagesRepository>,
    private readonly toApisClient: ToApisClient
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

  async ensureRemoteUrl(referenceImageId: string) {
    const existing = this.referenceImagesRepository.getById(referenceImageId) as
      | { id: string; filename: string; local_path: string; mime_type: string; remote_url: string | null }
      | undefined;

    if (!existing) {
      throw new Error("参考图不存在");
    }

    if (existing.remote_url) {
      return existing.remote_url;
    }

    const remoteUrl = await this.toApisClient.uploadReferenceImage({
      filename: existing.filename || basename(existing.local_path),
      mimeType: existing.mime_type,
      buffer: this.fileStorage.readFile(existing.local_path)
    });

    this.referenceImagesRepository.updateRemoteUrl(referenceImageId, remoteUrl);
    return remoteUrl;
  }
}
