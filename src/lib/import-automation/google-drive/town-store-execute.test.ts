import { describe, expect, it } from "vitest";
import { ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { assertTownStoreMapping, assertTownStoreProductionExecution, sameTownStoreIdentity, townReviewUrl, validateTownStoreExecuteInput } from "./town-store-execute";

const mapping = (overrides: Record<string, unknown> = {}) => ({ isActive: true, isFuture: false, importDataType: ImportDataType.TOWN_STORE, storeId: "store-kas", importSource: { mediaType: MediaType.TOWN, dataType: ImportDataType.TOWN_STORE, storeId: "store-kas", store: { code: StoreCode.KASUKABE } }, ...overrides });

describe("Town STORE manual execute validation", () => {
  it("requires a file id and strict target date", () => {
    expect(() => validateTownStoreExecuteInput({ driveFileId: "", targetDate: "2026-08-08" })).toThrow("--drive-file-id");
    expect(() => validateTownStoreExecuteInput({ driveFileId: "file-1", targetDate: "2026/08/08" })).toThrow("--target-date");
    expect(() => validateTownStoreExecuteInput({ driveFileId: "file-1", targetDate: "2026-02-30" })).toThrow("--target-date");
  });

  it("accepts an explicit valid date", () => expect(() => validateTownStoreExecuteInput({ driveFileId: "file-1", targetDate: "2026-08-08" })).not.toThrow());
  it("requires an explicit production confirmation", () => {
    expect(() => assertTownStoreProductionExecution("production", false)).toThrow("--confirm-production");
    expect(() => assertTownStoreProductionExecution("production", true)).not.toThrow();
    expect(() => assertTownStoreProductionExecution("development", false)).not.toThrow();
  });
  it.each([
    ["inactive", { isActive: false }], ["future", { isFuture: true }], ["wrong data type", { importDataType: ImportDataType.TOWN_CAST }],
    ["missing store", { storeId: null }], ["source mismatch", { importSource: { mediaType: MediaType.TOWN, dataType: ImportDataType.TOWN_STORE, storeId: "other", store: { code: StoreCode.KASUKABE } } }],
    ["Noda", { importSource: { mediaType: MediaType.TOWN, dataType: ImportDataType.TOWN_STORE, storeId: "store-kas", store: { code: StoreCode.NODA } } }],
  ])("rejects %s mapping", (_label, overrides) => expect(() => assertTownStoreMapping(mapping(overrides))).toThrow());
  it("accepts both supported stores", () => {
    expect(() => assertTownStoreMapping(mapping())).not.toThrow();
    expect(() => assertTownStoreMapping(mapping({ storeId: "store-kos", importSource: { mediaType: MediaType.TOWN, dataType: ImportDataType.TOWN_STORE, storeId: "store-kos", store: { code: StoreCode.KOSHIGAYA } } }))).not.toThrow();
  });
  it("recognizes only the same Drive identity", () => {
    const state = { driveFileId: "file-1", driveModifiedTime: new Date("2026-08-08T00:00:00.000Z"), sha256: "abc" };
    expect(sameTownStoreIdentity({ origin: "GOOGLE_DRIVE", importDataType: ImportDataType.TOWN_STORE }, state, { metadata: { origin: "GOOGLE_DRIVE", importDataType: ImportDataType.TOWN_STORE, driveFileId: "file-1", driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: "abc" } })).toBe(true);
    expect(sameTownStoreIdentity({ origin: "GOOGLE_DRIVE" }, state, { metadata: { origin: "GOOGLE_DRIVE", driveFileId: "file-1", driveModifiedTime: state.driveModifiedTime.toISOString(), driveSha256: "other" } })).toBe(false);
  });
  it("uses the Town review route", () => expect(townReviewUrl("batch-1")).toBe("/imports/town/batch-1"));
});
