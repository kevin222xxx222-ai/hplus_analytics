import { readFile } from "node:fs/promises";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { getStoredImportPath } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
    const { id } = await params;
    const batch = await prisma.importBatch.findUnique({ where: { id }, select: { originalFilename: true, storagePath: true } });
    if (!batch) return Response.json({ error: "ファイルが見つかりません。" }, { status: 404 });
    const bytes = await readFile(getStoredImportPath(batch.storagePath));
    const encoded = encodeURIComponent(batch.originalFilename).replace(/['()]/g, escape);
    const contentType = batch.originalFilename.toLowerCase().endsWith(".csv")
      ? "text/csv; charset=Shift_JIS"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Response(bytes, { headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
