import { approveHeavenBulkAliases, getHeavenBulkAliasApprovalPreview } from "@/lib/imports/heaven/service";
import { requireAdminApi } from "@/lib/api";
import { assertSameOrigin } from "@/lib/imports/security";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
    const { id } = await params;
    return Response.json(await getHeavenBulkAliasApprovalPreview(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "プレビュー取得に失敗しました。", errorCode: "HEAVEN_BULK_ALIAS_PREVIEW_FAILED" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdminApi();
    const { id } = await params;
    return Response.json(await approveHeavenBulkAliases(id, user.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "一括承認に失敗しました。", errorCode: "HEAVEN_BULK_ALIAS_APPROVAL_FAILED" }, { status: 400 });
  }
}
