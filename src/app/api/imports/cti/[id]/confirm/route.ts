import { z } from "zod";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { confirmCtiImport } from "@/lib/imports/cti/importer";
import { syncDriveFileStateAfterConfirmedImport } from "@/lib/import-automation/google-drive/post-confirm-sync";
import { assertSameOrigin } from "@/lib/imports/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdminApi();
    const { id } = await params;
    const input = z.object({ forceDuplicate: z.boolean().default(false) }).parse(await request.json());
    const result = await confirmCtiImport(id, input.forceDuplicate);
    // CTI confirmation is already committed at this point. A synchronization
    // failure must be surfaced in the response without turning a successful
    // Confirm into an HTTP failure or rolling back the confirmed batch.
    let driveSync;
    try {
      driveSync = await syncDriveFileStateAfterConfirmedImport(id);
    } catch {
      driveSync = { status: "FAILED", batchId: id, reason: "SYNC_FAILED" } as const;
    }
    return Response.json({ ...result, driveFileStateSync: driveSync });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
