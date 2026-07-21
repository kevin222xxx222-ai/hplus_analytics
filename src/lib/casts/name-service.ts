import type { Prisma } from "@/generated/prisma/client";
import { formatDateOnly } from "@/lib/date";
import { normalizeCastName } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

type Period = { startedOn: Date; endedOn: Date | null };

export function castPeriodsOverlap(left: Period, right: Period) {
  return left.startedOn <= (right.endedOn || new Date(8640000000000000))
    && right.startedOn <= (left.endedOn || new Date(8640000000000000));
}

export async function renameCast(input: {
  castId: string;
  displayName: string;
  reason: string | null;
  changedByUserId: string;
  confirmDuplicate: boolean;
}) {
  const displayName = input.displayName.trim();
  const normalizedName = normalizeCastName(displayName);
  if (!normalizedName) throw new Error("表示名を入力してください。");

  return prisma.$transaction(async (tx) => {
    const cast = await tx.cast.findUnique({
      where: { id: input.castId },
      select: { id: true, displayName: true, normalizedName: true, startedOn: true, endedOn: true, mergedIntoCastId: true },
    });
    if (!cast) throw new Error("キャストが見つかりません。");
    if (cast.mergedIntoCastId) throw new Error("統合済みキャストの表示名は変更できません。");

    if (cast.displayName === displayName && cast.normalizedName === normalizedName) {
      return { status: "UPDATED" as const, displayName, normalizedName, changed: false, conflicts: [] };
    }

    const sameNameCasts = await tx.cast.findMany({
      where: { id: { not: cast.id }, normalizedName, mergedIntoCastId: null },
      select: { id: true, displayName: true, startedOn: true, endedOn: true, primaryStore: { select: { shortName: true } } },
      orderBy: [{ startedOn: "asc" }, { displayName: "asc" }],
    });
    const conflicts = sameNameCasts.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      primaryStoreName: candidate.primaryStore?.shortName || null,
      startedOn: formatDateOnly(candidate.startedOn),
      endedOn: candidate.endedOn ? formatDateOnly(candidate.endedOn) : null,
      overlaps: castPeriodsOverlap(cast, candidate),
    }));

    if (conflicts.length > 0 && !input.confirmDuplicate) {
      return { status: "CONFIRMATION_REQUIRED" as const, displayName: cast.displayName, normalizedName: cast.normalizedName, changed: false, conflicts };
    }

    await tx.cast.update({ where: { id: cast.id }, data: { displayName, normalizedName } });
    await tx.castNameHistory.create({ data: {
      castId: cast.id,
      oldName: cast.displayName,
      newName: displayName,
      changedByUserId: input.changedByUserId,
      reason: input.reason,
    } });

    return { status: "UPDATED" as const, displayName, normalizedName, changed: true, conflicts };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}
