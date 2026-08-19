import { describe, expect, it } from "vitest";
import { inspectDriveFile } from "./inspect";

const file = (overrides: Record<string, unknown> = {}) => ({
  id: "file-1", name: "dto.jp-shop-20260818_to_20260818.csv", mimeType: "text/csv", sizeBytes: 123, createdTime: "2026-08-18T00:00:00Z", modifiedTime: "2026-08-18T01:00:00Z", parents: ["folder"], trashed: false, md5Checksum: "md5", ...overrides,
});

describe("Drive file inspection", () => {
  it("marks a CSV file downloadable", () => expect(inspectDriveFile(file())).toMatchObject({ mimeType: "text/csv", hasMd5Checksum: true, downloadable: true }));
  it("marks Google Workspace files non-downloadable", () => expect(inspectDriveFile(file({ mimeType: "application/vnd.google-apps.spreadsheet" }))).toMatchObject({ downloadable: false }));
  it("marks trashed files non-downloadable", () => expect(inspectDriveFile(file({ trashed: true, md5Checksum: null }))).toMatchObject({ trashed: true, hasMd5Checksum: false, downloadable: false }));
});
