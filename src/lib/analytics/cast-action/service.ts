import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";
import { buildCastActionPlan } from "./engine";
import type { CastActionPlan } from "./types";

export function getCastActionPlan(cast: CastEngineCast, period: { from: string; to: string }): CastActionPlan {
  return buildCastActionPlan({ cast, period });
}
