import type { DailyBriefAction } from "./daily-brief";

export function prioritizeDailyBriefActions(actions: DailyBriefAction[], limit = 3): DailyBriefAction[] {
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return [...actions].sort((a, b) => (a.category === "DATA_HEALTH" ? -1 : b.category === "DATA_HEALTH" ? 1 : rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id))).slice(0, Math.max(0, limit));
}
