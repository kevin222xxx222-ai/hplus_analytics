import { ImportBatchStatus, UserRole } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { processTownBulkFile, scanTownBulkFolders } from "@/lib/imports/town/bulk-service";
import { reparseTownBatch } from "@/lib/imports/town/reparse-service";
import type { TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

async function factCounts() {
  const [store, cast, url, landing] = await Promise.all([
    prisma.townStoreDaily.count(), prisma.townCastDaily.count(), prisma.townUrlDaily.count(), prisma.townLandingDaily.count(),
  ]);
  return { store, cast, url, landing };
}

async function main() {
  const beforeFacts = await factCounts();
  const before = await scanTownBulkFolders();
  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN, isActive: true }, select: { id: true } });
  if (!admin) throw new Error("有効なADMINが見つかりません。");
  const results: Array<{ key: string; outcome: string; error?: string }> = [];
  const reparseableStatuses = new Set<string>([ImportBatchStatus.FAILED, ImportBatchStatus.PREVIEW_READY, ImportBatchStatus.WAITING_FOR_CAST_LINK]);

  for (const file of before.files) {
    if (file.state === "SKIPPED_DUPLICATE" || file.state === "UNSUPPORTED" || file.state === "INVALID") continue;
    try {
      if (file.batchId && reparseableStatuses.has(file.processStatus)) {
        const result = await reparseTownBatch(file.batchId);
        results.push({ key: file.key, outcome: result.status });
      } else if (!file.batchId && file.canProcess) {
        const result = await processTownBulkFile({ key: file.key, uploadedByUserId: admin.id, action: "VALIDATE" });
        results.push({ key: file.key, outcome: result.outcome });
      }
    } catch (error) {
      results.push({ key: file.key, outcome: "FAILED", error: error instanceof Error ? error.message : "処理に失敗しました。" });
    }
    if (results.length > 0 && results.length % 25 === 0) console.error(`Town preview reparse: ${results.length} files processed`);
  }

  const after = await scanTownBulkFolders();
  const candidates = after.files.filter((file) => file.dataType && file.state !== "SKIPPED_DUPLICATE" && file.state !== "UNSUPPORTED" && file.state !== "INVALID" && file.batchId);
  const normalizedNames = new Set<string>();
  const storeNames = new Set<string>();
  let unmatchedRows = 0;
  let ambiguousRows = 0;
  for (const file of candidates) {
    const preview = await readPreview<TownPreview>(file.batchId!);
    for (const row of preview.rows) {
      if (row.kind === "STORE" || (row.resolutionStatus !== "UNMATCHED" && row.resolutionStatus !== "AMBIGUOUS")) continue;
      const normalizedName = row.kind === "CAST" ? row.normalizedCastName : row.normalizedCastName;
      if (row.resolutionStatus === "UNMATCHED") unmatchedRows += 1;
      else ambiguousRows += 1;
      if (normalizedName) {
        normalizedNames.add(normalizedName);
        storeNames.add(`${preview.storeId}:${normalizedName}`);
      }
    }
  }
  const afterFacts = await factCounts();
  const failed = results.filter((result) => result.outcome === "FAILED");
  console.log(JSON.stringify({
    processed: results.length,
    failed,
    autoConfirmableFiles: candidates.filter((file) => file.processStatus === ImportBatchStatus.PREVIEW_READY && file.autoConfirmSafe).length,
    waitingForCastLinkFiles: candidates.filter((file) => file.processStatus === ImportBatchStatus.WAITING_FOR_CAST_LINK).length,
    unmatchedRows,
    ambiguousRows,
    unmatchedNormalizedNames: normalizedNames.size,
    unmatchedStoreNormalizedNames: storeNames.size,
    errorCount: candidates.reduce((sum, file) => sum + file.errorCount, 0),
    completedShaDuplicates: after.files.filter((file) => file.state === "SKIPPED_DUPLICATE").length,
    correctionCandidates: candidates.filter((file) => file.correctionBatchIds.length > 0).length,
    unsupportedFiles: after.files.filter((file) => file.state === "UNSUPPORTED").length,
    beforeFacts,
    afterFacts,
    factsUnchanged: JSON.stringify(beforeFacts) === JSON.stringify(afterFacts),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
