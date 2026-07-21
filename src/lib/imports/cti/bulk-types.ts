export type CtiBulkFileState =
  | "NEW"
  | "CORRECTION_CANDIDATE"
  | "EXISTING_BATCH"
  | "SKIPPED_DUPLICATE"
  | "INVALID"
  | "UNSUPPORTED";

export type CtiBulkFile = {
  key: string;
  filename: string;
  targetDate: string | null;
  size: number;
  sha256: string | null;
  state: CtiBulkFileState;
  processStatus: string;
  batchId: string | null;
  pendingCount: number;
  warningCount: number;
  errorCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  importableCount: number;
  autoConfirmSafe: boolean;
  correctionBatchIds: string[];
  error: string | null;
  canProcess: boolean;
};

export type CtiBulkScan = {
  scannedAt: string;
  folder: { configured: boolean; fileCount: number; targetFileCount: number; error: string | null };
  importSource: { id: string; name: string } | null;
  files: CtiBulkFile[];
};

export type CtiBulkProcessResult = {
  key: string;
  outcome: "VALIDATED" | "CONFIRMED" | "SKIPPED_DUPLICATE" | "EXISTING_BATCH" | "NEEDS_REVIEW";
  batchId: string | null;
  status: string;
  pendingCount: number;
  warningCount: number;
  errorCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  importableCount: number;
  autoConfirmSafe: boolean;
  message: string;
  request?: { apiUrl: string; startedAt: string; finishedAt: string; durationMs: number };
};
