import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { scanCtiBulkFolder } from "@/lib/imports/cti/bulk-service";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = new Date();
  try {
    await requireAdminApi();
    const scan = await scanCtiBulkFolder();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    console.info(`[cti-bulk-scan] completed startedAt=${startedAt.toISOString()} finishedAt=${finishedAt.toISOString()} durationMs=${durationMs} files=${scan.files.length}`);
    return Response.json(scan, { headers: { "server-timing": `cti-bulk-scan;dur=${durationMs}`, "x-cti-bulk-duration-ms": String(durationMs) } });
  } catch (error) {
    const finishedAt = new Date();
    console.error(`[cti-bulk-scan] failed startedAt=${startedAt.toISOString()} finishedAt=${finishedAt.toISOString()} durationMs=${finishedAt.getTime() - startedAt.getTime()}`, error);
    return apiErrorResponse(error);
  }
}
