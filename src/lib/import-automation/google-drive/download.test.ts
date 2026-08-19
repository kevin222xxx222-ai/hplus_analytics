import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { GoogleDriveConnectionError } from "./errors";
import { downloadDriveFile } from "./download";
import { DriveFileMetadata, GoogleDriveClient } from "./types";
import { GoogleDriveTemporaryStorage, sanitizeTemporaryFilename } from "./temporary-storage";

const file: DriveFileMetadata = {
  id: "file-1",
  name: "../unsafe/report.csv",
  mimeType: "text/csv",
  sizeBytes: null,
  createdTime: "2026-08-14T00:00:00.000Z",
  modifiedTime: "2026-08-14T00:00:00.000Z",
  parents: ["folder-1"],
  trashed: false,
  md5Checksum: null,
};

function clientFor(streamFactory: () => Readable): GoogleDriveClient {
  return {
    getFolderMetadata: async () => { throw new Error("not used"); },
    listFilesInFolder: async () => [],
    downloadFile: async () => streamFactory(),
  };
}

describe("Google Drive H3 download vertical slice", () => {
  it("streams a file to temporary storage and returns the SHA-256", async () => {
    const root = await mkdtemp(join(tmpdir(), "hplus-drive-test-"));
    const storage = new GoogleDriveTemporaryStorage(root);
    const content = Buffer.from("hello drive\n");
    const result = await downloadDriveFile({ client: clientFor(() => Readable.from([content])), file, folderId: "folder-1", storage });
    expect(result.sizeBytes).toBe(content.length);
    expect(result.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    await expect(readFile(result.localPath)).resolves.toEqual(content);
    await storage.cleanup(result.localPath);
  });

  it("creates unique managed temporary paths and sanitizes names", async () => {
    const root = await mkdtemp(join(tmpdir(), "hplus-drive-test-"));
    const storage = new GoogleDriveTemporaryStorage(root);
    const first = await storage.create("file/../../id", "../../unsafe name.csv");
    const second = await storage.create("file/../../id", "../../unsafe name.csv");
    expect(first).not.toBe(second);
    expect(first.startsWith(root)).toBe(true);
    expect(sanitizeTemporaryFilename("../../unsafe name.csv")).toBe("unsafe_name.csv");
    await storage.cleanup(first);
    await storage.cleanup(second);
  });

  it("rejects Google Workspace native files without calling download", async () => {
    const root = await mkdtemp(join(tmpdir(), "hplus-drive-test-"));
    const storage = new GoogleDriveTemporaryStorage(root);
    const workspaceFile = { ...file, mimeType: "application/vnd.google-apps.spreadsheet" };
    await expect(downloadDriveFile({ client: clientFor(() => { throw new Error("must not download"); }), file: workspaceFile, folderId: "folder-1", storage })).rejects.toMatchObject({ code: "GOOGLE_DRIVE_UNSUPPORTED_WORKSPACE_FILE" });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("cleans up a temporary file when the stream fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "hplus-drive-test-"));
    const storage = new GoogleDriveTemporaryStorage(root);
    const failing = new Readable({ read() { this.push(Buffer.from("partial")); this.destroy(new Error("network")); } });
    await expect(downloadDriveFile({ client: clientFor(() => failing), file, folderId: "folder-1", storage })).rejects.toMatchObject({ code: "GOOGLE_DRIVE_DOWNLOAD_FAILED" });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("propagates file-not-found and handles empty files", async () => {
    const root = await mkdtemp(join(tmpdir(), "hplus-drive-test-"));
    const storage = new GoogleDriveTemporaryStorage(root);
    const missing: GoogleDriveClient = { ...clientFor(() => Readable.from([])), downloadFile: async () => { throw new GoogleDriveConnectionError("GOOGLE_DRIVE_FILE_NOT_FOUND", "Google Drive file was not found."); } };
    await expect(downloadDriveFile({ client: missing, file, folderId: "folder-1", storage })).rejects.toMatchObject({ code: "GOOGLE_DRIVE_FILE_NOT_FOUND" });
    const empty = await downloadDriveFile({ client: clientFor(() => Readable.from([])), file, folderId: "folder-1", storage });
    expect(empty.sizeBytes).toBe(0);
    expect(empty.sha256).toBe(createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
    await storage.cleanup(empty.localPath);
  });
});
