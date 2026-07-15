import { EXCLUDED_CAST_NAMES } from "@/lib/imports/cti/constants";
import { exclusionComparisonName, normalizeHeader } from "@/lib/imports/cti/values";

export function getExclusionReason(name: string): string | null {
  const comparable = exclusionComparisonName(name);
  if (!comparable) return "EMPTY_ROW";
  if (EXCLUDED_CAST_NAMES.has(comparable)) return "ANNOUNCEMENT_ROW";
  if (/^(合計|総合計|小計|計|すべて|全て)$/.test(comparable)) return "TOTAL_ROW";
  if (["女子名", "キャスト名", "名前"].includes(normalizeHeader(name))) return "REPEATED_HEADER";
  return null;
}
