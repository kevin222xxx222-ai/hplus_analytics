import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { CastTrendInputError, getCastTrend, toPublicCastTrend } from "@/lib/analytics/cast-trend";

export async function GET(request: Request, { params }: { params: Promise<{ castId: string }> }) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const { castId } = await params; const query = new URL(request.url).searchParams; const from = query.get("from"); const to = query.get("to");
    if (!castId || !from || !to) throw new ApiError("castId と期間を正しく指定してください。", 400);
    const result = await getCastTrend({ castId, from, to, includeDiagnosis: query.get("includeDiagnosis") === "true", includeAction: query.get("includeAction") === "true" });
    if (!result) throw new ApiError("キャストが見つかりません。", 404);
    return Response.json(toPublicCastTrend(result));
  } catch (error) {
    if (error instanceof CastTrendInputError) return Response.json({ error: error.message }, { status: 400 });
    return apiErrorResponse(error);
  }
}
