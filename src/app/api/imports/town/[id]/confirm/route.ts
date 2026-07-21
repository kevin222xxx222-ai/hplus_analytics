import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { confirmTownImport } from "@/lib/imports/town/importer";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { forceDuplicate?: boolean };
    return Response.json(await confirmTownImport(id, body.forceDuplicate === true));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

