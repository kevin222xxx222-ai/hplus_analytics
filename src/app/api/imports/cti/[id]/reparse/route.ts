import { ImportBatchStatus } from "@/generated/prisma/client";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { formatDateOnly } from "@/lib/date";
import { createCtiPreview } from "@/lib/imports/cti/service";
import { assertSameOrigin } from "@/lib/imports/security";
import { readWorkbook } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const { id } = await params;
    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("取込履歴が見つかりません。");
    if (batch.status !== ImportBatchStatus.FAILED) throw new Error("FAILEDの取込だけ再解析できます。");
    const buffer = await readWorkbook(id);
    const file = new File([new Uint8Array(buffer)], batch.originalFilename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const result = await createCtiPreview({
      file,
      importSourceId: batch.importSourceId,
      importMode: batch.importMode,
      targetFrom: formatDateOnly(batch.targetFrom),
      targetTo: formatDateOnly(batch.targetTo),
      uploadedByUserId: user.id,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
