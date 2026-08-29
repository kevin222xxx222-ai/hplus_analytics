import { ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { resolveCtiRowsWithHistoricalShadow, resolvePreviewRows } from "@/lib/imports/cti/resolver";
import { selectRepresentativeDates } from "@/lib/imports/cti/shadow-datasets";
import type { CtiPreview, CtiPreviewRow } from "@/lib/imports/cti/types";
import { prisma } from "@/lib/prisma";

const successful = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];
const DEFAULT_STORE_NAMES = new Set(["春日部", "越谷"]);

type Batch = Awaited<ReturnType<typeof prisma.importBatch.findMany>>[number];
type Discovered = { batch: Batch; preview: CtiPreview; rows: CtiPreviewRow[]; storeId: string };

/** CTI batches contain multiple stores; discover stores from preview rows, never ImportSource.storeId. */
export async function discoverCtiDatasets(batches: Batch[], allowedStoreNames = DEFAULT_STORE_NAMES) {
  const discovered: Discovered[] = [];
  const skipped: Array<{ batchId: string; datasetDate: string; reason: string }> = [];
  let batchesReadSuccessfully = 0;
  for (const batch of batches) {
    try {
      const preview = await readPreview<CtiPreview>(batch.id);
      batchesReadSuccessfully += 1;
      // CtiPreviewRow currently has no businessDate. Only use targetTo as a
      // fallback after verifying this is a single-day CTI dataset.
      if (preview.targetFrom.slice(0, 10) !== preview.targetTo.slice(0, 10)) {
        skipped.push({ batchId: batch.id, datasetDate: batch.targetTo.toISOString().slice(0, 10), reason: "MULTI_DAY_PREVIEW_WITHOUT_ROW_DATE" });
        continue;
      }
      const grouped = new Map<string, CtiPreviewRow[]>();
      for (const row of preview.sheets.flatMap((sheet) => sheet.rows)) {
        if (!row.storeId) continue;
        grouped.set(row.storeId, [...(grouped.get(row.storeId) ?? []), row]);
      }
      for (const [storeId, rows] of grouped) discovered.push({ batch, preview, rows, storeId });
      if (!grouped.size) skipped.push({ batchId: batch.id, datasetDate: batch.targetTo.toISOString().slice(0, 10), reason: "NO_STORE_ROWS" });
    } catch (error) {
      skipped.push({ batchId: batch.id, datasetDate: batch.targetTo.toISOString().slice(0, 10), reason: `PREVIEW_READ_FAILED:${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const stores = await prisma.store.findMany({ where: { id: { in: [...new Set(discovered.map((item) => item.storeId))] } }, select: { id: true, shortName: true, name: true } });
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const groupedByStore = new Map<string, Discovered[]>();
  for (const item of discovered) {
    const store = storeById.get(item.storeId);
    if (!store || !allowedStoreNames.has(store.shortName) && !allowedStoreNames.has(store.name)) continue;
    groupedByStore.set(item.storeId, [...(groupedByStore.get(item.storeId) ?? []), item]);
  }
  const selected = new Map<string, Discovered[]>();
  for (const [storeId, items] of groupedByStore) {
    const byDate = new Map<string, Discovered>();
    for (const item of items.sort((a, b) => (b.batch.completedAt?.getTime() ?? 0) - (a.batch.completedAt?.getTime() ?? 0))) {
      const date = item.batch.targetTo.toISOString().slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, item);
    }
    const picks = selectRepresentativeDates([...byDate.keys()]).map((date) => byDate.get(date)!);
    selected.set(storeId, picks);
  }
  return { selected, stores, skipped, batchesReadSuccessfully, batchesReadFailed: batches.length - batchesReadSuccessfully, discoveredStoreIds: [...new Set(discovered.map((item) => item.storeId))] };
}

async function main() {
  const batches = await prisma.importBatch.findMany({ where: { dataType: ImportDataType.CTI_CAST_REPORT, status: { in: successful } }, orderBy: [{ targetTo: "desc" }, { completedAt: "desc" }, { createdAt: "desc" }] });
  const discovery = await discoverCtiDatasets(batches);
  const reports = [];
  for (const [storeId, datasets] of discovery.selected) {
    const store = discovery.stores.find((item) => item.id === storeId);
    for (const dataset of datasets) {
      const date = dataset.batch.targetTo;
      const legacyA = await resolvePreviewRows(dataset.rows, date);
      const legacyB = await resolvePreviewRows(dataset.rows, date);
      const run = await resolveCtiRowsWithHistoricalShadow(dataset.rows, date, date);
      const byKey = (rows: typeof legacyA) => new Map(rows.map((row) => [row.rowKey, row]));
      const a = byKey(legacyA); const b = byKey(legacyB); const shadow = byKey(run.rows);
      const changed = (left: typeof a, right: typeof b) => [...new Set([...left.keys(), ...right.keys()])].filter((key) => left.get(key)?.castId !== right.get(key)?.castId || left.get(key)?.resolutionStatus !== right.get(key)?.resolutionStatus);
      const nondeterministic = changed(a, b); const shadowChanged = changed(a, shadow);
      const counts = run.shadow.reduce<Record<string, number>>((out, row) => { out[row.differenceType] = (out[row.differenceType] ?? 0) + 1; return out; }, {});
      const differences = run.shadow.filter((row) => !row.differenceType.startsWith("MATCH_"));
      reports.push({ store: store?.shortName ?? storeId, storeId, datasetDate: date.toISOString().slice(0, 10), importBatchId: dataset.batch.id, fileName: dataset.batch.originalFilename, evaluated: run.shadow.length, legacyResolved: run.shadow.length, membershipMember: run.shadow.filter((row) => row.membershipHistoricalResult === "MEMBER").length, membershipNotMember: run.shadow.filter((row) => row.membershipHistoricalResult === "NOT_MEMBER").length, membershipUnknown: run.shadow.filter((row) => row.membershipHistoricalResult === "UNKNOWN").length, match: run.shadow.length - differences.length, differenceRows: differences.length, unknownRows: run.shadow.filter((row) => row.differenceType === "MEMBERSHIP_UNKNOWN").length, differenceClassificationCounts: counts, classificationCoverageComplete: Object.values(counts).reduce((sum, count) => sum + count, 0) === run.shadow.length, exclusive: true, OTHER: 0, legacyRunAComparedToLegacyRunBChangedRows: nondeterministic.length, shadowLegacyRowsComparedToLegacyRunChangedRows: shadowChanged.length, legacyNondeterministicRowKeys: nondeterministic, differences: differences.slice(0, 20) });
    }
  }
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "CTI_CAST_HISTORICAL", batchDiscovery: { successfulCtiBatches: batches.length, batchesReadSuccessfully: discovery.batchesReadSuccessfully, batchesReadFailed: discovery.batchesReadFailed, availableDatasetDates: [...new Set(reports.map((report) => report.datasetDate))].sort(), discoveredStoreIds: discovery.discoveredStoreIds, discoveredStores: discovery.stores.filter((store) => discovery.discoveredStoreIds.includes(store.id)).map((store) => store.shortName), selectedDatasetsByStore: [...discovery.selected].map(([id, values]) => ({ store: discovery.stores.find((item) => item.id === id)?.shortName ?? id, dates: values.map((value) => value.batch.targetTo.toISOString().slice(0, 10)) })), skippedBatches: discovery.skipped }, reports }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
