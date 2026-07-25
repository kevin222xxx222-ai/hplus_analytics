import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDiaryAnalytics, type DiaryRequest } from "@/lib/analytics/diary";
import type { StoreCode } from "@/generated/prisma/client";

const stores = new Set<StoreCode>(["KASUKABE", "KOSHIGAYA", "NODA"]);
export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams;
    const from = params.get("from"); const to = params.get("to");
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) throw new ApiError("from と to は正しい期間で指定してください。", 400);
    const store = params.get("store");
    if (store && store !== "ALL" && !stores.has(store as StoreCode)) throw new ApiError("分析対象外の店舗です。", 400);
    const groupBy = params.get("groupBy");
    if (groupBy && !["day", "weekday", "store", "cast"].includes(groupBy)) throw new ApiError("groupByが不正です。", 400);
    const order = params.get("order");
    const result = await getDiaryAnalytics({ from, to, storeCodes: store && store !== "ALL" ? [store as StoreCode] : undefined, castId: params.get("castId") ?? undefined, groupBy: groupBy as DiaryRequest["groupBy"], comparison: params.get("comparison") ?? undefined, sort: params.get("sort") ?? undefined, order: order === "desc" ? "desc" : "asc" });
    return Response.json(result);
  } catch (error) { return apiErrorResponse(error); }
}
