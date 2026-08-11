import fs from "node:fs/promises";
import path from "node:path";
import { aggregateHeavenMediaFunnel, type HeavenMediaFunnelRow } from "@/lib/analytics/cast-media-funnel";

const parse = (argv: string[]) => Object.fromEntries(argv.map((arg) => arg.replace(/^--/, "").split("=")).filter(([key, value]) => key && value)) as Record<string, string>;
const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

async function main() {
  const args = parse(process.argv.slice(2));
  if (!validDate(args.from) || !validDate(args.to) || args.from > args.to) throw new Error("Usage: npm run audit:cast-media-funnel -- --from=YYYY-MM-DD --to=YYYY-MM-DD");
  process.loadEnvFile?.(".env");
  const { prisma } = await import("@/lib/prisma");
  const kasukabe = await prisma.store.findFirst({ where: { code: "KASUKABE", isActive: true }, select: { id: true, shortName: true } });
  if (!kasukabe) throw new Error("KASUKABE_STORE_NOT_FOUND");
  const from = new Date(`${args.from}T00:00:00Z`);
  const [rows, previous, casts] = await Promise.all([
    prisma.heavenCastDaily.findMany({ where: { storeId: kasukabe.id, businessDate: { gte: from, lte: new Date(`${args.to}T23:59:59.999Z`) }, metricKey: { in: ["my_girl", "okini_talk_sent"] }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } }, cast: { mergedIntoCastId: null } }, select: { castId: true, businessDate: true, metricKey: true, rawValue: true, deltaValue: true, valueKind: true, rawValueStatus: true } }),
    prisma.heavenCastDaily.findMany({ where: { storeId: kasukabe.id, businessDate: { lt: from }, metricKey: "my_girl", importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } }, cast: { mergedIntoCastId: null } }, orderBy: { businessDate: "desc" }, select: { castId: true, businessDate: true, metricKey: true, rawValue: true, deltaValue: true, valueKind: true, rawValueStatus: true } }),
    prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true } }),
  ]);
  const toRow = (row: (typeof rows)[number]): HeavenMediaFunnelRow => ({ castId: row.castId!, businessDate: row.businessDate, metricKey: row.metricKey, rawValue: row.rawValue === null ? null : Number(row.rawValue), deltaValue: row.deltaValue === null ? null : Number(row.deltaValue), valueKind: row.valueKind, rawValueStatus: row.rawValueStatus });
  const result = aggregateHeavenMediaFunnel({ rows: rows.filter((row) => row.castId).map(toRow), previousSnapshots: previous.filter((row) => row.castId).map(toRow), from: args.from, to: args.to });
  const byName = new Map(casts.map((cast) => [cast.id, cast.displayName]));
  const records = [...result.entries()].map(([castId, aggregate]) => ({ castId, castName: byName.get(castId) ?? null, ...aggregate }));
  const summary = { period: { from: args.from, to: args.to }, store: kasukabe, source: "Heaven heaven_cast_daily (Kasukabe only)", rows: rows.length, previousSnapshotRows: previous.length, castCount: records.length, availability: { myGirl: Object.fromEntries([...new Set(records.map((row) => `${row.heavenMyGirlAdds.availability}${row.heavenMyGirlAdds.isPartial ? ":PARTIAL" : ""}`))].map((key) => [key, records.filter((row) => `${row.heavenMyGirlAdds.availability}${row.heavenMyGirlAdds.isPartial ? ":PARTIAL" : ""}` === key).length])), talks: Object.fromEntries([...new Set(records.map((row) => row.heavenFavoriteTalks.availability))].map((key) => [key, records.filter((row) => row.heavenFavoriteTalks.availability === key).length])) }, negativeSnapshotTransitions: records.reduce((sum, row) => sum + row.negativeDeltaCount, 0), records };
  const outputDir = path.resolve(args["output-dir"] ?? "artifacts/audits/cast-media-funnel"); await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `cast-media-funnel-${args.from}_${args.to}.json`), JSON.stringify(summary, null, 2));
  console.log(`Cast Media Funnel Audit\nPeriod: ${args.from} - ${args.to}\nStore: ${kasukabe.shortName}\nRows: ${rows.length}\nCasts: ${records.length}\nNegative snapshot transitions: ${summary.negativeSnapshotTransitions}\nAvailability: ${JSON.stringify(summary.availability)}`);
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 2; });
