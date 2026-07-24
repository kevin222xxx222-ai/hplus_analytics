import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getPerformance, parseAnalyticsParams } from "@/lib/analytics/integration";

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const url = new URL(request.url);
    const castId = url.searchParams.get("castId");
    if (!castId) throw new ApiError("castIdは必須です。", 400);
    const result = await getPerformance(parseAnalyticsParams(url.searchParams));
    const cast = result.casts.find((item) => item.cast?.id === castId);
    if (!cast) throw new ApiError("指定キャストの分析データがありません。", 404);
    return Response.json({ period: result.period, stores: result.stores, cast });
  } catch (error) { return apiErrorResponse(error); }
}
