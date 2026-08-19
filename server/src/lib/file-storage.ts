import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

export class FileStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
    mkdirSync(this.rootDir, { recursive: true });
    mkdirSync(join(this.rootDir, "references"), { recursive: true });
    mkdirSync(join(this.rootDir, "batches"), { recursive: true });
    mkdirSync(join(this.rootDir, "tmp"), { recursive: true });
  }

  getRootDir() {
    return this.rootDir;
  }

  writeReferenceImage(referenceImageId: string, filename: string, buffer: Buffer) {
    const extension = extname(filename) || ".png";
    const fullPath = join(this.rootDir, "references", `${referenceImageId}${extension}`);
    writeFileSync(fullPath, buffer);
    return fullPath;
  }

  writeGeneratedImage(batchId: string, taskId: string, index: number, filename: string, buffer: Buffer) {
    const extension = extname(filename) || ".png";
    const batchDir = join(this.rootDir, "batches", batchId, "images");
    mkdirSync(batchDir, { recursive: true });
    const fullPath = join(batchDir, `${taskId}-${index}${extension}`);
    writeFileSync(fullPath, buffer);
    return fullPath;
  }

  writeGeneratedJobImage(batchId: string, filename: string, buffer: Buffer) {
    const batchDir = join(this.rootDir, "batches", batchId, "images");
    mkdirSync(batchDir, { recursive: true });
    const fullPath = join(batchDir, basename(filename));
    writeFileSync(fullPath, buffer);
    return fullPath;
  }

  readFile(path: string) {
    return readFileSync(path);
  }

  exportFiles(input: { sourcePaths: string[]; destinationDir: string }) {
    const destinationDir = resolve(input.destinationDir);
    mkdirSync(destinationDir, { recursive: true });

    const exportedPaths = input.sourcePaths.map((sourcePath) => {
      const destinationPath = join(destinationDir, basename(sourcePath));
      copyFileSync(sourcePath, destinationPath);
      return destinationPath;
    });

    return {
      destinationDir,
      exportedPaths
    };
  }

  deleteFile(path: string) {
    rmSync(path, { force: true });
  }

  deleteBatchDirectory(batchId: string) {
    rmSync(join(this.rootDir, "batches", batchId), { recursive: true, force: true });
  }
}
