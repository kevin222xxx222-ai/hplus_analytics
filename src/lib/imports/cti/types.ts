import type { StoreCode } from "@/generated/prisma/client";

export type CtiMetrics = {
  attendanceCount: number;
  attendanceMinutes: number;
  sameDayAbsenceCount: number;
  reservationCount: number;
  cancellationCount: number;
  serviceCount: number;
  sourceServiceCount: number | null;
  regularNominationCount: number;
  photoNominationCount: number;
  freeCount: number;
  contractCount: number;
  sourceContractCount: number | null;
  newCount: number | null;
  repeatCount: number | null;
  salesAmount: number;
  castRewardAmount: number;
  ctiProfitAmount: number;
  payoutAfterRewardAmount: number;
  diaryCountCti: number;
  paidOptionCount: number;
};

export type RowIssue = {
  code: string;
  level: "WARNING" | "ERROR";
  message: string;
  columnName?: string;
  rawData?: unknown;
};

export type ResolutionStatus = "EXACT_ALIAS" | "NORMALIZED_ALIAS" | "NORMALIZED_CAST" | "UNMATCHED" | "AMBIGUOUS" | "SKIPPED";

export type CtiPreviewRow = {
  rowKey: string;
  storeCode: StoreCode;
  storeId: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  originalCastName: string;
  normalizedCastName: string;
  castId: string | null;
  castDisplayName: string | null;
  resolutionStatus: ResolutionStatus;
  exclusionReason: string | null;
  metrics: CtiMetrics | null;
  issues: RowIssue[];
};

export type SheetPreview = {
  sheetName: string;
  storeCode: StoreCode;
  detectedHeaderRow: number;
  detectedColumns: string[];
  unknownColumns: string[];
  unknownColumnDetails?: UnknownColumnDiagnostic[];
  totalRows: number;
  excludedRows: number;
  rows: CtiPreviewRow[];
  headerDiagnostics?: SheetHeaderDiagnostics;
};

export type UnknownColumnDiagnostic = {
  storeCode: StoreCode;
  sheetName: string;
  originalName: string;
  columnNumber: number;
  headerRowNumber: number;
};

export type HeaderDiagnosticRow = {
  rowNumber: number;
  values: string[];
};

export type HeaderCandidateDiagnostic = {
  rowNumber: number;
  matchCount: number;
  matchedColumns: string[];
  missingRequiredColumns: string[];
  hasCastName: boolean;
  eligible: boolean;
  selected: boolean;
  castNameInferred: boolean;
};

export type SheetHeaderDiagnostics = {
  sheetName: string;
  scannedRowCount: number;
  rows: HeaderDiagnosticRow[];
  candidates: HeaderCandidateDiagnostic[];
};

export type CtiPreview = {
  version: 1;
  batchId: string;
  runId: string;
  importMode: "DAILY" | "MONTH_TO_DATE" | "MONTHLY_FINAL" | "UNKNOWN";
  targetFrom: string;
  targetTo: string;
  workbookSheetNames: string[];
  missingTargetSheets: string[];
  sheets: SheetPreview[];
  globalIssues: RowIssue[];
  createdAt: string;
};
