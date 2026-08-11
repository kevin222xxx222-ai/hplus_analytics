import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getStoreDayDetail } from "@/lib/analytics/integration/store-day-detail";

const stores = new Set(["ALL", "KASUKABE", "KOSHIGAYA", "NODA"]);

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams;
    const date = params.get("date");
    const store = params.get("store") ?? "ALL";
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("date は YYYY-MM-DD 形式で指定してください。", 400);
    if (!stores.has(store)) throw new ApiError("store が不正です。", 400);
    if (date > new Date().toISOString().slice(0, 10)) return Response.json({ businessDate: date, available: false, reason: "未来日のため表示できません。" });
    return Response.json(await getStoreDayDetail({ date, storeCode: store as "ALL" | "KASUKABE" | "KOSHIGAYA" | "NODA" }));
  } catch (error) { return apiErrorResponse(error); }
}
