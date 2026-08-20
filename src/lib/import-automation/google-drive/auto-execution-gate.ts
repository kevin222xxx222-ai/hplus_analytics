import { ImportDataType } from "@/generated/prisma/client";
import { executeHeavenCastDriveFile } from "./heaven-cast-execute";
import { executeHeavenShopDriveFile } from "./heaven-shop-execute";
import type { DispatchRoute, DispatcherInput, PipelineExecutionResult, ResolvedDriveFolderMapping } from "./dispatcher";
import type { GoogleDriveClient } from "./types";

export type AutoPreviewDecision = { allowed: boolean; reason: string; route: DispatchRoute["pipeline"] | null };
export const AUTO_EXECUTION_ROUTES = ["HEAVEN_SHOP", "HEAVEN_GIRL_ACCESS", "HEAVEN_GIRL_DIARY"] as const;
export type AutoExecutionRoute = (typeof AUTO_EXECUTION_ROUTES)[number];

export function parseAutoExecutionRoutes(raw = process.env.GOOGLE_DRIVE_AUTO_EXECUTION_ROUTES): { routes: ReadonlySet<AutoExecutionRoute>; unknown: string[] } {
  const unknown: string[] = [];
  const routes = new Set<AutoExecutionRoute>();
  for (const token of (raw || "").split(",").map((value) => value.trim()).filter(Boolean)) {
    if ((AUTO_EXECUTION_ROUTES as readonly string[]).includes(token)) routes.add(token as AutoExecutionRoute);
    else unknown.push(token);
  }
  return { routes, unknown };
}

/** I8 starts with source-period-safe Heaven mappings; CTI/Town still require explicit target-date input. */
export function resolveAutoPreviewDecision(mapping: Pick<ResolvedDriveFolderMapping, "importDataType" | "metricHint" | "isActive" | "isFuture">, enabled: boolean, allowedRoutes: ReadonlySet<AutoExecutionRoute> = parseAutoExecutionRoutes().routes): AutoPreviewDecision {
  if (!enabled) return { allowed: false, reason: "AUTO_EXECUTION_DISABLED", route: null };
  if (!mapping.isActive || mapping.isFuture) return { allowed: false, reason: "INACTIVE_OR_FUTURE_MAPPING", route: null };
  let route: AutoExecutionRoute | null = null;
  if (mapping.importDataType === ImportDataType.HEAVEN_STORE) route = "HEAVEN_SHOP";
  if (mapping.importDataType === ImportDataType.HEAVEN_CAST && mapping.metricHint === "PAGE_ACCESS") route = "HEAVEN_GIRL_ACCESS";
  if (mapping.importDataType === ImportDataType.HEAVEN_CAST && mapping.metricHint === "DIARY_POSTS") route = "HEAVEN_GIRL_DIARY";
  if (route) return allowedRoutes.has(route) ? { allowed: true, reason: "ROUTE_ALLOWLISTED", route } : { allowed: false, reason: "AUTO_ROUTE_NOT_ENABLED", route };
  if (mapping.importDataType === ImportDataType.CTI_CAST_REPORT || mapping.importDataType === ImportDataType.TOWN_STORE || mapping.importDataType === ImportDataType.TOWN_CAST) return { allowed: false, reason: "TARGET_DATE_REQUIRES_OPERATOR_INPUT", route: null };
  return { allowed: false, reason: "AUTO_PREVIEW_NOT_ALLOWLISTED", route: null };
}

export function createAutoExecutionRegistry(client: GoogleDriveClient) {
  return async (input: DispatcherInput & { route: DispatchRoute }): Promise<PipelineExecutionResult> => {
    let result: { outcome: string; batchId?: string; batchStatus?: string; reason?: string };
    if (input.route.pipeline === "HEAVEN_SHOP") result = await executeHeavenShopDriveFile({ driveFileId: input.file.driveFileId, autoPreview: true, client });
    else if (input.route.pipeline === "HEAVEN_GIRL_ACCESS" || input.route.pipeline === "HEAVEN_GIRL_DIARY") result = await executeHeavenCastDriveFile({ driveFileId: input.file.driveFileId, autoPreview: true, client });
    else throw new Error(`AUTO preview adapter is not available for ${input.route.pipeline}.`);
    if (result.outcome === "REUSED" && (result.reason === "DUPLICATE_COMPLETED_FILE" || (result.reason === "SAME_CONTENT" && (result.batchStatus === "COMPLETED" || result.batchStatus === "COMPLETED_WITH_WARNINGS")))) return { status: "NOOP", importBatchId: result.batchId, executionClass: "REUSED_NOOP" as const };
    if (result.outcome === "REUSED") return { status: "REVIEW_REQUIRED", importBatchId: result.batchId, reviewRequired: true, executionClass: "REUSED_REVIEW" as const };
    return { status: result.outcome === "EXECUTED" ? "REVIEW_REQUIRED" : result.outcome, importBatchId: result.batchId, reviewRequired: true, executionClass: "PREVIEW_CREATED" as const };
  };
}
