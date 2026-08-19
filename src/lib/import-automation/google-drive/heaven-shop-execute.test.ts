import { describe, expect, it } from "vitest";
import { ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { assertHeavenShopMapping, assertHeavenShopProductionExecution, heavenReviewUrl, sameHeavenShopIdentity, validateHeavenShopExecuteInput } from "./heaven-shop-execute";

const mapping = (overrides: Record<string, unknown> = {}) => ({
  isActive: true, isFuture: false, importDataType: ImportDataType.HEAVEN_STORE, storeId: "store-kas", metricHint: null,
  importSource: { mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_STORE, storeId: "store-kas", metricHint: null, store: { code: StoreCode.KASUKABE } },
  ...overrides,
});

describe("Heaven SHOP manual execute validation", () => {
  it("requires a Drive file id", () => {
    expect(() => validateHeavenShopExecuteInput({ driveFileId: "" })).toThrow("--drive-file-id");
    expect(() => validateHeavenShopExecuteInput({ driveFileId: "file-1" })).not.toThrow();
  });
  it("requires explicit confirmation in production only", () => {
    expect(() => assertHeavenShopProductionExecution("production", false)).toThrow("--confirm-production");
    expect(() => assertHeavenShopProductionExecution("production", true)).not.toThrow();
    expect(() => assertHeavenShopProductionExecution("development", false)).not.toThrow();
  });
  it.each([
    ["inactive", { isActive: false }],
    ["future", { isFuture: true }],
    ["wrong data type", { importDataType: ImportDataType.HEAVEN_CAST }],
    ["missing store", { storeId: null }],
    ["source mismatch", { importSource: { mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_STORE, storeId: "other", metricHint: null, store: { code: StoreCode.KASUKABE } } }],
    ["unsupported store", { importSource: { mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_STORE, storeId: "store-kas", metricHint: null, store: { code: StoreCode.KOSHIGAYA } } }],
    ["mapping metric hint", { metricHint: "PAGE_ACCESS" }],
  ])("rejects %s mapping", (_label, overrides) => expect(() => assertHeavenShopMapping(mapping(overrides))).toThrow());
  it("accepts the Kasukabe Shop mapping without metricHint", () => expect(() => assertHeavenShopMapping(mapping())).not.toThrow());
  it("recognizes the same Drive identity only", () => {
    const state = { driveFileId: "file-1", driveModifiedTime: new Date("2026-08-08T00:00:00.000Z"), sha256: "abc" };
    expect(sameHeavenShopIdentity({}, state, { metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.HEAVEN_STORE, driveFileId: "file-1", driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: "abc" } })).toBe(true);
    expect(sameHeavenShopIdentity({}, state, { metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.HEAVEN_STORE, driveFileId: "file-1", driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: "other" } })).toBe(false);
  });
  it("uses the Heaven review route", () => expect(heavenReviewUrl("batch-1")).toBe("/imports/heaven/batch-1"));
});
