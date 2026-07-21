import type { ImportDataType } from "@/generated/prisma/client";
import { apiErrorResponse, requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";
import { TOWN_DATA_TYPES } from "@/lib/imports/town/columns";
import { createTownPreview } from "@/lib/imports/town/service";
import type { TownImportDataType } from "@/lib/imports/town/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const formData = await request.formData();
    const file = formData.get("file");
    const importSourceId = String(formData.get("importSourceId") || "");
    const storeId = String(formData.get("storeId") || "");
    const dataType = String(formData.get("dataType") || "") as ImportDataType;
    const targetFrom = String(formData.get("targetFrom") || "");
    const targetTo = String(formData.get("targetTo") || "");
    if (!(file instanceof File)) throw new Error("CSVファイルを選択してください。");
    if (!TOWN_DATA_TYPES.includes(dataType as TownImportDataType)) throw new Error("データ種別が不正です。");
    const result = await createTownPreview({ file, importSourceId, storeId, dataType: dataType as TownImportDataType, targetFrom, targetTo, uploadedByUserId: user.id });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

