import { ImportBatchStatus, ImportDataType, type ImportError } from "@/generated/prisma/client";
import type { TownPreviewRow } from "@/lib/imports/town/types";

export const TOWN_RESOLUTION_DATA_TYPES = [ImportDataType.TOWN_CAST, ImportDataType.TOWN_URL, ImportDataType.TOWN_LANDING] as const;
export const TOWN_RESOLUTION_STATUSES = [
  ImportBatchStatus.PREVIEW_READY,
  ImportBatchStatus.WAITING_FOR_CAST_LINK,
  ImportBatchStatus.COMPLETED_WITH_WARNINGS,
  ImportBatchStatus.COMPLETED,
] as const;

export function isTownResolutionBatch(dataType: string, status: string) {
  return TOWN_RESOLUTION_DATA_TYPES.some((value) => value === dataType) && TOWN_RESOLUTION_STATUSES.some((value) => value === status);
}

export function openUnmatchedRowNumbers(errors: Pick<ImportError, "rowNumber" | "errorCode" | "status">[]) {
  return new Set(errors.flatMap((error) => error.status === "OPEN" && error.errorCode === "UNMATCHED_CAST" && error.rowNumber !== null ? [error.rowNumber] : []));
}

export function canResolveTownRow(dataType: string, status: string, row: TownPreviewRow, openRows: Set<number>) {
  return isTownResolutionBatch(dataType, status)
    && row.kind !== "STORE"
    && row.castId === null
    && row.resolutionStatus !== "SKIPPED"
    && openRows.has(row.sourceRowNumber);
}
