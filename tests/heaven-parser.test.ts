import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHeavenCsvText } from "@/lib/imports/heaven/parser";
import { validateHeavenParse } from "@/lib/imports/heaven/service";

const heavenDir = "/Users/matsu/Documents/Codex/Heven";

describe("Heaven CSV parser", () => {
  it("detects shop content and parses daily metric rows", () => {
    const csv = "\uFEFF2026年6月,アクセス総数,アクション数_総数\n6/1(月),1,2\n6/2(火),3,4\n合計,4,6\n今月,4,6\n先月,0,0\n増減,4,6\n";
    const parsed = parseHeavenCsvText(csv);
    expect(parsed.kind).toBe("HEAVEN_SHOP");
    expect(parsed.sourcePeriodFrom).toBe("2026-06-01");
    expect(parsed.sourcePeriodTo).toBe("2026-06-02");
    expect(parsed.shopRows).toHaveLength(4);
    expect(parsed.shopRows[0]).toMatchObject({ date: "2026-06-01", metricKey: "アクセス総数", rawValue: 1, valueKind: "DAILY_EVENT", rawValueStatus: "VALUE", sourceRowNumber: 2 });
  });

  it("preserves blank and not-applicable values without coercing to zero", () => {
    const csv = "2026年6月,アクセス総数,アクション数_総数\n6/1(月),---,\n";
    const parsed = parseHeavenCsvText(csv);
    expect(parsed.shopRows.map((row) => row.rawValueStatus)).toEqual(["NOT_APPLICABLE", "BLANK"]);
    expect(parsed.shopRows.every((row) => row.rawValue === null)).toBe(true);
  });

  it("does not guess a girl metric from an indistinguishable name-only header", () => {
    const headers = ["2026年\n6月", ...Array.from({ length: 100 }, (_, index) => `女子${index + 1}`)];
    const csv = [`"${headers[0]}"`, ...headers.slice(1)].join(",") + "\n" + ["06/01(月)", ...Array(100).fill("1")].join(",");
    const parsed = parseHeavenCsvText(csv);
    expect(parsed.kind).toBe("UNKNOWN");
    expect(parsed.classificationReason).toContain("指標名");
    expect(parsed.castRows).toHaveLength(100);
    expect(parsed.castRows[0]).toMatchObject({ sourceCastName: "女子1", normalizedSourceCastName: "女子1", metricKey: "unknown", valueKind: "UNKNOWN" });
  });

  it("applies an explicit non-filename metric hint for snapshot parsing", () => {
    const headers = ["2026年6月", ...Array.from({ length: 100 }, (_, index) => `女子${index + 1}`)];
    const csv = [`"${headers[0]}"`, ...headers.slice(1)].join(",") + "\n" + ["06/01(月)", ...Array(100).fill("1")].join(",");
    const parsed = parseHeavenCsvText(csv, { metricKeyHint: "my_girl", valueKindHint: "SNAPSHOT" });
    expect(parsed.castRows[0]).toMatchObject({ metricKey: "my_girl", valueKind: "SNAPSHOT" });
  });

  it("maps explicit metric hints to the reviewed value kind", () => {
    const headers = ["2026年6月", ...Array.from({ length: 100 }, (_, index) => `女子${index + 1}`)];
    const csv = [`"${headers[0]}"`, ...headers.slice(1)].join(",") + "\n" + ["06/01(月)", ...Array(100).fill("1")].join(",");
    expect(parseHeavenCsvText(csv, { metricHint: "PAGE_ACCESS" }).castRows[0].valueKind).toBe("DAILY_EVENT");
    expect(parseHeavenCsvText(csv, { metricHint: "MY_GIRL" }).castRows[0].valueKind).toBe("SNAPSHOT");
    expect(parseHeavenCsvText(csv, { metricHint: "DIARY_NOTICE" }).castRows[0].valueKind).toBe("SNAPSHOT");
  });

  it("requires a metric hint for girl-shaped CSVs and rejects it for shop CSVs", () => {
    const girlHeaders = ["2026年6月", ...Array.from({ length: 100 }, (_, index) => `女子${index + 1}`)];
    const girl = parseHeavenCsvText([`"${girlHeaders[0]}"`, ...girlHeaders.slice(1)].join(",") + "\n" + ["06/01(月)", ...Array(100).fill("1")].join(","));
    expect(() => validateHeavenParse(girl)).toThrow("明示選択");
    expect(() => validateHeavenParse(girl, "PAGE_ACCESS")).not.toThrow();
    const shop = parseHeavenCsvText("2026年6月,アクセス総数,アクション数_総数\n6/1(月),1,2");
    expect(() => validateHeavenParse(shop, "PAGE_ACCESS")).toThrow("店舗CSV");
  });

  it.skipIf(!existsSync(heavenDir))("parses every supplied CSV without using its filename", () => {
    const files = readdirSync(heavenDir).filter((name) => name.endsWith(".csv"));
    expect(files).toHaveLength(8);
    for (const name of files) {
      const parsed = parseHeavenCsvText(readFileSync(`${heavenDir}/${name}`, "utf8"));
      expect(parsed.sourcePeriodFrom).toBe("2026-06-01");
      expect(parsed.sourcePeriodTo).toBe("2026-06-30");
      if (name === "heaven_shop_202606.csv") expect(parsed.shopRows).toHaveLength(840);
      else expect(parsed.castRows).toHaveLength(4410);
    }
  });
});
