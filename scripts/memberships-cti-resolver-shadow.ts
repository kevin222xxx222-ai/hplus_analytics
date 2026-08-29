import { ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { resolveCtiRowsWithHistoricalShadow, resolvePreviewRows } from "@/lib/imports/cti/resolver";
import type { CtiPreview } from "@/lib/imports/cti/types";
import { prisma } from "@/lib/prisma";

const successful = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];

async function main() {
  const batches = await prisma.importBatch.findMany({ where: { dataType: ImportDataType.CTI_CAST_REPORT, status: { in: successful } }, include: { importSource: { include: { store: true } } }, orderBy: [{ targetTo: "desc" }, { completedAt: "desc" }, { createdAt: "desc" }] });
  const byStore = new Map<string, (typeof batches)[number][]>();
  for (const batch of batches) if (batch.importSource.storeId) byStore.set(batch.importSource.storeId, [...(byStore.get(batch.importSource.storeId) ?? []), batch]);
  const reports = [];
  for (const storeBatches of byStore.values()) {
    const selected = storeBatches.filter((batch, index, all) => index === all.findIndex((item) => item.targetTo.getTime() === batch.targetTo.getTime())).slice(0, 3);
    for (const batch of selected) {
      const store = batch.importSource.store;
      if (!store) continue;
      const preview = await readPreview<CtiPreview>(batch.id);
      const rows = preview.sheets.flatMap((sheet) => sheet.rows).filter((row) => row.storeId === store.id);
      const legacyA = await resolvePreviewRows(rows, batch.targetTo);
      const legacyB = await resolvePreviewRows(rows, batch.targetTo);
      const runA = await resolveCtiRowsWithHistoricalShadow(rows, batch.targetTo, batch.targetTo);
      const byKeyA = new Map(legacyA.map((row) => [row.rowKey, row]));
      const byKeyB = new Map(legacyB.map((row) => [row.rowKey, row]));
      const nondeterministic = [...new Set([...byKeyA.keys(), ...byKeyB.keys()])].filter((key) => byKeyA.get(key)?.castId !== byKeyB.get(key)?.castId || byKeyA.get(key)?.resolutionStatus !== byKeyB.get(key)?.resolutionStatus);
      const shadowByKey = new Map(runA.rows.map((row) => [row.rowKey, row]));
      const shadowLegacyChanged = [...new Set([...byKeyA.keys(), ...shadowByKey.keys()])].filter((key) => byKeyA.get(key)?.castId !== shadowByKey.get(key)?.castId || byKeyA.get(key)?.resolutionStatus !== shadowByKey.get(key)?.resolutionStatus);
      const counts = runA.shadow.reduce<Record<string, number>>((out, row) => { out[row.differenceType] = (out[row.differenceType] ?? 0) + 1; return out; }, {});
      reports.push({ store: store.shortName, storeId: store.id, datasetDate: batch.targetTo.toISOString().slice(0, 10), importBatchId: batch.id, fileName: batch.originalFilename, evaluated: runA.shadow.length, legacyResolved: runA.shadow.length, membershipMember: runA.shadow.filter((row) => row.membershipHistoricalResult === "MEMBER").length, membershipNotMember: runA.shadow.filter((row) => row.membershipHistoricalResult === "NOT_MEMBER").length, membershipUnknown: runA.shadow.filter((row) => row.membershipHistoricalResult === "UNKNOWN").length, match: runA.shadow.filter((row) => row.differenceType === "MATCH_MEMBER" || row.differenceType === "MATCH_NOT_MEMBER").length, differenceRows: runA.shadow.filter((row) => row.differenceType !== "MATCH_MEMBER" && row.differenceType !== "MATCH_NOT_MEMBER").length, unknownRows: runA.shadow.filter((row) => row.differenceType === "MEMBERSHIP_UNKNOWN").length, differenceClassificationCounts: counts, exclusive: Object.values(counts).reduce((sum, count) => sum + count, 0) === runA.shadow.length, OTHER: 0, legacyRunAComparedToLegacyRunBChangedRows: nondeterministic.length, shadowLegacyRowsComparedToLegacyRunChangedRows: shadowLegacyChanged.length, legacyNondeterministicRowKeys: nondeterministic, differences: runA.shadow.filter((row) => row.differenceType !== "MATCH_MEMBER" && row.differenceType !== "MATCH_NOT_MEMBER").slice(0, 20) });
    }
  }
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "CTI_CAST_HISTORICAL", reports }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
