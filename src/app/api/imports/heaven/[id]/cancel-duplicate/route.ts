import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { cancelDuplicateHeavenBatch } from "@/lib/imports/heaven/service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const { id } = await params;
    return Response.json(await cancelDuplicateHeavenBatch(id, user.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
