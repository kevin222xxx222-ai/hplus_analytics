import { describe, expect, it } from "vitest";
import { determineTownDatasetSemantics } from "./dataset-semantics";

describe("Town dataset semantics", () => {
  const base = { origin: "GOOGLE_DRIVE", targetFrom: "2026-08-22", targetTo: "2026-08-22", executionMode: "EXECUTE", datasetSemantics: "current" };
  it("allows explicitly marked normal Drive current execution", () => expect(determineTownDatasetSemantics(base)).toBe("current"));
  it("falls back for reprocess and manual data", () => {
    expect(determineTownDatasetSemantics({ ...base, reprocess: true })).toBe("historical");
    expect(determineTownDatasetSemantics({ ...base, origin: "MANUAL" })).toBe("historical");
    expect(determineTownDatasetSemantics({ ...base, targetFrom: "2026-08-01" })).toBe("historical");
  });
});
