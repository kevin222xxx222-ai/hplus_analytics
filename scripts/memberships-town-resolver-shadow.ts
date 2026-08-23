import { ImportBatchStatus, ImportDataType } from "@/generated/prisma/client";
import { readPreview } from "@/lib/imports/storage";
import { resolveTownPreviewRowsWithShadow } from "@/lib/imports/town/resolver";
import type { TownPreview } from "@/lib/imports/town/types";
import { prisma } from "@/lib/prisma";

const successful = [ImportBatchStatus.COMPLETED, ImportBatchStatus.COMPLETED_WITH_WARNINGS];

async function main() {
  const batches = await prisma.importBatch.findMany({
    where: { dataType: ImportDataType.TOWN_CAST, status: { in: successful } },
    include: { importSource: { include: { store: true } } },
    orderBy: [{ targetTo: "desc" }, { completedAt: "desc" }, { createdAt: "desc" }],
  });
  const latestByStore = new Map<string, (typeof batches)[number]>();
  for (const batch of batches) {
    const storeId = batch.importSource.storeId;
    if (storeId && !latestByStore.has(storeId)) latestByStore.set(storeId, batch);
  }
  const stores = [...latestByStore.values()].map((batch) => batch.importSource.store).filter((store): store is NonNullable<typeof store> => Boolean(store));
  const reports = [];
  for (const batch of latestByStore.values()) {
    if (!batch.importSource.store) continue;
    const preview = await readPreview<TownPreview>(batch.id);
    const result = await resolveTownPreviewRowsWithShadow(preview.rows, batch.importSource.store.id, batch.targetTo, "shadow");
    const exampleCastIds = [...new Set((result.shadow?.examples ?? []).map((example) => example.castId))];
    const exampleCasts = await prisma.cast.findMany({ where: { id: { in: exampleCastIds } }, select: { id: true, displayName: true, status: true, memberships: { where: { storeId: batch.importSource.store.id }, select: { status: true } } } });
    const exampleById = new Map(exampleCasts.map((cast) => [cast.id, cast]));
    const changedRows = preview.rows.reduce((count, row, index) => {
      const resolved = result.rows[index];
      return count + (row.castId !== resolved?.castId || row.resolutionStatus !== resolved?.resolutionStatus ? 1 : 0);
    }, 0);
    const shadow = result.shadow;
    reports.push({
      store: batch.importSource.store.shortName,
      storeId: batch.importSource.store.id,
      datasetDate: batch.targetTo.toISOString().slice(0, 10),
      importBatchId: batch.id,
      fileName: batch.originalFilename,
      importBatchStatus: batch.status,
      evaluated: shadow?.evaluated ?? 0,
      match: shadow?.differenceCounts.MATCH ?? 0,
      legacyTrueMembershipFalse: shadow?.differenceCounts.LEGACY_TRUE_MEMBERSHIP_FALSE ?? 0,
      legacyFalseMembershipTrue: shadow?.differenceCounts.LEGACY_FALSE_MEMBERSHIP_TRUE ?? 0,
      differenceRate: shadow?.evaluated ? (shadow.differences / shadow.evaluated) : 0,
      examples: (shadow?.examples ?? []).map((example) => {
        const cast = exampleById.get(example.castId);
        return { ...example, displayName: cast?.displayName ?? null, store: batch.importSource.store?.shortName ?? null, legacyStatus: cast?.status ?? null, membershipStatuses: cast?.memberships.map((membership) => membership.status) ?? [] };
      }),
      legacyPreviewValidation: { rows: preview.rows.length, reResolvedRows: result.rows.length, changedRows, unchanged: changedRows === 0 },
    });
  }
  console.log(JSON.stringify({ mode: "shadow", readOnly: true, resolver: "TOWN_CAST", stores: stores.map((store) => store.shortName), reports }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
