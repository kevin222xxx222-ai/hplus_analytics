import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getWeekdayDataRange, getWeekdayStrategy, type WeekdayScope } from "@/lib/analytics/weekday-strategy";

export async function GET(request: Request) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const url = new URL(request.url); const rawScope = url.searchParams.get("scope") ?? "ALL"; const scope: WeekdayScope = rawScope === "KASUKABE" || rawScope === "KOSHIGAYA" ? rawScope : "ALL";
    if (url.searchParams.get("meta") === "range") return Response.json({ range: await getWeekdayDataRange(scope) });
    const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
    if (!from || !to) throw new ApiError("from と to は必須です。", 400);
    const left = Number(url.searchParams.get("left") ?? "2"); const right = Number(url.searchParams.get("right") ?? "0");
    return Response.json(await getWeekdayStrategy({ from, to, scope, left: Number.isInteger(left) ? left : 2, right: Number.isInteger(right) ? right : 0 }));
  } catch (error) { return apiErrorResponse(error); }
}
