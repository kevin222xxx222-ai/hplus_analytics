import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { confirmHeavenImport } from "@/lib/imports/heaven/service";
import { syncDriveFileStateAfterConfirmedImport } from "@/lib/import-automation/google-drive/post-confirm-sync";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const result = await confirmHeavenImport(id);
    let driveSync;
    try { driveSync = await syncDriveFileStateAfterConfirmedImport(id); }
    catch { driveSync = { status: "FAILED", batchId: id, reason: "SYNC_FAILED" } as const; }
    return Response.json({ ...result, driveFileStateSync: driveSync });
  } catch (error) { return apiErrorResponse(error); }
}
