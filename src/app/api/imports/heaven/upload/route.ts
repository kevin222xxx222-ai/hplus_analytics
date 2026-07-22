import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { createHeavenPreview } from "@/lib/imports/heaven/service";
import type { HeavenMetricType } from "@/lib/imports/heaven/parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const form = await request.formData();
    const file = form.get("file");
    const storeId = String(form.get("storeId") || "");
    const rawHint = String(form.get("metricHint") || "");
    const metricHint = rawHint ? rawHint as HeavenMetricType : undefined;
    if (!(file instanceof File)) throw new Error("CSVファイルを選択してください。");
    const result = await createHeavenPreview({ file, storeId, metricHint, uploadedByUserId: user.id });
    return Response.json({ batchId: result.batchId, status: result.status, reused: Boolean(result.reused), duplicateOfBatchId: result.duplicateOfBatchId || null, summary: { unmatchedCount: result.preview.unmatchedCount, unmatchedPeople: result.preview.unmatchedPeople, ambiguousCount: result.preview.ambiguousCount, errorCount: result.preview.errorCount, warningCount: result.preview.warningCount } }, { status: result.reused ? 200 : 201 });
  } catch (error) { return apiErrorResponse(error); }
}
