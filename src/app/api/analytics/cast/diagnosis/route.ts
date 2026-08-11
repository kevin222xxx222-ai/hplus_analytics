import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getCastDiagnosis } from "@/lib/analytics/cast-diagnosis/service";
import { buildCastActionPlan, toPublicCastActionPlan } from "@/lib/analytics/cast-action";

const date = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams; const from = params.get("from"); const to = params.get("to");
    if (!from || !to || !date.test(from) || !date.test(to) || from > to) throw new ApiError("from と to は正しい期間で指定してください。", 400);
    const result = await getCastDiagnosis({ from, to });
    if (params.get("summaryOnly") === "true") return Response.json({ period: result.period, thresholds: result.thresholds, comparisonGroup: result.comparisonGroup, summary: result.summary, dataNotes: result.dataNotes });
    const casts = result.casts.map((cast) => { try { return { ...cast, actionPlan: toPublicCastActionPlan(buildCastActionPlan({ cast, period: result.period })) }; } catch { return { ...cast, actionPlan: null }; } });
    if (params.get("castId")) return Response.json({ ...result, casts: casts.filter((cast) => cast.fact.castId === params.get("castId")) });
    return Response.json({ ...result, casts });
  } catch (error) { return apiErrorResponse(error); }
}
