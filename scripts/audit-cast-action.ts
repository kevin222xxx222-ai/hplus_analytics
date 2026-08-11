/* eslint-disable @typescript-eslint/no-explicit-any -- audit report composition uses dynamic aggregation records. */
import fs from "node:fs/promises";
import path from "node:path";
import { buildActionAuditCandidate, actionTypeLabels, type CastActionAuditCandidate } from "@/lib/analytics/cast-diagnosis/action-audit";
import { buildCastActionPlan } from "@/lib/analytics/cast-action/engine";

/** The report keeps the legacy audit shape, but all final action/priority/stage values come from the formal engine. */
const buildFormalAuditCandidate = (cast: Parameters<typeof buildActionAuditCandidate>[0], period: { from: string; to: string }): CastActionAuditCandidate => {
  const plan = buildCastActionPlan({ cast, period });
  const legacy = plan.auditCandidate;
  return {
    ...legacy,
    stageStates: {
      result: plan.stageStates.result.state,
      pageTraffic: plan.stageStates.pageTraffic.state,
      photoConversion: plan.stageStates.photoConversion.state,
      repeatConversion: plan.stageStates.repeatConversion.state,
    },
    proposedAction: {
      ...legacy.proposedAction,
      type: plan.actionType,
      priority: plan.priority,
      title: plan.actionLabel,
      conclusion: plan.conclusion.summary,
    },
    appliedRule: plan.appliedRule.key,
    confidence: plan.confidence.level,
    warnings: plan.warnings.map((warning) => warning.code),
  };
};

