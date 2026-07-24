import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getTime, parseAnalyticsParams } from "@/lib/analytics/integration";

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const url = new URL(request.url);
    try { return Response.json(await getTime(parseAnalyticsParams(url.searchParams))); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "不正な分析条件です。", 400); }
  } catch (error) { return apiErrorResponse(error); }
}
