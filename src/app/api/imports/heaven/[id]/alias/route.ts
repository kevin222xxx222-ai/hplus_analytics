import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { createHeavenAliasAndResolve } from "@/lib/imports/heaven/service";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const user = await requireAdminApi(); const { id } = await params; const body = await request.json(); return Response.json(await createHeavenAliasAndResolve({ ...body, batchId: id, executedBy: user.id })); } catch (error) { const response = apiErrorResponse(error); const payload = error instanceof Error ? { error: error.message, errorCode: "HEAVEN_ALIAS_RESOLUTION_FAILED" } : { error: "処理に失敗しました。", errorCode: "HEAVEN_ALIAS_RESOLUTION_FAILED" }; return Response.json(payload, { status: response.status }); } }
