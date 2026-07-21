import { TOWN_EVALUATION_LABELS, evaluateTownReferencePreview, rankTownReferenceRows, type TownReferenceConfig, type TownReferenceMetrics, type TownReferenceRankKey, type TownReferenceRow } from "@/lib/analytics/town-reference";

export type TownReferenceDisplayRow = TownReferenceRow & { scopes: Array<{ label: string; metrics: TownReferenceMetrics }> };

const rankings: Array<{ key: TownReferenceRankKey; label: string; money?: boolean; percent?: boolean }> = [
  { key: "pv", label: "PV" }, { key: "uu", label: "UU" }, { key: "telTapUu", label: "TELタップ" },
  { key: "telRate", label: "TEL率", percent: true }, { key: "salesAmount", label: "CTI料金", money: true },
  { key: "castRewardAmount", label: "女子報酬", money: true }, { key: "contractCount", label: "CTI成約数" },
  { key: "regularNominationRate", label: "本指名率", percent: true }, { key: "salesPerUu", label: "UUあたり売上（参考）", money: true },
];

function number(value: number | null, digits = 2) { return value === null ? "—" : value.toLocaleString("ja-JP", { maximumFractionDigits: digits }); }
function rate(value: number | null) { return value === null ? "—" : `${number(value * 100, 2)}%`; }
function money(value: number | null) { return value === null ? "—" : `¥${number(value, 0)}`; }

export function TownReferenceAnalysis({ rows, config }: { rows: TownReferenceDisplayRow[]; config: TownReferenceConfig }) {
  return <div className="mt-6 space-y-6">
    <section className="panel overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">参考分析指標</h2><p className="mt-2 text-sm text-amber-700">タウンのUU・TELタップとCTIの成約・売上は顧客単位で直接対応しません。同一期間の傾向比較用の参考指標です。</p></div><div className="table-wrap"><table><thead><tr><th>キャスト</th><th>範囲</th><th>UUあたり成約数（参考）</th><th>UUあたり売上（参考）</th><th>TELあたり売上（参考）</th><th>本指名率</th></tr></thead><tbody>{rows.flatMap((row) => row.scopes.map((scope, index) => <tr key={`${row.id}-${scope.label}`}><td>{index === 0 ? row.name : ""}</td><td>{scope.label}</td><td>{number(scope.metrics.calculatedContractPerUu, 4)}</td><td>{money(scope.metrics.salesPerUu)}</td><td>{money(scope.metrics.salesPerTel)}</td><td>{rate(scope.metrics.regularNominationRate)}</td></tr>))}</tbody></table>{rows.length === 0 && <p className="empty-state">参考指標の対象データがありません。</p>}</div></section>
    <section><div className="mb-3"><h2 className="font-semibold text-slate-900">選択期間ランキング</h2><p className="mt-1 text-xs text-slate-500">各指標を独立集計した競技順位方式（同値は同順位、次順位は人数分繰り下げ）です。率・参考指標は最低母数未満を順位対象外とします。</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rankings.map((definition) => <div className="panel p-4" key={definition.key}><h3 className="text-sm font-semibold text-slate-800">{definition.label}</h3><ol className="mt-3 space-y-2">{rankTownReferenceRows(rows, definition.key, config).slice(0, 5).map((item) => <li className="flex justify-between gap-3 text-sm" key={item.id}><span>{item.rank}位 {item.name}</span><span className="font-medium">{definition.money ? money(item.value) : definition.percent ? rate(item.value) : number(item.value)}</span></li>)}</ol></div>)}</div></section>
    <section className="panel overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">評価プレビュー・改善候補</h2><p className="mt-1 text-xs text-slate-500">参考表示のみです。DB・公式評価・ImprovementLogへ保存しません。最低母数: UU {config.minimumTownUu}、CTI成約 {config.minimumCtiContracts}、出勤 {(config.minimumAttendanceMinutes / 60).toFixed(1)}時間。</p></div><div className="table-wrap"><table><thead><tr><th>キャスト</th><th>評価プレビュー</th><th>評価根拠</th><th>改善候補</th></tr></thead><tbody>{rows.map((row) => { const preview = evaluateTownReferencePreview(row, rows, config); return <tr key={row.id}><td className="font-medium text-slate-900">{row.name}</td><td>{TOWN_EVALUATION_LABELS[preview.code]}</td><td><ul className="space-y-1 text-xs">{preview.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></td><td><ul className="space-y-1 text-xs">{preview.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></td></tr>; })}</tbody></table></div></section>
  </div>;
}
