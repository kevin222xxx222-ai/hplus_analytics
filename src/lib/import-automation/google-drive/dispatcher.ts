import { DriveFileStatus, ImportDataType } from "@/generated/prisma/client";
import type { DriveImportFile } from "./types";
import { transitionDriveFileState } from "./file-state-service";

export type DispatcherPolicy = "AUTO" | "MANUAL_REVIEW" | "BLOCKED";
export type DispatcherResultStatus = "IMPORTED" | "REVIEW_REQUIRED" | "BLOCKED" | "FAILED";
export type DispatcherMode = "RESOLVE_ONLY" | "EXECUTE";

export type ResolvedDriveFolderMapping = {
  id: string;
  driveFolderId: string;
  displayName: string;
  importDataType: ImportDataType;
  metricHint: string | null;
  isActive: boolean;
  isFuture: boolean;
  importSource: { id: string; name: string; dataType: ImportDataType; mediaType: string; storeId: string | null };
  store: { id: string; code: string; shortName: string } | null;
};

export type DispatcherInput = {
  file: DriveImportFile;
  mapping: ResolvedDriveFolderMapping;
  stateId?: string;
  stateStatus?: DriveFileStatus;
};

export type DispatchRoute = {
  pipeline: "CTI" | "TOWN_STORE" | "TOWN_CAST" | "HEAVEN_SHOP" | "HEAVEN_GIRL_ACCESS" | "HEAVEN_GIRL_DIARY";
  policy: DispatcherPolicy;
  reason?: string;
};

export type PipelineExecutionResult = {
  importBatchId?: string | null;
  status: string;
  warningCount?: number;
  pendingCount?: number;
  errorCount?: number;
  reviewRequired?: boolean;
};

export type DispatcherOptions = {
  mode?: DispatcherMode;
  executePipeline?: (input: DispatcherInput & { route: DispatchRoute }) => Promise<PipelineExecutionResult>;
  transitionState?: (stateId: string, to: DriveFileStatus) => Promise<unknown>;
  executeManualReview?: boolean;
  executorOwnsState?: boolean;
};

export type DispatcherResult = {
  status: DispatcherResultStatus;
  pipeline: DispatchRoute["pipeline"] | null;
  policy: DispatcherPolicy;
  importBatchId: string | null;
  message: string;
  autoConfirmed: boolean;
  reviewReason: string | null;
  errorCode: string | null;
};

const unsupportedDataTypes = new Set<ImportDataType>([
  ImportDataType.TOWN_URL,
  ImportDataType.TOWN_LANDING,
]);

function baseResult(route: DispatchRoute, status: DispatcherResultStatus, message: string, extra: Partial<DispatcherResult> = {}): DispatcherResult {
  return { status, pipeline: route.pipeline, policy: route.policy, importBatchId: null, message, autoConfirmed: false, reviewReason: null, errorCode: null, ...extra };
}

export function resolveDispatchRoute(mapping: Pick<ResolvedDriveFolderMapping, "importDataType" | "metricHint" | "isActive" | "isFuture">): DispatchRoute {
  if (!mapping.isActive || mapping.isFuture) return { pipeline: "CTI", policy: "BLOCKED", reason: "INACTIVE_OR_FUTURE_MAPPING" };
  switch (mapping.importDataType) {
    case ImportDataType.CTI_CAST_REPORT: return { pipeline: "CTI", policy: "MANUAL_REVIEW", reason: "CTI_REQUIRES_MANUAL_REVIEW" };
    case ImportDataType.TOWN_STORE: return { pipeline: "TOWN_STORE", policy: "AUTO" };
    case ImportDataType.TOWN_CAST: return { pipeline: "TOWN_CAST", policy: "MANUAL_REVIEW", reason: "TOWN_CAST_REQUIRES_MANUAL_REVIEW" };
    case ImportDataType.HEAVEN_STORE: return { pipeline: "HEAVEN_SHOP", policy: "AUTO" };
    case ImportDataType.HEAVEN_CAST:
      if (mapping.metricHint === "PAGE_ACCESS") return { pipeline: "HEAVEN_GIRL_ACCESS", policy: "MANUAL_REVIEW", reason: "HEAVEN_GIRL_REQUIRES_MANUAL_REVIEW" };
      if (mapping.metricHint === "DIARY_POSTS") return { pipeline: "HEAVEN_GIRL_DIARY", policy: "MANUAL_REVIEW", reason: "HEAVEN_GIRL_REQUIRES_MANUAL_REVIEW" };
      return { pipeline: "HEAVEN_GIRL_ACCESS", policy: "BLOCKED", reason: mapping.metricHint ? "UNSUPPORTED_HEAVEN_METRIC" : "HEAVEN_METRIC_REQUIRED" };
    default:
      if (unsupportedDataTypes.has(mapping.importDataType)) return { pipeline: "CTI", policy: "BLOCKED", reason: "MVP_OUT_OF_SCOPE" };
      return { pipeline: "CTI", policy: "BLOCKED", reason: "UNSUPPORTED_IMPORT_DATA_TYPE" };
  }
}

