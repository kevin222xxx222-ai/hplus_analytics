import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { reparseHeavenBatch } from "@/lib/imports/heaven/service";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); await requireAdminApi(); const { id } = await params; const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Heaven再解析がタイムアウトしました。")), 120_000)); return Response.json(await Promise.race([reparseHeavenBatch(id), timeout])); } catch (error) { return apiErrorResponse(error); } }
