export function selectRepresentativeDates(dates: string[]) {
  const sorted = [...new Set(dates)].sort();
  return [...new Set([sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted.at(-1)])].filter((date): date is string => Boolean(date));
}
