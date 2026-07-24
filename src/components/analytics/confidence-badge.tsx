import { confidencePresentation } from "@/lib/analytics/ui";
import type { UiConfidence } from "@/lib/analytics/ui";

export function ConfidenceBadge({ value }: { value: UiConfidence }) {
  const item = confidencePresentation[value];
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${item.tone}`} title={item.description} aria-label={`${item.label}: ${item.description}`}>{item.label}</span>;
}
