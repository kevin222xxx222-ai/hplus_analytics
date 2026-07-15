import { readFile } from "node:fs/promises";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { getStoredWorkbookPath } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
    const { id } = await params;
    const batch = await prisma.importBatch.findUnique({ where: { id }, select: { originalFilename: true } });
    if (!batch) return Response.json({ error: "ファイルが見つかりません。" }, { status: 404 });
    const bytes = await readFile(getStoredWorkbookPath(id));
    const encoded = encodeURIComponent(batch.originalFilename).replace(/['()]/g, escape);
    return new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
