import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { confirmTownImport } from "@/lib/imports/town/importer";
import { syncDriveFileStateAfterConfirmedImport } from "@/lib/import-automation/google-drive/post-confirm-sync";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { forceDuplicate?: boolean };
    const result = await confirmTownImport(id, body.forceDuplicate === true);
    let driveFileStateSync;
    try {
      driveFileStateSync = await syncDriveFileStateAfterConfirmedImport(id);
    } catch {
      driveFileStateSync = { status: "FAILED", batchId: id, reason: "SYNC_FAILED" } as const;
    }
    return Response.json({ ...result, driveFileStateSync });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
