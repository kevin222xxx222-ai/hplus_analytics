import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { confirmCtiImport } from "@/lib/imports/cti/importer";
import { assertSameOrigin } from "@/lib/imports/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const input = z.object({ forceDuplicate: z.boolean().default(false) }).parse(await request.json());
    return Response.json(await confirmCtiImport(id, input.forceDuplicate));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
