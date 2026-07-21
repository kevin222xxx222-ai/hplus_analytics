import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { scanTownBulkFolders } from "@/lib/imports/town/bulk-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminApi();
    return Response.json(await scanTownBulkFolders());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
