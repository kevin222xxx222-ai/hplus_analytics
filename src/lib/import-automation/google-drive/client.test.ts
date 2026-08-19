import { describe, expect, it } from "vitest";

import {
  createDriveClient,
  loadServiceAccountCredentials,
  normalizeDriveFile,
  requireDevelopmentFolderId,
} from "./client";
import { GoogleDriveConnectionError } from "./errors";

describe("Google Drive H2 client", () => {
  it("rejects a missing credential path", () => {
    expect(() => loadServiceAccountCredentials("")).toThrowError(
      expect.objectContaining({ code: "GOOGLE_DRIVE_CREDENTIALS_PATH_MISSING" }),
    );
  });

  it("rejects a missing development folder ID", () => {
    expect(() => requireDevelopmentFolderId("")).toThrowError(
      expect.objectContaining({ code: "GOOGLE_DRIVE_FOLDER_ID_MISSING" }),
    );
  });

  it("normalizes nullable file metadata", () => {
    expect(normalizeDriveFile({ id: "f1", name: "sample.csv", size: "12", parents: ["root"], trashed: false })).toEqual({
      id: "f1",
      name: "sample.csv",
      mimeType: null,
      sizeBytes: 12,
      createdTime: null,
      modifiedTime: null,
      parents: ["root"],
      trashed: false,
      md5Checksum: null,
    });
  });

  it("normalizes a direct file list and excludes no API result implicitly", async () => {
    const client = createDriveClient({
      driveApi: {
        files: {
          get: async () => ({ data: { id: "root", name: "Development", mimeType: "application/vnd.google-apps.folder" } }),
          list: async () => ({ data: { files: [{ id: "f1", name: "sample.csv", trashed: false }, { id: "f2", name: "nested-folder", mimeType: "application/vnd.google-apps.folder", trashed: false }] } }),
        },
      },
    });
    await expect(client.listFilesInFolder("root")).resolves.toMatchObject([
      { id: "f1", name: "sample.csv", trashed: false },
      { id: "f2", name: "nested-folder", trashed: false },
    ]);
  });

  it("propagates a safe permission error without exposing API details", async () => {
    const client = createDriveClient({
      driveApi: { files: { get: async () => { throw { response: { status: 403 }, secret: "must-not-leak" }; }, list: async () => ({ data: {} }) } },
    });
    await expect(client.getFolderMetadata("root")).rejects.toMatchObject({
      code: "GOOGLE_DRIVE_PERMISSION_DENIED",
      message: "Google Drive permission denied.",
    });
  });

  it("reports an authentication failure as a safe connection error", async () => {
    const client = createDriveClient({
      driveApi: { files: { get: async () => { throw { response: { status: 401 }, secret: "must-not-leak" }; }, list: async () => ({ data: {} }) } },
    });
    await expect(client.getFolderMetadata("root")).rejects.toMatchObject({ code: "GOOGLE_DRIVE_AUTH_FAILURE" });
  });

  it("keeps trashed metadata representable when supplied by the API", () => {
    expect(normalizeDriveFile({ id: "f1", name: "deleted.csv", trashed: true }).trashed).toBe(true);
  });

  it("uses the typed connection error for invalid metadata", () => {
    try {
      normalizeDriveFile({ name: "missing-id.csv" });
      throw new Error("expected normalization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleDriveConnectionError);
    }
  });
});
