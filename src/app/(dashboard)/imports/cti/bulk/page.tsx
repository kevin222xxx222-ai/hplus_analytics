import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CtiBulkImport } from "@/components/cti-bulk-import";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CtiBulkImportPage() {
  await requireAdmin();
  return <>
    <Link href="/imports" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" />CTI取込へ</Link>
    <PageHeader eyebrow="LOCAL BULK IMPORT" title="CTIローカルフォルダ一括取込" description="固定フォルダを読み取り専用で走査し、既存CTI取込処理を対象日順に1ファイルずつ実行します。" />
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">初回は「全件検証」だけを実行してください。検証では実績を変更せず、元XLSX・プレビュー・ImportBatch・ImportErrorだけを保存します。</div>
    <CtiBulkImport />
  </>;
}
