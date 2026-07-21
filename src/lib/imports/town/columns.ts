import { ImportDataType } from "@/generated/prisma/client";
import type { TownImportDataType } from "@/lib/imports/town/types";

export const TOWN_COLUMNS = {
  TOWN_STORE: {
    date: "日付",
    pv: "PV(ページビュー)",
    uu: "UU(ユニークユーザー)",
    averagePv: "平均PV",
    bounceRate: "直帰率",
    telTapUu: "TELタップ(UU)",
    conversionRate: "コンバージョン率(TELタップ/UU)",
  },
  TOWN_CAST: {
    castName: "女の子",
    pv: "PV(ページビュー)",
    uu: "UU(ユニークユーザー)",
    averagePv: "平均PV",
    telTapUu: "TELタップ(UU)",
    conversionRate: "コンバージョン率(TELタップ/UU)",
  },
  TOWN_URL: {
    url: "URL",
    castName: "女の子",
    pv: "PV(ページビュー)",
    uu: "UU(ユニークユーザー)",
    averagePv: "平均PV",
    telTapUu: "TELタップ(UU)",
    conversionRate: "コンバージョン率(TELタップ/UU)",
  },
  TOWN_LANDING: {
    landingUrl: "ランディングページ",
    castName: "女の子",
    uu: "UU(ユニークユーザー)",
    bounceRate: "直帰率",
    telTapUu: "TELタップ(UU)",
    conversionRate: "コンバージョン率(TELタップ/UU)",
  },
} as const;

export const TOWN_DATA_TYPES: TownImportDataType[] = [
  ImportDataType.TOWN_STORE,
  ImportDataType.TOWN_CAST,
  ImportDataType.TOWN_URL,
  ImportDataType.TOWN_LANDING,
];

export function requiredHeaders(type: TownImportDataType) {
  return Object.values(TOWN_COLUMNS[type]);
}

export function detectTownDataType(rows: string[][]): TownImportDataType | null {
  // More specific URL/LP signatures must be checked before TOWN_CAST because
  // both files also contain the common 「女の子」 and access metric columns.
  const detectionOrder: TownImportDataType[] = [ImportDataType.TOWN_STORE, ImportDataType.TOWN_URL, ImportDataType.TOWN_LANDING, ImportDataType.TOWN_CAST];
  for (const type of detectionOrder) {
    const required = requiredHeaders(type);
    if (rows.some((row) => required.every((header) => row.map(normalizeHeader).includes(normalizeHeader(header))))) return type;
  }
  return null;
}

export function normalizeHeader(value: string) {
  return value.normalize("NFKC").trim();
}
