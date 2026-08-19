import { describe, expect, it } from "vitest";
import { validateCtiExecuteInput } from "./cti-execute";

describe("CTI manual execute validation", () => {
  it("requires a file id and strict target date", () => {
    expect(() => validateCtiExecuteInput({ driveFileId: "", targetDate: "2026-08-08" })).toThrow("--drive-file-id");
    expect(() => validateCtiExecuteInput({ driveFileId: "file-1", targetDate: "2026/08/08" })).toThrow("--target-date");
    expect(() => validateCtiExecuteInput({ driveFileId: "file-1", targetDate: "2026-02-30" })).toThrow("--target-date");
  });

  it("accepts a valid explicit target date", () => {
    expect(() => validateCtiExecuteInput({ driveFileId: "file-1", targetDate: "2026-08-08" })).not.toThrow();
  });
});
