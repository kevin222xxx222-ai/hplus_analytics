import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

import { GoogleDriveConnectionError } from "./errors";

export function sanitizeTemporaryFilename(fileName: string): string {
  const base = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return base || "drive-file";
}

export class GoogleDriveTemporaryStorage {
  readonly rootDir: string;
  private readonly trackedPaths = new Set<string>();

  constructor(rootDir = process.env.GOOGLE_DRIVE_TEMP_DIR || resolve(process.cwd(), "data/tmp/google-drive")) {
    this.rootDir = resolve(rootDir);
  }

  private assertManagedPath(filePath: string): string {
    const absolutePath = resolve(filePath);
    const rel = relative(this.rootDir, absolutePath);
    if (isAbsolute(rel) || rel.startsWith("..") || !this.trackedPaths.has(absolutePath)) {
      throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CLEANUP_FAILED", "Temporary path is not managed by Google Drive storage.");
    }
    return absolutePath;
  }

  async create(fileId: string, fileName: string): Promise<string> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      const safeId = sanitizeTemporaryFilename(fileId);
      const safeName = sanitizeTemporaryFilename(fileName);
      const extension = extname(safeName).slice(0, 16);
      const path = join(this.rootDir, `drive-${safeId}-${randomUUID()}${extension}`);
      this.trackedPaths.add(path);
      return path;
    } catch {
      throw new GoogleDriveConnectionError("GOOGLE_DRIVE_TEMP_STORAGE_FAILED", "Temporary storage could not be created.");
    }
  }

  async cleanup(filePath: string): Promise<void> {
    const absolutePath = this.assertManagedPath(filePath);
    try {
      await unlink(absolutePath).catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") return;
        throw error;
      });
      this.trackedPaths.delete(absolutePath);
    } catch {
      throw new GoogleDriveConnectionError("GOOGLE_DRIVE_CLEANUP_FAILED", "Temporary file cleanup failed.");
    }
  }
}
