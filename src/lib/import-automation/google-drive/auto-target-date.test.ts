import { describe, expect, it } from "vitest";
import { StoreCode } from "@/generated/prisma/client";
import { resolveCtiAutoTargetDate, resolveTownAutoTargetDate } from "./auto-target-date";

describe("I10 AUTO target-date resolvers", () => {
  it("rejects CTI filenames that are not the strict daily pattern", async () => {
    await expect(resolveCtiAutoTargetDate({ buffer: Buffer.from(""), fileName: "女子別レポート.xlsx" })).rejects.toThrow("filename");
  });
  it("rejects Town files without an internally detected period", async () => {
    await expect(resolveTownAutoTargetDate({ buffer: Buffer.from(""), fileName: "dto.jp-shop-20260820_to_20260820.csv", dataType: "TOWN_STORE", storeId: "store-1", storeCode: StoreCode.KASUKABE })).rejects.toThrow("period");
  });
});
