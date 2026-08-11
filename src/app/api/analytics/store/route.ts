import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getAllStoreAnalytics } from "@/lib/analytics/integration/store-analytics-all";

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams;
    const from = params.get("from"); const to = params.get("to");
    if (!from || !to) throw new ApiError("from と to は必須です。", 400);
    // `store` remains accepted in old bookmarked URLs, but is intentionally ignored.
    return Response.json(await getAllStoreAnalytics({ from, to }));
  } catch (error) { return apiErrorResponse(error); }
}
