import { availabilityPresentation } from "@/lib/analytics/ui";
import type { UiAvailability } from "@/lib/analytics/ui";

export function AvailabilityBadge({ value, hideValue = false }: { value: UiAvailability; hideValue?: boolean }) {
  const item = availabilityPresentation[value];
  if (hideValue && value === "VALUE") return null;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${item.tone}`} title={item.description} aria-label={`${item.label}: ${item.description}`}><span aria-hidden="true">{item.icon}</span>{item.label}</span>;
}
