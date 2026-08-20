import { describe, expect, it } from "vitest";
import { ImportDataType } from "@/generated/prisma/client";
import { resolveAutoPreviewDecision } from "./auto-execution-gate";

const mapping = (importDataType: ImportDataType, metricHint: string | null = null, overrides: Record<string, unknown> = {}) => ({ importDataType, metricHint, isActive: true, isFuture: false, ...overrides });

describe("I8 AUTO Preview gate", () => {
  it("keeps the global gate disabled by default", () => expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_STORE), false).reason).toBe("AUTO_EXECUTION_DISABLED"));
  it("allows Heaven Shop and the two approved Heaven CAST metrics", () => { expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_STORE), true).allowed).toBe(true); expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_CAST, "PAGE_ACCESS"), true).allowed).toBe(true); expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_CAST, "DIARY_POSTS"), true).allowed).toBe(true); });
  it("blocks CTI/Town until target date can be resolved without operator input", () => { expect(resolveAutoPreviewDecision(mapping(ImportDataType.CTI_CAST_REPORT), true).reason).toBe("TARGET_DATE_REQUIRES_OPERATOR_INPUT"); expect(resolveAutoPreviewDecision(mapping(ImportDataType.TOWN_STORE), true).allowed).toBe(false); expect(resolveAutoPreviewDecision(mapping(ImportDataType.TOWN_CAST), true).allowed).toBe(false); });
  it("blocks inactive, future and unsupported mappings", () => { expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_STORE, null, { isActive: false }), true).allowed).toBe(false); expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_STORE, null, { isFuture: true }), true).allowed).toBe(false); expect(resolveAutoPreviewDecision(mapping(ImportDataType.HEAVEN_CAST, "MY_GIRL"), true).allowed).toBe(false); });
});
