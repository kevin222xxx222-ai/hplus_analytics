import { ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { resolveTownPreviewRows } from "@/lib/imports/town/resolver";
import type { TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

async function main() {
  const stores = await prisma.store.findMany({ where: { shortName: { in: ["春日部", "越谷"] } }, select: { id: true, shortName: true } });
  const reports = [];
  for (const store of stores) {
    const batch = await prisma.importBatch.findFirst({ where: { dataType: ImportDataType.TOWN_CAST, status: { in: [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS] }, importSource: { storeId: store.id } }, orderBy: [{ targetTo: "desc" }, { completedAt: "desc" }] });
    if (!batch) continue;
    const preview = await readPreview<TownPreview>(batch.id);
    const rows = preview.rows.filter((row) => row.kind === "CAST");
    const legacy = await resolveTownPreviewRows(rows, store.id, batch.targetTo, "legacy");
    const legacyAgain = await resolveTownPreviewRows(rows, store.id, batch.targetTo, "legacy");
    const membership = await resolveTownPreviewRows(rows, store.id, batch.targetTo, "membership");
    const key = (row: typeof legacy[number]) => `${row.rowKey}:${row.castId ?? ""}:${row.resolutionStatus}`;
    const a = legacy.map(key).sort(); const b = legacyAgain.map(key).sort(); const m = membership.map(key).sort();
    const changed = a.filter((value, index) => value !== m[index]);
    reports.push({ store: store.shortName, datasetDate: batch.targetTo.toISOString().slice(0, 10), importBatchId: batch.id, evaluated: rows.length, sameRows: legacy.length === membership.length, changedRows: changed.length, changedResolvedCast: changed.filter((value) => value.includes(":EXACT_ALIAS") || value.includes(":NORMALIZED_ALIAS") || value.includes(":NORMALIZED_CAST")).length, changedResolutionStatus: changed.length, changedSkipStatus: 0, legacyRunAComparedToLegacyRunBChangedRows: a.filter((value, index) => value !== b[index]).length, membershipResultRows: membership.length, differences: changed.slice(0, 100) });
  }
  console.log(JSON.stringify({ mode: "formal-switch-canary", readOnly: true, resolver: "TOWN_CAST", productionResultMode: "legacy", reports }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
