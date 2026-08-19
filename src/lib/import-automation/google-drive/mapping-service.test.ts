import { describe, expect, it, vi } from "vitest";

import { DriveFolderMappingPriority, ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { listActiveDriveFolderMappings, resolveDriveFolderMapping, upsertDriveFolderMapping, validateDriveFolderMappingInput } from "./mapping-service";

const source = (overrides: Record<string, unknown> = {}) => ({ mediaType: MediaType.TOWN, dataType: ImportDataType.TOWN_STORE, storeId: "store-kas", store: { code: StoreCode.KASUKABE }, ...overrides });
const input = (overrides: Record<string, unknown> = {}) => ({ driveFolderId: "dev-folder", displayName: "Town Kasukabe Store", importSourceId: "source-1", storeId: "store-kas", importDataType: ImportDataType.TOWN_STORE, ...overrides });
type FakeDb = { importSource: { findUnique: ReturnType<typeof vi.fn> }; driveFolderMapping: { upsert: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> } };

function dbFor(sourceValue: Record<string, unknown> | null = source()) {
  return {
    importSource: { findUnique: vi.fn().mockResolvedValue(sourceValue) },
    driveFolderMapping: {
      upsert: vi.fn().mockImplementation(async ({ create, include }: { create: Record<string, unknown>; include: unknown }) => ({ ...create, id: "mapping-1", importSource: sourceValue, store: null, include })),
      findUnique: vi.fn().mockResolvedValue({ id: "mapping-1", driveFolderId: "dev-folder", importSource: sourceValue, store: null }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as FakeDb;
}

describe("DriveFolderMapping service", () => {
  it("upserts an idempotent Town mapping", async () => {
    const db = dbFor();
    await expect(upsertDriveFolderMapping(input(), db as never)).resolves.toMatchObject({ driveFolderId: "dev-folder" });
    expect(db.driveFolderMapping.upsert).toHaveBeenCalledOnce();
  });

  it("uses driveFolderId as the duplicate-safe upsert key", async () => {
    const db = dbFor();
    await upsertDriveFolderMapping(input(), db as never);
    expect(db.driveFolderMapping.upsert.mock.calls[0][0].where).toEqual({ driveFolderId: "dev-folder" });
  });

  it("resolves a known Folder", async () => {
    await expect(resolveDriveFolderMapping("dev-folder", dbFor() as never)).resolves.toMatchObject({ driveFolderId: "dev-folder" });
  });

  it("returns an explicit UNMAPPED error for an unknown Folder", async () => {
    const db = dbFor();
    db.driveFolderMapping.findUnique.mockResolvedValue(null);
    await expect(resolveDriveFolderMapping("unknown", db as never)).rejects.toThrow("UNMAPPED");
  });

  it("keeps inactive mappings out of the active query", async () => {
    const db = dbFor();
    await listActiveDriveFolderMappings(db as never);
    expect(db.driveFolderMapping.findMany.mock.calls[0][0].where).toEqual({ isActive: true, isFuture: false });
  });

  it("keeps Future mappings out of the active query", async () => {
    const db = dbFor();
    await listActiveDriveFolderMappings(db as never);
    expect(db.driveFolderMapping.findMany.mock.calls[0][0].where.isFuture).toBe(false);
  });

  it("allows CTI to be multi-store with a null store", () => {
    expect(() => validateDriveFolderMappingInput(input({ storeId: null, importDataType: ImportDataType.CTI_CAST_REPORT }), source({ mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT, storeId: null, store: null }))).not.toThrow();
  });

  it("requires Town store to match ImportSource", () => {
    expect(() => validateDriveFolderMappingInput(input({ storeId: "other" }), source())).toThrow("storeId");
  });

  it("validates Heaven metricHint and Kasukabe", () => {
    expect(() => validateDriveFolderMappingInput(input({ importDataType: ImportDataType.HEAVEN_CAST, metricHint: "PAGE_ACCESS", storeId: "store-kas" }), source({ mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_CAST }))).not.toThrow();
    expect(() => validateDriveFolderMappingInput(input({ importDataType: ImportDataType.HEAVEN_CAST, metricHint: "NOT_A_METRIC", storeId: "store-kas" }), source({ mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_CAST }))).toThrow("metricHint");
  });

  it("rejects an invalid Heaven Shop metricHint", () => {
    expect(() => validateDriveFolderMappingInput(input({ importDataType: ImportDataType.HEAVEN_STORE, metricHint: "PAGE_ACCESS" }), source({ mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_STORE }))).toThrow("metricHint");
  });

  it("rejects Heaven outside Kasukabe", () => {
    expect(() => validateDriveFolderMappingInput(input({ importDataType: ImportDataType.HEAVEN_STORE }), source({ mediaType: MediaType.HEAVEN, dataType: ImportDataType.HEAVEN_STORE, store: { code: StoreCode.KOSHIGAYA }, storeId: "store-kas" }))).toThrow("Kasukabe");
  });

  it("requires Future priority and isFuture to agree", () => {
    expect(() => validateDriveFolderMappingInput(input({ priority: DriveFolderMappingPriority.FUTURE, isFuture: false }), source())).toThrow("isFuture");
  });
});
