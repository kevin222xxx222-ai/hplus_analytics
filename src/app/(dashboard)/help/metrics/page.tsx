import { PageHeader } from "@/components/page-header";
import { MetricGlossaryExplorer } from "@/components/metric-glossary-explorer";
import { METRIC_DEFINITIONS } from "@/lib/analytics/metric-definitions";
import { requireUser } from "@/lib/auth";

export default async function MetricsPage() {
  await requireUser();
  return <><PageHeader eyebrow="METRIC GLOSSARY" title="指標ガイド" description="検索・カテゴリ・関連指標から、数字の意味と判断上の注意点を確認できます。媒体の閲覧値とCTI予約・成約は顧客単位で直接対応しません。"/><MetricGlossaryExplorer definitions={Object.values(METRIC_DEFINITIONS)}/></>;
}
