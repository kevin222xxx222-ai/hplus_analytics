import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDailyBrief } from "@/lib/analytics/integration/daily-brief";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const stores = new Set(["ALL", "KASUKABE", "KOSHIGAYA", "NODA"]);

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const params = new URL(request.url).searchParams;
    const from = params.get("from"); const to = params.get("to"); const scope = params.get("store") ?? params.get("scope") ?? "ALL";
    if (!from || !to || !datePattern.test(from) || !datePattern.test(to) || from > to) throw new ApiError("期間の指定が不正です。", 400);
    if (!stores.has(scope)) throw new ApiError("分析対象外の店舗です。", 400);
    const fromDate = new Date(`${from}T00:00:00.000Z`); const toDate = new Date(`${to}T00:00:00.000Z`);
    if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 366) throw new ApiError("期間は366日以内で指定してください。", 400);
    return Response.json(await getDailyBrief({ from, to, scope: scope as "ALL" | "KASUKABE" | "KOSHIGAYA" | "NODA" }));
  } catch (error) { return apiErrorResponse(error); }
}
