import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const batches = await prisma.importBatch.findMany({
    where: { originalFilename: "cti-phase2-anonymous.xlsx" },
    select: { id: true },
  });
  const casts = await prisma.cast.findMany({
    where: { displayName: { startsWith: "画面確認" } },
    select: { id: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  const castIds = casts.map((cast) => cast.id);
  await prisma.$transaction([
    prisma.ctiCastDaily.deleteMany({ where: { OR: [{ importBatchId: { in: batchIds } }, { castId: { in: castIds } }] } }),
    prisma.importError.deleteMany({ where: { importBatchId: { in: batchIds } } }),
    prisma.castAlias.deleteMany({ where: { castId: { in: castIds } } }),
    prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } }),
    prisma.cast.deleteMany({ where: { id: { in: castIds } } }),
  ]);
  console.log(JSON.stringify({ batchIds, deletedCasts: castIds.length }));
}

main().finally(() => prisma.$disconnect());
