import { ImportMode } from "@/generated/prisma/client";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { createCtiPreview } from "@/lib/imports/cti/service";
import { assertSameOrigin } from "@/lib/imports/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const formData = await request.formData();
    const file = formData.get("file");
    const importSourceId = String(formData.get("importSourceId") || "");
    const importModeValue = String(formData.get("importMode") || "");
    const targetFrom = String(formData.get("targetFrom") || "");
    const targetTo = String(formData.get("targetTo") || "");
    if (!(file instanceof File)) throw new Error("XLSXファイルを選択してください。");
    if (!Object.values(ImportMode).includes(importModeValue as ImportMode)) throw new Error("取込種別が不正です。");
    const result = await createCtiPreview({ file, importSourceId, importMode: importModeValue as ImportMode, targetFrom, targetTo, uploadedByUserId: user.id });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
