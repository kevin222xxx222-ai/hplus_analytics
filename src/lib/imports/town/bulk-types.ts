import type { TownImportDataType } from "@/lib/imports/town/types";

export type TownBulkStoreKey = "KASUKABE" | "KOSHIGAYA";
export type TownBulkFileState =
  | "NEW"
  | "CORRECTION_CANDIDATE"
  | "EXISTING_BATCH"
  | "SKIPPED_DUPLICATE"
  | "INVALID"
  | "UNSUPPORTED";

export type TownBulkFile = {
  key: string;
  folderKey: TownBulkStoreKey;
  storeName: string;
  filename: string;
  dataType: TownImportDataType | null;
  targetFrom: string | null;
  targetTo: string | null;
  size: number;
  sha256: string | null;
  state: TownBulkFileState;
  processStatus: string;
  batchId: string | null;
  pendingCount: number;
  warningCount: number;
  errorCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  autoConfirmSafe: boolean;
  correctionBatchIds: string[];
  partialConfirmEligible?: boolean;
  partialUnmatchedUrlCount?: number;
  partialUnmatchedLandingCount?: number;
  partialSaveRowCount?: number;
  idNoSourceUrlPartialConfirmEligible?: boolean;
  idNoSourceUrlPartialSaveRowCount?: number;
  idNoSourceUrlPartialHeldRowCount?: number;
  idNoSourceUrlPartialNewRowCount?: number;
  idNoSourceUrlPartialUpdatedRowCount?: number;
  error: string | null;
  canProcess: boolean;
};

export type TownBulkScan = {
  scannedAt: string;
  folders: Array<{ folderKey: TownBulkStoreKey; storeName: string; configured: boolean; fileCount: number; error: string | null }>;
  files: TownBulkFile[];
  partialConfirmSummary?: {
    fileCount: number;
    unmatchedRows: number;
    urlRows: number;
    landingRows: number;
    saveRows: number;
  };
  idNoSourceUrlPartialSummary?: {
    fileCount: number;
    saveRows: number;
    newRows: number;
    updatedRows: number;
    heldRows: number;
  };
};

export type TownBulkProcessResult = {
  key: string;
  outcome: "VALIDATED" | "CONFIRMED" | "SKIPPED_DUPLICATE" | "EXISTING_BATCH" | "NEEDS_REVIEW";
  batchId: string | null;
  status: string;
  pendingCount: number;
  warningCount: number;
  errorCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  autoConfirmSafe: boolean;
  message: string;
};
