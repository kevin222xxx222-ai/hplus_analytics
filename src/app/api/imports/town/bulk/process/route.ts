import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { processTownBulkFile } from "@/lib/imports/town/bulk-service";

export const runtime = "nodejs";

const inputSchema = z.object({
  key: z.string().min(1).max(500),
  action: z.enum(["VALIDATE", "CONFIRM_SAFE"]),
  retryFailed: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const input = inputSchema.parse(await request.json());
    return Response.json(await processTownBulkFile({ ...input, uploadedByUserId: user.id }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