function resultForFailure(route: DispatchRoute, error: unknown): DispatcherResult {
  const candidate = error as { code?: string; retryable?: boolean; reviewRequired?: boolean; message?: string };
  if (candidate.reviewRequired) return baseResult(route, "REVIEW_REQUIRED", candidate.message || "Manual review is required.", { reviewReason: candidate.code || "PIPELINE_REVIEW_REQUIRED", errorCode: candidate.code || null });
  return baseResult(route, "FAILED", candidate.message || "Import pipeline failed.", { errorCode: candidate.code || (candidate.retryable ? "PIPELINE_RETRYABLE" : "PIPELINE_FAILED") });
}

export async function dispatchDriveImport(input: DispatcherInput, options: DispatcherOptions = {}): Promise<DispatcherResult> {
  const route = resolveDispatchRoute(input.mapping);
  if (route.policy === "BLOCKED") return baseResult(route, "BLOCKED", `Dispatch blocked: ${route.reason}.`, { errorCode: route.reason || "DISPATCH_BLOCKED" });

  const mode = options.mode ?? "RESOLVE_ONLY";
  if (mode === "RESOLVE_ONLY") {
    return baseResult(route, "REVIEW_REQUIRED", `Route resolved to ${route.pipeline}; Import was not executed.`, { reviewReason: "RESOLVE_ONLY" });
  }
  const transitionState = options.transitionState ?? ((stateId: string, to: DriveFileStatus) => transitionDriveFileState(stateId, to));
  if (route.policy === "MANUAL_REVIEW" && !options.executeManualReview) {
    if (input.stateId && transitionState && input.stateStatus === DriveFileStatus.READY) await transitionState(input.stateId, DriveFileStatus.REVIEW_REQUIRED);
    return baseResult(route, "REVIEW_REQUIRED", `Route resolved to ${route.pipeline}; manual review is required.`, { reviewReason: route.reason || "MANUAL_REVIEW_POLICY" });
  }
  if (!options.executePipeline) return baseResult(route, "REVIEW_REQUIRED", "AUTO route has no pipeline executor; manual review is required.", { reviewReason: "PIPELINE_EXECUTOR_NOT_CONFIGURED" });
  if (input.stateId && input.stateStatus && input.stateStatus !== DriveFileStatus.READY) return baseResult(route, "REVIEW_REQUIRED", "DriveFileState is not READY for dispatch.", { reviewReason: "DRIVE_FILE_STATE_NOT_READY" });

  try {
    if (input.stateId && !options.executorOwnsState) await transitionState(input.stateId, DriveFileStatus.IMPORTING);
    const execution = await options.executePipeline({ ...input, route });
    const hasIssues = (execution.warningCount ?? 0) > 0 || (execution.pendingCount ?? 0) > 0 || (execution.errorCount ?? 0) > 0;
    if (execution.reviewRequired || execution.status === "REVIEW_REQUIRED") return baseResult(route, "REVIEW_REQUIRED", "Preview completed; manual review is required.", { importBatchId: execution.importBatchId ?? null, reviewReason: "AUTO_PREVIEW_REVIEW_REQUIRED" });
    if (hasIssues) return baseResult(route, "REVIEW_REQUIRED", "Validation completed with warnings or unresolved rows.", { importBatchId: execution.importBatchId ?? null, reviewReason: "PIPELINE_VALIDATION_REVIEW" });
    if (input.stateId && !options.executorOwnsState) await transitionState(input.stateId, DriveFileStatus.IMPORTED);
    return baseResult(route, "IMPORTED", `Import pipeline ${route.pipeline} completed.`, { importBatchId: execution.importBatchId ?? null, autoConfirmed: true });
  } catch (error) {
    if (input.stateId) {
      const candidate = error as { retryable?: boolean; code?: string; message?: string };
      try {
        if (options.executorOwnsState) return resultForFailure(route, error);
        await transitionState(input.stateId, candidate.retryable ? DriveFileStatus.FAILED_RETRYABLE : DriveFileStatus.FAILED_FINAL);
      } catch {
        // Preserve the original pipeline failure; state recovery is handled by the next operator action.
      }
    }
    return resultForFailure(route, error);
  }
}
