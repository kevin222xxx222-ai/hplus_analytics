import { formatDateOnly, parseDateOnly } from "@/lib/date";

export type EvaluationResolution = {
  date: Date | null;
  label: "前日" | "評価対象日";
  note: string | null;
};

export function tokyoToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return parseDateOnly(`${get("year")}-${get("month")}-${get("day")}`);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function daysInclusive(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000) + 1);
}

export function resolveEvaluationDate(input: { today: Date; selectedFrom: Date; selectedTo: Date; confirmedDates: Date[] }): EvaluationResolution {
  const yesterday = addUtcDays(tokyoToday(input.today), -1);
  const upperBound = input.selectedTo < yesterday ? input.selectedTo : yesterday;
  const latest = input.confirmedDates.filter((date) => date >= input.selectedFrom && date <= upperBound).sort((a, b) => a.getTime() - b.getTime()).at(-1) ?? null;
  if (!latest) return { date: null, label: "評価対象日", note: "選択期間内に利用可能な確定データがありません。" };
  if (formatDateOnly(latest) === formatDateOnly(yesterday)) return { date: latest, label: "前日", note: null };
  return { date: latest, label: "評価対象日", note: `昨日以前の最新確定データ（${formatDateOnly(latest)}）を表示しています。` };
}
