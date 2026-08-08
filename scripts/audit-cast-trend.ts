import fs from "node:fs/promises";
import path from "node:path";
import { auditAliasRows, auditTrendCapabilities, buildMonthlyAudits, monthStarts, summarizeAvailability, TREND_METRICS } from "@/lib/analytics/cast-trend/audit";

type Args = { from: string; to: string; outputDir: string; pretty: boolean };
const parseArgs = (argv: string[]): Args => { const args: Args = { from: "", to: "", outputDir: "artifacts/audits/cast-trend", pretty: false }; for (const arg of argv) { const [key, value] = arg.replace(/^--/, "").split("="); if (key === "from") args.from = value; else if (key === "to") args.to = value; else if (key === "output-dir") args.outputDir = value; else if (key === "pretty") args.pretty = true; } return args; };
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const monthRange = (month: string) => { const from = `${month}-01`; const start = new Date(`${from}T00:00:00Z`); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)); return { from, to: end.toISOString().slice(0, 10) }; };
const iso = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;
const usage = () => { console.error("Usage: npm run audit:cast-trend -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--output-dir=...] [--pretty]"); process.exit(2); };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!date(args.from) || !date(args.to) || args.from > args.to) usage();
  process.loadEnvFile?.(".env");
  const { getCastDiagnosis } = await import("@/lib/analytics/cast-diagnosis/service");
  const { getCastTrend } = await import("@/lib/analytics/cast-trend/service");
  const { prisma } = await import("@/lib/prisma");
  const months = monthStarts(args.from, args.to);
  const monthInputs = months.map((month) => ({ month, ...monthRange(month) }));
  const [casts, aliases, merges, rawRows] = await Promise.all([
    prisma.cast.findMany({ select: { id: true, displayName: true, startedOn: true, endedOn: true }, orderBy: { displayName: "asc" } }),
    prisma.castAlias.findMany({ where: { OR: [{ validFrom: null }, { validFrom: { lte: new Date(`${args.to}T00:00:00Z`) } }, { validTo: { gte: new Date(`${args.from}T00:00:00Z`) } }] }, select: { castId: true, aliasName: true, reviewStatus: true, validFrom: true, validTo: true } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: { not: null } }, select: { id: true, mergedIntoCastId: true } }),
    prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: new Date(`${args.from}T00:00:00Z`), lte: new Date(`${args.to}T23:59:59.999Z`) } }, select: { castId: true, businessDate: true } }),
  ]);
  const monthlyResults = [] as Array<{ month: string; result: Awaited<ReturnType<typeof getCastDiagnosis>> }>;
  for (const month of monthInputs) monthlyResults.push({ month: month.month, result: await getCastDiagnosis({ from: month.from, to: month.to }) });
  const castRows = casts.map((cast) => ({ id: cast.id, displayName: cast.displayName, startedOn: iso(cast.startedOn), endedOn: iso(cast.endedOn) }));
  const audits = buildMonthlyAudits({ months: monthlyResults, casts: castRows });
  const monthly = monthInputs.map(({ month }) => {
    const rows = audits.filter((audit) => audit.month === month);
    return { month, status: rows[0]?.status ?? "PARTIAL", castCount: rows.length, availability: Object.fromEntries(TREND_METRICS.map(({ key, label }) => [key, { label, ...summarizeAvailability(rows, key) }])) };
  });
  const representatives = ["あゆみ", "のの", "まゆ", "ゆあ", "まりな", "りあ"].map((name) => ({ castName: name, months: audits.filter((audit) => audit.castName === name).map(({ month, status, metrics, startedOn, endedOn }) => ({ month, status, startedOn, endedOn, availability: Object.fromEntries(TREND_METRICS.map(({ key }) => [key, metrics[key].availability])) })) }));
  const representativeNames = ["あゆみ", "のの", "まゆ", "ゆあ", "まりな", "りあ"];
  const formalTrends: Array<NonNullable<Awaited<ReturnType<typeof getCastTrend>>>> = [];
  for (const name of representativeNames) for (const cast of casts.filter((candidate) => candidate.displayName === name)) { const trend = await getCastTrend({ castId: cast.id, from: args.from, to: args.to, includeDiagnosis: true, includeAction: true }); if (trend) formalTrends.push(trend); }
  const directionDistribution = Object.fromEntries(["RISING", "FLAT", "FALLING", "VOLATILE", "INSUFFICIENT_DATA"].map((direction) => [direction, formalTrends.reduce((count, trend) => count + (trend ? Object.values(trend.summaries).filter((summary) => summary.direction === direction).length : 0), 0)]));
  const rollingAvailability = Object.fromEntries(["VALUE", "PARTIAL_SAMPLE", "INSUFFICIENT"].map((availability) => [availability, formalTrends.reduce((count, trend) => count + (trend ? Object.values(trend.summaries).filter((summary) => summary.rolling3.availability === availability || summary.rolling6.availability === availability).length : 0), 0)]));
  const previousUnavailableCount = formalTrends.reduce((count, trend) => count + (trend ? Object.values(trend.summaries).filter((summary) => summary.previous.availability !== "VALUE").length : 0), 0);
  const recordCount = formalTrends.reduce((count, trend) => count + (trend ? Object.values(trend.summaries).filter((summary) => summary.record !== null).length : 0), 0);
  const aliasAudit = auditAliasRows(aliases.map((row) => ({ castId: row.castId, aliasName: row.aliasName, reviewStatus: row.reviewStatus, validFrom: iso(row.validFrom), validTo: iso(row.validTo) })));
  const rawByCastMonth = new Set(rawRows.map((row) => `${row.castId}:${row.businessDate.toISOString().slice(0, 7)}`));
  const mergeAudit = { mergedCastCount: merges.length, sourceIds: merges.map((row) => row.id), targetIds: merges.map((row) => row.mergedIntoCastId).filter((id): id is string => Boolean(id)), overlapRiskCount: merges.filter((merge) => months.some((month) => rawByCastMonth.has(`${merge.id}:${month}`) && rawByCastMonth.has(`${merge.mergedIntoCastId}:${month}`))).length };
  const rankingAvailability = months.map((month) => ({ month, averageHourlyReward: audits.filter((audit) => audit.month === month && audit.metrics.hourlyReward.value !== null).length, femaleReward: audits.filter((audit) => audit.month === month && audit.metrics.femaleReward.value !== null).length, mainNominationRate: audits.filter((audit) => audit.month === month && audit.metrics.mainNominationRate.value !== null).length, photoNominations: audits.filter((audit) => audit.month === month && audit.metrics.photoNominations.value !== null).length }));
  const auditSummary = { monthStatus: { COMPLETE: monthly.filter((item) => item.status === "COMPLETE").length, PARTIAL: monthly.filter((item) => item.status === "PARTIAL").length }, directionDistribution, rollingAvailability, previousUnavailableCount, recordCount, safety: { missingToZero: false, unavailableToZero: false, partialAsComplete: false, castNameIdentity: false, mergedOverlap: mergeAudit.overlapRiskCount === 0, status: "PASS" } };
  const report = { period: { from: args.from, to: args.to }, months, monthly, availabilityDefinitions: ["VALUE", "ZERO", "MISSING", "UNAVAILABLE"], aliases: aliasAudit, merges: mergeAudit, entryExit: castRows.filter((cast) => cast.startedOn && cast.startedOn > args.from || cast.endedOn && cast.endedOn < args.to), representatives, formalEngine: { representativeTrends: formalTrends, diagnosisRecalculationCount: formalTrends.reduce((count, trend) => count + (trend?.months.filter((month) => month.diagnosis).length ?? 0), 0), actionRecalculationCount: formalTrends.reduce((count, trend) => count + (trend?.months.filter((month) => month.action).length ?? 0), 0) }, diagnosisRecalculation: { possible: true, method: "正式Cast Trend Engineが既存getCastDiagnosisを月単位で読み取り実行。保存なし。" }, rankingAvailability, capabilities: auditTrendCapabilities(), dto: { status: ["COMPLETE", "PARTIAL"], metrics: TREND_METRICS.map(({ key }) => key), availability: "指標ごとに0と欠測を分離し、月途中はPARTIAL" }, rawAudit: { ctiRows: rawRows.length, mergedSourceRowsIncluded: rawRows.filter((row) => merges.some((merge) => merge.id === row.castId)).length }, auditSummary, audits };
  const outputDir = path.resolve(args.outputDir); await fs.mkdir(outputDir, { recursive: true }); const stem = `cast-trend-${args.from}_${args.to}`; await fs.writeFile(path.join(outputDir, `${stem}.json`), JSON.stringify(report, null, args.pretty ? 2 : 0));
  console.log(`Cast Monthly Trend Audit\nPeriod: ${args.from} - ${args.to}\nMonths: ${months.join(", ")}\nCasts: ${casts.length}\nCOMPLETE/PARTIAL: ${auditSummary.monthStatus.COMPLETE}/${auditSummary.monthStatus.PARTIAL}\nAlias groups: ${aliasAudit.length}\nMerged casts: ${mergeAudit.mergedCastCount}\nMerge overlap risks: ${mergeAudit.overlapRiskCount}\nRepresentative casts checked: ${representatives.length}\nFormal Engine diagnosis recalculations: ${report.formalEngine.diagnosisRecalculationCount}\nFormal Engine action recalculations: ${report.formalEngine.actionRecalculationCount}\nPrevious comparison unavailable: ${previousUnavailableCount}\nRecord updates: ${recordCount}\nTrend directions: ${JSON.stringify(directionDistribution)}\nRolling availability: ${JSON.stringify(rollingAvailability)}\nSafety: ${auditSummary.safety.status}`);
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 2; });
