import { z } from "zod";
import { ApiError, apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { analyzeTownBulkLinkCandidates, executeTownBulkLinkCandidate, inspectTownBulkLinkImpact } from "@/lib/imports/town/bulk-link-service";

const executeSchema = z.object({
  action: z.literal("EXECUTE"),
  category: z.enum(["A", "B"]),
  candidateKeys: z.array(z.string().min(1)).min(1).max(500),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

const previewSchema = z.object({ action: z.literal("PREVIEW") });
const impactPreviewSchema = z.object({
  action: z.literal("IMPACT_PREVIEW"),
  candidateKey: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(["EXISTING", "NEW", "SKIP", "PENDING", "CORRECTION_REVIEW"]),
  targetCastId: z.string().uuid().optional(),
  newCastName: z.string().trim().min(1).max(100).optional(),
  newStartedOn: z.string().date().optional(),
});
const candidateExecuteSchema = z.object({
  action: z.literal("EXECUTE_CANDIDATE"),
  candidateKey: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(["EXISTING", "NEW"]),
  targetCastId: z.string().uuid().optional(),
  newCastName: z.string().trim().min(1).max(100).optional(),
  primaryStoreId: z.string().uuid().optional(),
  newStartedOn: z.string().date().optional(),
  note: z.string().max(1000).optional(),
  creationReason: z.string().trim().min(1).max(1000).optional(),
  confirmationText: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const body = z.discriminatedUnion("action", [previewSchema, impactPreviewSchema, candidateExecuteSchema, executeSchema]).parse(await request.json());
    if (body.action === "PREVIEW") return Response.json(await analyzeTownBulkLinkCandidates());
    if (body.action === "IMPACT_PREVIEW") return Response.json(await inspectTownBulkLinkImpact(body));
    if (body.action === "EXECUTE_CANDIDATE") return Response.json(await executeTownBulkLinkCandidate({ ...body, userId: user.id }));
    throw new ApiError("Phase 2ではA/Bの一括実行は無効です。候補なしの個別実行だけを使用してください。", 409);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