type Args = { from?: string; to?: string; outputDir: string; pretty: boolean };
const parseArgs = (argv: string[]): Args => { const args: Args = { outputDir: "artifacts/audits/cast-action", pretty: false }; for (const arg of argv) { const [key, value] = arg.replace(/^--/, "").split("="); if (key === "from") args.from = value; else if (key === "to") args.to = value; else if (key === "output-dir") args.outputDir = value; else if (key === "pretty") args.pretty = true; } return args; };
const validDate = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const countBy = (items: string[]) => Object.fromEntries([...new Set(items)].sort().map((key) => [key, items.filter((item) => item === key).length]));
const namesBy = (candidates: CastActionAuditCandidate[], predicate: (candidate: CastActionAuditCandidate) => boolean) => candidates.filter(predicate).map((candidate) => candidate.castName).sort((a, b) => a.localeCompare(b, "ja"));
const pct = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
function usage(): never { console.error("Usage: npm run audit:cast-action -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--output-dir=...] [--pretty]"); process.exit(2); }
function markdown(report: any) {
  const lines = [`# Cast Analytics CA-4 Action Rule Audit`, ``, `期間: ${report.period.from}〜${report.period.to}`, ``, `## 監査目的`, `Action Engineを実装せず、既存Diagnosis/Comparison結果から安全な確認方針候補を試算した監査です。`, `原因・評価・目標値を断定せず、スタッフ確認が必要な項目を明示します。`, ``, `## 母集団`, `- 全キャスト: ${report.population.all}名`, `- メイン出勤者（Action対象）: ${report.population.main}名`, `- 非メイン: ${report.population.nonMain}名`, ``, `## Actionタイプ別人数`, `| Action | 人数 | 割合 |`, `|---|---:|---:|`, ...Object.entries(report.actionCounts).map(([key, value]) => `|${actionTypeLabels[key as keyof typeof actionTypeLabels] ?? key}|${value}|${pct(value as number, report.population.main)}|`), ``, `## 優先度別人数`, `| 優先度 | 人数 |`, `|---|---:|`, ...Object.entries(report.priorityCounts).map(([key, value]) => `|${key}|${value}|`), ``, `## Stage State分布`, `| 段階 | GOOD | ADEQUATE | BORDERLINE | LOW | REFERENCE_ONLY | INSUFFICIENT |`, `|---|---:|---:|---:|---:|---:|---:|`, ...Object.entries(report.stageCounts).map(([key, value]: [string, any]) => `|${key}|${value.GOOD}|${value.ADEQUATE}|${value.BORDERLINE}|${value.LOW}|${value.REFERENCE_ONLY}|${value.INSUFFICIENT}|`), ``, `## ルール別人数`, `| ルール | 人数 |`, `|---|---:|`, ...Object.entries(report.ruleCounts).map(([key, value]) => `|${key}|${value}|`), ``, `## OTHER_REVIEW再分類`, `| Action | 人数 | キャスト |`, `|---|---:|---|`, ...Object.entries(report.otherReview).map(([key, value]: [string, any]) => `|${actionTypeLabels[key as keyof typeof actionTypeLabels] ?? key}|${value.count}|${value.names.join("、") || "—"}|`), ``, `## 代表キャスト`, `| キャスト | Primary | Stage | Action | Priority | Confidence |`, `|---|---|---|---|---|---|`, ...report.representatives.map((candidate: CastActionAuditCandidate) => `|${candidate.castName}|${candidate.currentDiagnosis.primaryType}|${Object.values(candidate.stageStates).join(" / ")}|${candidate.proposedAction.title}|${candidate.proposedAction.priority}|${candidate.confidence}|`), ``, `## 誤提案監査`, ...report.falseProposalChecks.map((item: any) => `- ${item.label}: ${item.count}名${item.names.length ? `（${item.names.join("、")}）` : ""}`), ``, `## 境界値感度分析`, `案3（既存Comparison状態を再利用）を第一候補とします。UI表示・既存Diagnosisとの整合性を保ち、監査案1/2の再分類は別途実装前に確認します。`, ``, `## 推奨ルール`, `既存Comparison状態をStage Stateへ正規化し、Rule 1〜8を優先順位どおりに適用する案を推奨します。結果GOOD/ADEQUATEは現状維持、流入不足はページ流入、流入確保後の転換不足はプロフィール転換、再来不足は本指名・再来確認を優先します。`, ``, `## CA-4.1進行可否`, report.stopReasons.length ? `停止条件に該当: ${report.stopReasons.join("、")}` : `進行可能（Action Engineは未接続）`, ``, `## 監査方法`, `- 既存のgetCastDiagnosisを読み取り専用で実行`, `- メイン出勤者のみAction候補を集計`, `- 非メインは別集計`, `- UI/API/DB/Diagnosis/Comparisonは変更なし`, ``, `## 残課題`, `- Action候補DTOは本番APIへ未接続`, `- 面談記録・目標値・AI文章生成は未実装`, `- CTIだけでは出勤時刻・空き時間を断定できないため、予約配置Actionは必ずスタッフ確認を伴う`, ``, ``]; return lines.join("\n");
}
async function main() {
  const args = parseArgs(process.argv.slice(2)); if (!validDate(args.from) || !validDate(args.to) || args.from! > args.to!) usage(); process.loadEnvFile?.(".env");
  const { getCastDiagnosis } = await import("@/lib/analytics/cast-diagnosis/service"); const { prisma } = await import("@/lib/prisma");
  try {
    const period = { from: args.from!, to: args.to! }; const result = await getCastDiagnosis(period); const candidates = result.casts.filter((cast) => cast.isMainAttendanceCast).map((cast) => buildFormalAuditCandidate(cast, period)); const nonMain = result.casts.filter((cast) => !cast.isMainAttendanceCast).map((cast) => buildFormalAuditCandidate(cast, period));
    const actionCounts = countBy(candidates.map((candidate) => candidate.proposedAction.type)); const priorityCounts = countBy(candidates.map((candidate) => candidate.proposedAction.priority)); const ruleCounts = countBy(candidates.map((candidate) => candidate.appliedRule)); const stageNames = ["result", "pageTraffic", "photoConversion", "repeatConversion"] as const; const stageCounts = Object.fromEntries(stageNames.map((stage) => [stage, countBy(candidates.map((candidate) => candidate.stageStates[stage]))]));
    const other = candidates.filter((candidate) => candidate.currentDiagnosis.primaryType === "OTHER_REVIEW"); const otherReview = Object.fromEntries(Object.keys(actionTypeLabels).map((key) => [key, { count: other.filter((candidate) => candidate.proposedAction.type === key).length, names: namesBy(other, (candidate) => candidate.proposedAction.type === key) }]));
    const find = (name: string) => candidates.find((candidate) => candidate.castName === name) ?? nonMain.find((candidate) => candidate.castName === name);
    const representatives = ["あゆみ", "のの", "まゆ", "ゆあ", "まりな", "りあ"].map(find).filter(Boolean);
    const falseProposalChecks = [
      { label: "流入GOOD/ADEQUATEなのにページ流入Action", count: candidates.filter((c) => (c.stageStates.pageTraffic === "GOOD" || c.stageStates.pageTraffic === "ADEQUATE") && c.proposedAction.type === "REVIEW_PAGE_TRAFFIC").length, names: namesBy(candidates, (c) => (c.stageStates.pageTraffic === "GOOD" || c.stageStates.pageTraffic === "ADEQUATE") && c.proposedAction.type === "REVIEW_PAGE_TRAFFIC") },
      { label: "写真転換GOODなのにプロフィール転換Action", count: candidates.filter((c) => (c.stageStates.photoConversion === "GOOD" || c.stageStates.photoConversion === "ADEQUATE") && c.proposedAction.type === "REVIEW_PROFILE_CONVERSION").length, names: namesBy(candidates, (c) => (c.stageStates.photoConversion === "GOOD" || c.stageStates.photoConversion === "ADEQUATE") && c.proposedAction.type === "REVIEW_PROFILE_CONVERSION") },
      { label: "再来GOODなのに再来改善Action", count: candidates.filter((c) => (c.stageStates.repeatConversion === "GOOD" || c.stageStates.repeatConversion === "ADEQUATE") && c.proposedAction.type === "REVIEW_REPEAT_CONVERSION").length, names: namesBy(candidates, (c) => (c.stageStates.repeatConversion === "GOOD" || c.stageStates.repeatConversion === "ADEQUATE") && c.proposedAction.type === "REVIEW_REPEAT_CONVERSION") },
      { label: "高効率キャストへの改善Action", count: candidates.filter((c) => c.currentDiagnosis.primaryType === "STABLE_HIGH_EFFICIENCY" && !["MAINTAIN_CURRENT", "MONITOR_BORDERLINE"].includes(c.proposedAction.type)).length, names: namesBy(candidates, (c) => c.currentDiagnosis.primaryType === "STABLE_HIGH_EFFICIENCY" && !["MAINTAIN_CURRENT", "MONITOR_BORDERLINE"].includes(c.proposedAction.type)) },
      { label: "稼働時間増加の自動提案", count: candidates.filter((c) => /稼働時間|出勤日数|増やす/.test(c.proposedAction.conclusion) || c.reviewItems.some((item) => /増加|増やす/.test(item.reason))).length, names: namesBy(candidates, (c) => /稼働時間|出勤日数|増やす/.test(c.proposedAction.conclusion) || c.reviewItems.some((item) => /増加|増やす/.test(item.reason))) },
      { label: "MISSINGを0として判定", count: candidates.filter((c) => c.warnings.some((warning) => warning.includes("0"))).length, names: namesBy(candidates, (c) => c.warnings.some((warning) => warning.includes("0"))) },
    ];
    const stopReasons = [...(candidates.filter((c) => c.proposedAction.type === "MANUAL_REVIEW").length > candidates.length * 0.3 ? ["Action判定不能がメイン出勤者の30%以上"] : []), ...(falseProposalChecks.filter((item) => item.count > 0).map((item) => `${item.label}が${item.count}名`))];
    const sensitivity = { "案1_80_60": { adequate: 0.8, borderline: 0.6 }, "案2_85_65": { adequate: 0.85, borderline: 0.65 }, "案3_existing_comparison": undefined } as const;
    const sensitivitySummary = Object.fromEntries(Object.entries(sensitivity).map(([name, thresholds]) => { const items = result.casts.filter((cast) => cast.isMainAttendanceCast).map((cast) => thresholds ? buildActionAuditCandidate(cast, thresholds) : buildFormalAuditCandidate(cast, period)); return [name, { actionCounts: countBy(items.map((item) => item.proposedAction.type)), stageCounts: Object.fromEntries(stageNames.map((stage) => [stage, countBy(items.map((item) => item.stageStates[stage]))])) }]; }));
    const report = { period: { from: args.from!, to: args.to! }, population: { all: result.casts.length, main: candidates.length, nonMain: nonMain.length }, actionCounts, priorityCounts, ruleCounts, stageCounts, candidates, nonMain, otherReview, representatives, falseProposalChecks, stopReasons, sensitivity: sensitivitySummary, diagnosisActionCounts: Object.fromEntries([...new Set(result.casts.map((cast) => cast.diagnosis.primaryType))].map((type) => [type, countBy(candidates.filter((candidate) => candidate.currentDiagnosis.primaryType === type).map((candidate) => candidate.proposedAction.type))])) };
    const outputDir = path.resolve(args.outputDir); await fs.mkdir(outputDir, { recursive: true }); const stem = `cast-action-${args.from}_${args.to}`; await fs.writeFile(path.join(outputDir, `${stem}.json`), JSON.stringify(report, null, args.pretty ? 2 : 0)); await fs.writeFile(path.join(outputDir, `${stem}.md`), markdown(report));
    console.log(`Cast Action Rule Audit\nPeriod: ${args.from} - ${args.to}\n\nPopulation\n- All casts: ${report.population.all}\n- Main attendance: ${report.population.main}\n- Non-main: ${report.population.nonMain}\n\nAction counts\n${Object.entries(actionCounts).map(([key, value]) => `- ${actionTypeLabels[key as keyof typeof actionTypeLabels] ?? key}: ${value}`).join("\n")}\n\nPriority\n${Object.entries(priorityCounts).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\nStop conditions\n- ${stopReasons.length ? stopReasons.join("\n- ") : "なし"}`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
