import type { CtiBulkFile } from "@/lib/imports/cti/bulk-types";

export function sortCtiBulkFiles<T extends Pick<CtiBulkFile, "targetDate" | "filename">>(files: T[]): T[] {
  return [...files].sort((left, right) =>
    (left.targetDate || "9999-99-99").localeCompare(right.targetDate || "9999-99-99")
    || left.filename.localeCompare(right.filename, "ja"),
  );
}

export async function runCtiBulkSequentially<T, R>(items: T[], process: (item: T, index: number) => Promise<R>) {
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
