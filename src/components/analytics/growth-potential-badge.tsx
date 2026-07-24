import { growthPresentation } from "@/lib/analytics/ui";
import type { GrowthPotential } from "@/lib/analytics/ui";

export function GrowthPotentialBadge({ value }: { value: GrowthPotential }) { const item = growthPresentation[value]; return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${item.tone}`} title={item.description}>{item.label}</span>; }
