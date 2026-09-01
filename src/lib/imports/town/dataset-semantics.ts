export type TownDatasetSemantics = "current" | "historical";

export function determineTownDatasetSemantics(input: { origin?: unknown; targetFrom: string; targetTo: string; executionMode?: unknown; reprocess?: unknown; datasetSemantics?: unknown }): TownDatasetSemantics {
  if (input.datasetSemantics === "current" && input.origin === "GOOGLE_DRIVE" && input.executionMode === "EXECUTE" && input.reprocess !== true && input.targetFrom === input.targetTo) return "current";
  return "historical";
}
