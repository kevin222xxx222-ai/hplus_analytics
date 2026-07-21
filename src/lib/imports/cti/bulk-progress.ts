import type { CtiBulkFile } from "@/lib/imports/cti/bulk-types";

export type CtiBulkFailure = {
  key: string;
  filename: string;
  position: number;
  httpStatus: number | null;
  apiUrl: string;
  message: string;
};

export type CtiBulkProgressSummary = {
  total: number;
  processed: number;
  completed: number;
  duplicates: number;
  review: number;
  failed: number;
  remaining: number;
  percent: number;
};

export function isCtiBulkTarget(file: CtiBulkFile) {
  return Boolean(file.targetDate);
}

export function isCtiBulkReview(file: CtiBulkFile) {
  return file.processStatus === "WAITING_FOR_CAST_LINK" || file.pendingCount > 0 || file.errorCount > 0 || file.ambiguousCount > 0;
}

export function isCtiBulkCompleted(file: CtiBulkFile) {
  return file.state === "EXISTING_BATCH" && file.processStatus !== "FAILED" && !isCtiBulkReview(file);
}

export function selectCtiBulkPendingFiles(files: CtiBulkFile[]) {
  return files.filter((file) => isCtiBulkTarget(file) && file.canProcess && file.processStatus !== "FAILED");
}

export function selectCtiBulkRetryFiles(files: CtiBulkFile[], failures: Record<string, CtiBulkFailure>) {
  return files.filter((file) => isCtiBulkTarget(file) && (file.processStatus === "FAILED" || Boolean(failures[file.key])));
}

export function summarizeCtiBulkProgress(files: CtiBulkFile[], failures: Record<string, CtiBulkFailure> = {}): CtiBulkProgressSummary {
  const targets = files.filter(isCtiBulkTarget);
  const failedKeys = new Set([
    ...targets.filter((file) => file.processStatus === "FAILED").map((file) => file.key),
    ...Object.keys(failures),
  ]);
  const failed = failedKeys.size;
  const duplicates = targets.filter((file) => file.state === "SKIPPED_DUPLICATE" && !failedKeys.has(file.key)).length;
  const duplicateKeys = new Set(targets.filter((file) => file.state === "SKIPPED_DUPLICATE").map((file) => file.key));
  const review = targets.filter((file) => !failedKeys.has(file.key) && !duplicateKeys.has(file.key) && isCtiBulkReview(file)).length;
  const completed = targets.filter((file) => !failedKeys.has(file.key) && !duplicateKeys.has(file.key) && !isCtiBulkReview(file) && isCtiBulkCompleted(file)).length;
  const processed = Math.min(targets.length, completed + duplicates + review + failed);
  const remaining = Math.max(0, targets.length - processed);
  return { total: targets.length, processed, completed, duplicates, review, failed, remaining, percent: targets.length > 0 && processed === targets.length ? 100 : targets.length ? Math.floor((processed / targets.length) * 100) : 0 };
}
