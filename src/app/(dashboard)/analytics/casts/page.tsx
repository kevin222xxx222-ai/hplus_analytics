import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { aggregateCti, resolveDateRange } from "@/lib/analytics/cti";
import { prisma } from "@/lib/prisma";

function number(value: number | null, digits = 0) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }

export default async function CastAnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const records = await prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: range.from, lte: range.to } }, include: { cast: true }, orderBy: [{ cast: { displayName: "asc" } }, { businessDate: "asc" }] });
  const grouped = new Map<string, typeof records>();
  for (const record of records) grouped.set(record.castId, [...(grouped.get(record.castId) || []), record]);
  const rows = [...grouped.values()].map((castRecords) => ({ cast: castRecords[0].cast, metrics: aggregateCti(castRecords) }));
  return <><PageHeader eyebrow="CTI PERFORMANCE" title="キャスト実績" description="同一日に複数店舗へ出勤した場合、出勤日数は1日、時間・売上・報酬・本数は合算します。" /><DateRangeForm from={range.fromText} to={range.toText} />
    <section className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>キャスト</th><th>出勤日数</th><th>出勤時間</th><th>料金</th><th>女子報酬</th><th>CTI利益</th><th>予約</th><th>キャンセル</th><th>成約</th><th>本指名</th><th>写真指名</th><th>フリー</th><th>平均報酬/日</th><th>平均報酬/時間</th><th>平均本数/日</th><th></th></tr></thead><tbody>{rows.map(({ cast, metrics }) => <tr key={cast.id}><td className="font-medium text-slate-900">{cast.displayName}</td><td>{metrics.attendanceDays}</td><td>{number(metrics.attendanceMinutes / 60, 1)}h</td><td>¥{number(metrics.salesAmount)}</td><td>¥{number(metrics.castRewardAmount)}</td><td>¥{number(metrics.ctiProfitAmount)}</td><td>{metrics.reservationCount}</td><td>{metrics.cancellationCount}</td><td>{metrics.contractCount}</td><td>{metrics.regularNominationCount}</td><td>{metrics.photoNominationCount}</td><td>{metrics.freeCount}</td><td>{metrics.averageRewardPerDay === null ? "—" : `¥${number(metrics.averageRewardPerDay)}`}</td><td>{metrics.averageRewardPerHour === null ? "—" : `¥${number(metrics.averageRewardPerHour)}`}</td><td>{number(metrics.averageContractsPerDay, 2)}</td><td><Link href={`/analytics/casts/${cast.id}?from=${range.fromText}&to=${range.toText}`} className="icon-button"><ArrowUpRight className="size-4" /></Link></td></tr>)}</tbody></table>{rows.length === 0 && <p className="empty-state">指定期間のCTI実績はありません。</p>}</div></section>
  </>;
}
