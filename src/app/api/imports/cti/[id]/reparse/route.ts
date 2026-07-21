import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { reparseCtiBatch } from "@/lib/imports/cti/reparse-service";
import { assertSameOrigin } from "@/lib/imports/security";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    return Response.json(await reparseCtiBatch(id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
