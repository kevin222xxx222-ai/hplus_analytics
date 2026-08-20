import { ImportDataType } from "@/generated/prisma/client";
import { executeHeavenCastDriveFile } from "./heaven-cast-execute";
import { executeHeavenShopDriveFile } from "./heaven-shop-execute";
import type { DispatchRoute, DispatcherInput, PipelineExecutionResult, ResolvedDriveFolderMapping } from "./dispatcher";
import type { GoogleDriveClient } from "./types";

export type AutoPreviewDecision = { allowed: boolean; reason: string; route: DispatchRoute["pipeline"] | null };

/** I8 starts with source-period-safe Heaven mappings; CTI/Town still require explicit target-date input. */
export function resolveAutoPreviewDecision(mapping: Pick<ResolvedDriveFolderMapping, "importDataType" | "metricHint" | "isActive" | "isFuture">, enabled: boolean): AutoPreviewDecision {
  if (!enabled) return { allowed: false, reason: "AUTO_EXECUTION_DISABLED", route: null };
  if (!mapping.isActive || mapping.isFuture) return { allowed: false, reason: "INACTIVE_OR_FUTURE_MAPPING", route: null };
  if (mapping.importDataType === ImportDataType.HEAVEN_STORE) return { allowed: true, reason: "HEAVEN_SHOP_SOURCE_PERIOD", route: "HEAVEN_SHOP" };
  if (mapping.importDataType === ImportDataType.HEAVEN_CAST && (mapping.metricHint === "PAGE_ACCESS" || mapping.metricHint === "DIARY_POSTS")) return { allowed: true, reason: "HEAVEN_CAST_SOURCE_PERIOD", route: mapping.metricHint === "PAGE_ACCESS" ? "HEAVEN_GIRL_ACCESS" : "HEAVEN_GIRL_DIARY" };
  if (mapping.importDataType === ImportDataType.CTI_CAST_REPORT || mapping.importDataType === ImportDataType.TOWN_STORE || mapping.importDataType === ImportDataType.TOWN_CAST) return { allowed: false, reason: "TARGET_DATE_REQUIRES_OPERATOR_INPUT", route: null };
  return { allowed: false, reason: "AUTO_PREVIEW_NOT_ALLOWLISTED", route: null };
}

export function createAutoExecutionRegistry(client: GoogleDriveClient) {
  return async (input: DispatcherInput & { route: DispatchRoute }): Promise<PipelineExecutionResult> => {
    let result: { outcome: string; batchId?: string; batchStatus?: string };
    if (input.route.pipeline === "HEAVEN_SHOP") result = await executeHeavenShopDriveFile({ driveFileId: input.file.driveFileId, client });
    else if (input.route.pipeline === "HEAVEN_GIRL_ACCESS" || input.route.pipeline === "HEAVEN_GIRL_DIARY") result = await executeHeavenCastDriveFile({ driveFileId: input.file.driveFileId, client });
    else throw new Error(`AUTO preview adapter is not available for ${input.route.pipeline}.`);
    return { status: result.outcome === "EXECUTED" || result.outcome === "REUSED" ? "REVIEW_REQUIRED" : result.outcome, importBatchId: result.batchId, reviewRequired: true };
  };
}
