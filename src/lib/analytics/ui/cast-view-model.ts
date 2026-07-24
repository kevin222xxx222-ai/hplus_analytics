import type { PerformanceResponseDto } from "./performance-view-model";

export type CastResponseDto = { period: PerformanceResponseDto["period"]; stores: PerformanceResponseDto["stores"]; cast: PerformanceResponseDto["casts"][number] };
export const castMetricLabels: Record<string, string> = { sales: "売上", castReward: "女子報酬", attendancePeople: "出勤", reservations: "予約", services: "接客", regularNominations: "本指名", diaryPosts: "写メ", salesPerHour: "売上／時間", rewardPerHour: "女子報酬／時間", townPv: "Town PV", townUu: "Town UU", heavenAccess: "Heavenアクセス" };
export const castMetricFormats: Record<string, "currency" | "count" | "hours" | "pv" | "uu" | "hourly"> = { sales: "currency", castReward: "currency", attendancePeople: "count", reservations: "count", services: "count", regularNominations: "count", diaryPosts: "count", salesPerHour: "hourly", rewardPerHour: "hourly", townPv: "pv", townUu: "uu", heavenAccess: "pv" };
export const castMetricKeys = ["sales", "castReward", "attendancePeople", "reservations", "services", "regularNominations", "diaryPosts", "salesPerHour", "rewardPerHour", "townPv", "townUu", "heavenAccess"];
export function castDisplayName(response: CastResponseDto) { return response.cast.cast?.displayName ?? "—"; }
