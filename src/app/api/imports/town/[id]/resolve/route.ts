import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { inspectTownCastCreation, resolveTownPreviewRow } from "@/lib/imports/town/resolution-service";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const requestSchema = z.object({
  rowKey: z.string().min(1),
  action: z.enum(["EXISTING", "NEW", "CHECK_NEW", "SKIP", "PENDING"]),
  castId: z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  primaryStoreId: z.string().uuid().nullable().optional(),
  startedOn: dateValue.optional(),
  notes: z.string().trim().max(1000).optional(),
  confirmDuplicate: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const body = requestSchema.parse(await request.json());
    if (body.action === "CHECK_NEW" && body.displayName && body.startedOn) return Response.json(await inspectTownCastCreation(id, body.rowKey, body.displayName, body.startedOn));
    if (body.action === "NEW" && body.displayName && body.startedOn) return Response.json(await resolveTownPreviewRow(id, body.rowKey, {
      action: "NEW",
      displayName: body.displayName,
      primaryStoreId: body.primaryStoreId || null,
      startedOn: body.startedOn,
      notes: body.notes,
      confirmDuplicate: body.confirmDuplicate,
    }));
    if (body.action === "EXISTING" && body.castId) return Response.json(await resolveTownPreviewRow(id, body.rowKey, { action: "EXISTING", castId: body.castId }));
    if (body.action === "SKIP" || body.action === "PENDING") return Response.json(await resolveTownPreviewRow(id, body.rowKey, { action: body.action }));
    throw new Error("紐付け操作が不正です。");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
