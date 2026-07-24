import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getPerformance, getTime, parseAnalyticsParams } from "@/lib/analytics/integration";

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams;
    const input = parseAnalyticsParams(params);
    const [performance, time] = await Promise.all([getPerformance(input), getTime(input)]);
    return Response.json({ period: performance.period, stores: performance.stores, overall: performance.overall, storeSummaries: performance.storeSummaries, weekdays: time.weekdays });
  } catch (error) { return apiErrorResponse(error); }
}
