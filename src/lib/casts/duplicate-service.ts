import { MediaType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

function withoutKukiPrefix(name: string) { return name.startsWith("久") ? name.slice(1) : name; }
function overlaps(left: { startedOn: Date; endedOn: Date | null }, right: { startedOn: Date; endedOn: Date | null }) {
  const farFuture = new Date(8640000000000000);
  return left.startedOn <= (right.endedOn || farFuture) && right.startedOn <= (left.endedOn || farFuture);
}

export async function findDuplicateCastCandidates() {
  const casts = await prisma.cast.findMany({
    where: { mergedIntoCastId: null },
    include: {
      primaryStore: true,
      aliases: { where: { mediaType: { in: [MediaType.TOWN, MediaType.HEAVEN] } }, include: { store: true } },
      _count: { select: { ctiCastDailies: true, townCastDailies: true, townUrlDailies: true, townLandingDailies: true } },
    },
    orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
  });
  const result = [];
  for (let leftIndex = 0; leftIndex < casts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < casts.length; rightIndex += 1) {
      const left = casts[leftIndex]; const right = casts[rightIndex];
      const reasons: string[] = [];
      if (left.normalizedName === right.normalizedName) reasons.push("同じ正規化名");
      if (withoutKukiPrefix(left.normalizedName) === withoutKukiPrefix(right.normalizedName) && left.normalizedName !== right.normalizedName) reasons.push("接頭辞「久」あり／なし");
      const rightAliases = new Set(right.aliases.map((alias) => `${alias.mediaType}:${alias.storeId || "NULL"}:${alias.normalizedAlias}`));
      const sharedAliases = left.aliases.filter((alias) => rightAliases.has(`${alias.mediaType}:${alias.storeId || "NULL"}:${alias.normalizedAlias}`));
      for (const alias of sharedAliases) reasons.push(`同じ${alias.mediaType} Alias（${alias.store?.shortName || "店舗共通"}: ${alias.aliasName}）`);
      if (reasons.length === 0) continue;
      result.push({
        left, right, reasons,
        periodsOverlap: overlaps(left, right),
        differentPrimaryStore: left.primaryStoreId !== right.primaryStoreId,
      });
    }
  }
  return result;
}
