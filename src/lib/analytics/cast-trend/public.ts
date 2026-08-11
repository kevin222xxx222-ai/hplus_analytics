import type { CastTrendResult } from "./types";

const finite = (value: unknown): unknown => { if (typeof value === "number") return Number.isFinite(value) ? value : null; if (Array.isArray(value)) return value.map(finite); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, finite(child)])); return value; };
export const toPublicCastTrend = (result: CastTrendResult): CastTrendResult => finite(result) as CastTrendResult;
