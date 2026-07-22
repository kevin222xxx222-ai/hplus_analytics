import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { confirmHeavenImport } from "@/lib/imports/heaven/service";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); await requireAdminApi(); const { id } = await params; return Response.json(await confirmHeavenImport(id)); } catch (error) { return apiErrorResponse(error); } }
