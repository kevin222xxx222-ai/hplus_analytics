import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { processCtiBulkFile } from "@/lib/imports/cti/bulk-service";
import { assertSameOrigin } from "@/lib/imports/security";

export const runtime = "nodejs";

const inputSchema = z.object({
  key: z.string().min(1).max(500),
  action: z.enum(["VALIDATE", "CONFIRM_SAFE"]),
  retryFailed: z.boolean().optional(),
});

export async function POST(request: Request) {
  const startedAt = new Date();
  let key = "unknown";
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const input = inputSchema.parse(await request.json());
    key = input.key;
    const result = await processCtiBulkFile({ ...input, uploadedByUserId: user.id });
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const apiUrl = new URL(request.url).pathname;
    console.info(`[cti-bulk-process] completed key=${key} startedAt=${startedAt.toISOString()} finishedAt=${finishedAt.toISOString()} durationMs=${durationMs} outcome=${result.outcome}`);
    return Response.json({ ...result, request: { apiUrl, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs } }, {
      headers: { "server-timing": `cti-bulk-process;dur=${durationMs}`, "x-cti-bulk-duration-ms": String(durationMs) },
    });
  } catch (error) {
    const finishedAt = new Date();
    console.error(`[cti-bulk-process] failed key=${key} startedAt=${startedAt.toISOString()} finishedAt=${finishedAt.toISOString()} durationMs=${finishedAt.getTime() - startedAt.getTime()}`, error);
    return apiErrorResponse(error);
  }
}
