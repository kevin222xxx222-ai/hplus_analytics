import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getStoreWeekDetail } from "@/lib/analytics/integration/store-week-detail";

const stores = new Set(["ALL", "KASUKABE", "KOSHIGAYA", "NODA"]);
export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams; const week = params.get("week"); const store = params.get("store") ?? "ALL";
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new ApiError("week は YYYY-MM-DD 形式で指定してください。", 400);
    if (!stores.has(store)) throw new ApiError("store が不正です。", 400);
    return Response.json(await getStoreWeekDetail({ week, storeCode: store as "ALL" | "KASUKABE" | "KOSHIGAYA" | "NODA" }));
  } catch (error) { return apiErrorResponse(error); }
}
