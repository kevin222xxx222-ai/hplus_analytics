import { apiErrorResponse, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getCastDiagnosisDetail } from "@/lib/analytics/cast-diagnosis/detail";

const date = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, { params }: { params: Promise<{ castId: string }> }) {
  try {
    if (!(await getCurrentUser())) throw new ApiError("ログインが必要です。", 401);
    const { castId } = await params;
    const query = new URL(request.url).searchParams;
    const from = query.get("from"); const to = query.get("to");
    if (!castId || !from || !to || !date.test(from) || !date.test(to) || from > to) throw new ApiError("castId と期間を正しく指定してください。", 400);
    const result = await getCastDiagnosisDetail({ castId, from, to });
    if (!result) throw new ApiError("キャストが見つかりません。", 404);
    return Response.json(result);
  } catch (error) { return apiErrorResponse(error); }
}
