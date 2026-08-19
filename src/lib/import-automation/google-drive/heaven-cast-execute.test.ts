import { describe, expect, it } from "vitest";
import { ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { assertHeavenCastMapping, assertHeavenCastProductionExecution, heavenCastReviewUrl, validateHeavenCastExecuteInput } from "./heaven-cast-execute";
const mapping = (metricHint: string | null = "PAGE_ACCESS", overrides: Record<string, unknown> = {}) => ({ isActive: true, isFuture: false, importDataType: ImportDataType.HEAVEN_CAST, storeId: "store-kas", metricHint, importSource: { mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_CAST, storeId: "store-kas", store: { code: StoreCode.KASUKABE } }, ...overrides });
describe("Heaven CAST manual execute", () => {
  it.each(["PAGE_ACCESS", "DIARY_POSTS"]) ("accepts %s", (metricHint) => expect(() => assertHeavenCastMapping(mapping(metricHint))).not.toThrow());
  it.each(["MY_GIRL", "MITENE_SENT", "OKINI_TALK_SENT", "DIARY_NOTICE", null]) ("rejects unsupported metricHint %s", (metricHint) => expect(() => assertHeavenCastMapping(mapping(metricHint))).toThrow());
  it("requires HEAVEN_CAST, Kasukabe, active nonfuture mapping", () => { expect(() => assertHeavenCastMapping(mapping("PAGE_ACCESS", { importDataType: ImportDataType.HEAVEN_STORE }))).toThrow(); expect(() => assertHeavenCastMapping(mapping("PAGE_ACCESS", { storeId: null }))).toThrow(); expect(() => assertHeavenCastMapping(mapping("PAGE_ACCESS", { isActive: false }))).toThrow(); expect(() => assertHeavenCastMapping(mapping("PAGE_ACCESS", { isFuture: true }))).toThrow(); });
  it("requires production confirmation and uses the Heaven URL", () => { expect(() => validateHeavenCastExecuteInput({ driveFileId: "" })).toThrow("--drive-file-id"); expect(() => validateHeavenCastExecuteInput({ driveFileId: "f" })).not.toThrow(); expect(() => assertHeavenCastProductionExecution("production", false)).toThrow("--confirm-production"); expect(heavenCastReviewUrl("batch-1")).toBe("/imports/heaven/batch-1"); });
});
