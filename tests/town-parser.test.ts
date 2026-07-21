import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ImportDataType, StoreCode } from "@/generated/prisma/client";
import { parseTownCsv } from "@/lib/imports/town/parser";
import type { TownImportDataType } from "@/lib/imports/town/types";

async function fixture(name: string, dataType: TownImportDataType, storeCode = StoreCode.KASUKABE, externalStoreId = "11111") {
  return parseTownCsv({
    buffer: await readFile(new URL(`./fixtures/${name}`, import.meta.url)), batchId: "batch", runId: "run",
    dataType, storeId: storeCode, storeCode, storeName: storeCode,
    targetFrom: "2026-07-13", targetTo: "2026-07-13", expectedExternalStoreId: externalStoreId,
  });
}

describe("Town CSV parser", () => {
  it("parses store rows and recalculates ratios", async () => {
    const preview = await fixture("town-store.csv", ImportDataType.TOWN_STORE);
    expect(preview).toMatchObject({ encoding: "UTF-8", headerRow: 3, unknownColumns: [] });
    expect(preview.rows[0]).toMatchObject({ kind: "STORE", pv: 1200, uu: 200, averagePv: 6, telTapUu: 4, conversionRate: 0.02, bounceRate: 0.2 });
  });

  it("parses cast rows and keeps zero denominators null", async () => {
    const preview = await fixture("town-cast.csv", ImportDataType.TOWN_CAST, StoreCode.KOSHIGAYA);
    expect(preview.storeCode).toBe(StoreCode.KOSHIGAYA);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[1]).toMatchObject({ averagePv: null, conversionRate: null });
  });

  it("parses URL and landing CSV independently", async () => {
    const url = await fixture("town-url.csv", ImportDataType.TOWN_URL);
    const landing = await fixture("town-landing.csv", ImportDataType.TOWN_LANDING);
    expect(url.rows[0]).toMatchObject({ kind: "URL", normalizedUrl: "https://www.dto.jp/shop/11111", externalStoreId: "11111", pageType: "STORE_TOP" });
    expect(url.rows[1]).toMatchObject({ externalCastId: "2222222", pageType: "CAST_DIARY" });
    expect(landing.rows[1]).toMatchObject({ kind: "LANDING", pageType: "CAST_PROFILE", uu: 40 });
  });

  it("rejects a selected type that contradicts the file structure", async () => {
    const preview = await fixture("town-store.csv", ImportDataType.TOWN_CAST);
    expect(preview.globalIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FILE_TYPE_MISMATCH", level: "ERROR" })]));
    expect(preview.rows).toHaveLength(0);
  });

  it("decodes CP932 without using the filename for store selection", () => {
    const cp932 = Buffer.from("MjAyNpRON4yOMTOT+iCBYCAyMDI2lE43jI4xM5P6CgqT+pV0LFBWKIN5gVuDV4Nyg4WBWyksVVUog4aDaoFbg06DhoFbg1WBWykslb2Lz1BWLJK8i0GXpixURUyDXoNig3YoVVUpLINSg5ODb4Fbg1eDh4OTl6YoVEVMg16DYoN2L1VVKQoyMDI2lE43jI4xM5P6KIyOKSwyLDEsMi4wMCwxMC4wJSwxLDEwMC4wMCUK", "base64");
    const preview = parseTownCsv({ buffer: cp932, batchId: "b", runId: "r", dataType: ImportDataType.TOWN_STORE, storeId: "chosen-store", storeCode: StoreCode.KOSHIGAYA, storeName: "越谷", targetFrom: "2026-07-13", targetTo: "2026-07-13" });
    expect(preview.encoding).toBe("CP932");
    expect(preview.storeCode).toBe(StoreCode.KOSHIGAYA);
  });
});
