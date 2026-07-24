import { randomUUID } from "node:crypto";
import { ImportDataType, MediaType, StoreCode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

async function retry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1))); }
  }
  throw lastError;
}

export default async function globalSetup() {
  const createdStoreIds: string[] = [];
  const createdSourceIds: string[] = [];
  const createdUserIds: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const storeValues = [
    [StoreCode.KASUKABE, "春日部", "春日部", true],
    [StoreCode.KOSHIGAYA, "越谷", "越谷", true],
    [StoreCode.NODA, "野田", "野田", true],
    [StoreCode.KUKI, "久喜", "久喜", false],
  ] as const;
  await retry(() => prisma.$queryRaw`SELECT 1`);
  const stores = new Map<StoreCode, string>();
  for (const [code, name, shortName, management] of storeValues) {
    const existing = await prisma.store.findUnique({ where: { code }, select: { id: true } });
    if (existing) stores.set(code, existing.id);
    else {
      const created = await prisma.store.create({ data: { code, name, shortName, isActive: true, hasManagementMetrics: management, hasAcquisitionMetrics: management } });
      stores.set(code, created.id); createdStoreIds.push(created.id);
    }
  }
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!existingAdmin) {
    const user = await prisma.user.create({ data: { loginId: `analytics-test-admin-${suffix}`, displayName: "Analytics Test Admin", passwordHash: "test-only-hash", role: "ADMIN", isActive: true } });
    createdUserIds.push(user.id);
  }
  const primaryStoreId = stores.get(StoreCode.KASUKABE)!;
  for (const dataType of [ImportDataType.CTI_CAST_REPORT, ImportDataType.TOWN_CAST]) {
    const existing = await prisma.importSource.findFirst({ where: { dataType, storeId: primaryStoreId }, select: { id: true } });
    if (!existing) {
      const source = await prisma.importSource.create({ data: { name: `analytics-test-${dataType}-${suffix}`, mediaType: dataType === ImportDataType.CTI_CAST_REPORT ? MediaType.CTI : MediaType.TOWN, dataType, storeId: primaryStoreId } });
      createdSourceIds.push(source.id);
    }
  }
  return async () => {
    try {
      const batches = await prisma.importBatch.findMany({ where: { importSourceId: { in: createdSourceIds } }, select: { id: true } });
      const batchIds = batches.map((batch) => batch.id);
      if (batchIds.length) {
        await prisma.importError.deleteMany({ where: { importBatchId: { in: batchIds } } });
        await prisma.ctiCastDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
        await prisma.townCastDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
        await prisma.townUrlDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
        await prisma.townLandingDaily.deleteMany({ where: { importBatchId: { in: batchIds } } });
        await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
      }
      if (createdSourceIds.length) await prisma.importSource.deleteMany({ where: { id: { in: createdSourceIds } } });
      if (createdStoreIds.length) await prisma.store.deleteMany({ where: { id: { in: createdStoreIds } } });
      if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } finally { await prisma.$disconnect(); }
  };
}
