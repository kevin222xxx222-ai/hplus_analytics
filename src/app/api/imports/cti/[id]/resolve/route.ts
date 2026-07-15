import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { resolveCtiPreviewRow } from "@/lib/imports/cti/resolution-service";
import { assertSameOrigin } from "@/lib/imports/security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("EXISTING"), rowKey: z.string().min(1), castId: z.string().uuid() }),
  z.object({ action: z.literal("NEW"), rowKey: z.string().min(1), displayName: z.string().trim().min(1).max(100), startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ action: z.literal("SKIP"), rowKey: z.string().min(1) }),
  z.object({ action: z.literal("PENDING"), rowKey: z.string().min(1) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const { rowKey, ...resolution } = input;
    return Response.json(await resolveCtiPreviewRow(id, rowKey, resolution));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
