import type { TownBulkFile } from "@/lib/imports/town/bulk-types";
import type { TownImportDataType } from "@/lib/imports/town/types";

export const TOWN_BULK_TYPE_ORDER: Record<TownImportDataType, number> = {
  TOWN_STORE: 0,
  TOWN_CAST: 1,
  TOWN_URL: 2,
  TOWN_LANDING: 3,
};

export function sortTownBulkFiles<T extends Pick<TownBulkFile, "targetFrom" | "dataType" | "folderKey" | "filename">>(files: T[]): T[] {
  return [...files].sort((left, right) =>
    (left.targetFrom || "9999-99-99").localeCompare(right.targetFrom || "9999-99-99")
    || (left.dataType ? TOWN_BULK_TYPE_ORDER[left.dataType] : 99) - (right.dataType ? TOWN_BULK_TYPE_ORDER[right.dataType] : 99)
    || left.folderKey.localeCompare(right.folderKey)
    || left.filename.localeCompare(right.filename),
  );
}

export function selectTownBulkReparseCandidates(files: TownBulkFile[]) {
  return files.filter((file) => file.batchId && file.state !== "SKIPPED_DUPLICATE"
    && ["FAILED", "PREVIEW_READY", "WAITING_FOR_CAST_LINK", "COMPLETED_WITH_WARNINGS"].includes(file.processStatus));
}

export async function runTownBulkSequentially<T, R>(items: T[], process: (item: T, index: number) => Promise<R>) {
  const results: Array<{ item: T; result?: R; error?: string }> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      results.push({ item, result: await process(item, index) });
    } catch (error) {
      results.push({ item, error: error instanceof Error ? error.message : "処理に失敗しました。" });
    }
  }
  return results;
}
