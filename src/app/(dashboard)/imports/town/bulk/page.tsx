import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TownBulkImport } from "@/components/town-bulk-import";
import { requireAdmin } from "@/lib/auth";
import { scanTownBulkFolders } from "@/lib/imports/town/bulk-service";

export const dynamic = "force-dynamic";

export default async function TownBulkImportPage() {
  await requireAdmin();
  const initialScan = await scanTownBulkFolders();
  return <>
    <Link href="/imports/town" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />Town取込へ</Link>
    <PageHeader eyebrow="LOCAL BULK IMPORT" title="Townローカルフォルダ一括取込" description="固定フォルダを読み取り専用で走査し、既存Town取込処理を1ファイルずつ安全に実行します。" />
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">新規キャスト作成・今回除外・修正版の自動上書きは行いません。初回は「全件検証」で結果を確認してください。</div>
    <TownBulkImport initialScan={initialScan} />
  </>;
}
