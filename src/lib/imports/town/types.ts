import type { ImportDataType, StoreCode, TownPageType } from "@/generated/prisma/client";

export type TownImportDataType = Extract<ImportDataType, "TOWN_STORE" | "TOWN_CAST" | "TOWN_URL" | "TOWN_LANDING">;

export type TownIssue = {
  code: string;
  level: "WARNING" | "ERROR";
  message: string;
  columnName?: string;
  rawData?: unknown;
};

export type TownResolutionStatus = "EXACT_ALIAS" | "NORMALIZED_ALIAS" | "NORMALIZED_CAST" | "UNMATCHED" | "AMBIGUOUS" | "NOT_APPLICABLE" | "SKIPPED";

export type TownRatioMetrics = {
  pv: number;
  uu: number;
  averagePv: number | null;
  sourceAveragePv: number | null;
  telTapUu: number;
  conversionRate: number | null;
  sourceConversionRate: number | null;
};

export type TownStorePreviewRow = TownRatioMetrics & {
  kind: "STORE";
  rowKey: string;
  sourceRowNumber: number;
  date: string;
  bounceRate: number | null;
  castId: null;
  castDisplayName: null;
  resolutionStatus: "NOT_APPLICABLE";
  issues: TownIssue[];
};

export type TownCastPreviewRow = TownRatioMetrics & {
  kind: "CAST";
  rowKey: string;
  sourceRowNumber: number;
  date: string;
  originalCastName: string;
  normalizedCastName: string;
  castId: string | null;
  castDisplayName: string | null;
  resolutionStatus: TownResolutionStatus;
  isListed: true;
  issues: TownIssue[];
};

export type TownUrlPreviewRow = TownRatioMetrics & {
  kind: "URL";
  rowKey: string;
  sourceRowNumber: number;
  date: string;
  url: string;
  normalizedUrl: string;
  externalStoreId: string | null;
  externalCastId: string | null;
  sourceCastName: string | null;
  normalizedCastName: string | null;
  castId: string | null;
  castDisplayName: string | null;
  resolutionStatus: TownResolutionStatus;
  pageType: TownPageType;
  issues: TownIssue[];
};

export type TownLandingPreviewRow = {
  kind: "LANDING";
  rowKey: string;
  sourceRowNumber: number;
  date: string;
  landingUrl: string;
  normalizedUrl: string;
  externalStoreId: string | null;
  externalCastId: string | null;
  sourceCastName: string | null;
  normalizedCastName: string | null;
  castId: string | null;
  castDisplayName: string | null;
  resolutionStatus: TownResolutionStatus;
  pageType: TownPageType;
  uu: number;
  bounceRate: number | null;
  telTapUu: number;
  conversionRate: number | null;
  sourceConversionRate: number | null;
  issues: TownIssue[];
};

export type TownPreviewRow = TownStorePreviewRow | TownCastPreviewRow | TownUrlPreviewRow | TownLandingPreviewRow;

export type TownPreview = {
  version: 1;
  batchId: string;
  runId: string;
  dataType: TownImportDataType;
  storeId: string;
  storeCode: StoreCode;
  storeName: string;
  targetFrom: string;
  targetTo: string;
  sourcePeriodFrom: string | null;
  sourcePeriodTo: string | null;
  encoding: "UTF-8" | "UTF-8_BOM" | "CP932";
  delimiter: ",";
  headerRow: number;
  detectedColumns: string[];
  unknownColumns: string[];
  rows: TownPreviewRow[];
  globalIssues: TownIssue[];
  createdAt: string;
};
