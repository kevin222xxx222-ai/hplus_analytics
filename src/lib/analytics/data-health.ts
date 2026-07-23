import { access } from "node:fs/promises";
import { getStoredImportPath, readPreview } from "@/lib/imports/storage";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnly } from "@/lib/date";

export type HealthState = "正常" | "注意" | "要対応";
export type HealthScope = "ALL" | "KASUKABE" | "KOSHIGAYA" | "NODA";
export type HealthMedia = "ALL" | "CTI" | "TOWN" | "HEAVEN";

export type HealthScoreInput = {
  previewReady: number;
  failed: number;
  waiting: number;
  openErrors: number;
  openWarnings: number;
  missingDays: number;
};

export function calculateDataHealthScore(input: HealthScoreInput) {
  const deduction = Math.min(32, input.previewReady * 8)
    + Math.min(30, input.failed * 10)
    + Math.min(15, input.waiting * 3)
    + Math.min(20, input.openErrors * 2)
    + Math.min(10, input.openWarnings * 0.2)
    + Math.min(25, input.missingDays * 5);
  return Math.max(0, Math.round((100 - deduction) * 10) / 10);
}

export function healthState(score: number, blockingCount: number): HealthState {
  if (blockingCount > 0 || score < 70) return "要対応";
  if (score < 90) return "注意";
  return "正常";
}

type BatchStatus = "PREVIEW_READY" | "WAITING_FOR_CAST_LINK" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "IMPORTING" | "COMPLETED" | "CANCELLED" | string;
type PreviewRow = { storeId?: string; storeCode?: string; castId?: string | null; resolutionStatus?: string; exclusionReason?: string | null; metrics?: { salesAmount?: number | null }; issues?: Array<{ level?: string; code?: string }> };
type PreviewSheet = { rows?: PreviewRow[]; storeCode?: string };
type PreviewShape = { sheets?: PreviewSheet[]; rows?: PreviewRow[]; castRows?: PreviewRow[] };

export type HealthBatch = {
  id: string;
  dataType: string;
  media: "CTI" | "TOWN" | "HEAVEN";
  targetFrom: string;
  targetTo: string;
  filename: string;
  status: BatchStatus;
  store: string;
  pending: number;
  warnings: number;
  errors: number;
  openWarnings: number;
  openErrors: number;
  saveRows: number | null;
  impactAmount: number | null;
  newSales: number | null;
  updatedSales: number | null;
  indeterminateRows: number;
  updatedAt: string;
  priority: "最優先" | "優先" | "確認" | "情報";
  recommendation: string;
  duplicateOf: string | null;
  previewAvailable: boolean;
  sourceAvailable: boolean;
}

export type HealthResult = {
  range: { from: string; to: string };
  scope: HealthScope;
  media: HealthMedia;
  state: HealthState;
  score: number;
  scoreBreakdown: HealthScoreInput;
  summary: { pendingBatches: number; failedBatches: number; unresolved: number; warnings: number; impactAmount: number; latestReflectedDate: string | null; priority: string };
  mediaCards: Array<{ media: "CTI" | "TOWN" | "HEAVEN"; target: string; latest: string | null; completed: number; pending: number; waiting: number; failed: number; openWarnings: number; openErrors: number; pendingRows: number; impactAmount: number | null }>;
  batches: HealthBatch[];
  coverage: Array<{ date: string; cti: string; town: string; heaven: string }>;
  aliases: { openUnmatched: number; ambiguous: number; outside: number; idNoSourceUrl: number; revision: number; skipped: number };
  integrity: Array<{ label: string; state: "正常" | "注意" | "要対応"; detail: string }>;
  latest: { cti: string | null; townCast: string | null; townUrl: string | null; townLanding: string | null; heavenShop: string | null; heavenCast: string | null };
};

const dataTypeMedia = (dataType: string): "CTI" | "TOWN" | "HEAVEN" => dataType.startsWith("CTI") ? "CTI" : dataType.startsWith("TOWN") ? "TOWN" : "HEAVEN";
const dateText = (date: Date) => formatDateOnly(date);
const dayList = (from: Date, to: Date) => { const out: string[] = []; for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(dateText(d)); return out; };
const rowList = (preview: PreviewShape | null) => preview?.rows ?? preview?.castRows ?? preview?.sheets?.flatMap((sheet) => sheet.rows ?? []) ?? [];
const hasIssue = (row: PreviewRow, level: string) => (row.issues ?? []).some((issue) => issue.level === level);

async function readBatchPreview(batchId: string, storagePath: string): Promise<{ preview: PreviewShape | null; sourceAvailable: boolean }> {
  try {
    const preview = await readPreview<PreviewShape>(batchId);
    let sourceAvailable = true;
    try { await access(getStoredImportPath(storagePath)); } catch { sourceAvailable = false; }
    return { preview, sourceAvailable };
  } catch {
    let sourceAvailable = true;
    try { await access(getStoredImportPath(storagePath)); } catch { sourceAvailable = false; }
    return { preview: null, sourceAvailable };
  }
}

export async function getDataHealth(input: { from: Date; to: Date; scope?: HealthScope; media?: HealthMedia }): Promise<HealthResult> {
  const scope = input.scope ?? "ALL";
  const media = input.media ?? "ALL";
  const fromText = dateText(input.from); const toText = dateText(input.to);
  const stores = await prisma.store.findMany({ where: { code: { in: ["KASUKABE", "KOSHIGAYA", "NODA"] } }, select: { id: true, code: true, shortName: true } });
  const scopeStoreIds = new Set(stores.filter((s) => scope === "ALL" || s.code === scope).map((s) => s.id));
  const mediaTypes = media === "ALL" ? ["CTI", "TOWN", "HEAVEN"] : [media];
  const batchRows = await prisma.importBatch.findMany({
    where: { targetFrom: { lte: input.to }, targetTo: { gte: input.from }, dataType: { in: ["CTI_CAST_REPORT", "TOWN_STORE", "TOWN_CAST", "TOWN_URL", "TOWN_LANDING", "HEAVEN_STORE", "HEAVEN_CAST"] }, status: { not: "CANCELLED" } },
    orderBy: [{ targetFrom: "asc" }, { updatedAt: "desc" }],
    select: { id: true, dataType: true, originalFilename: true, fileHash: true, targetFrom: true, targetTo: true, status: true, pendingCount: true, warningCount: true, errorCount: true, updatedAt: true, storagePath: true, importSource: { select: { storeId: true, store: { select: { shortName: true } } } }, errors: { where: { status: "OPEN" }, select: { level: true, errorCode: true } } },
  });
  const batchesInMedia = batchRows.filter((b) => mediaTypes.includes(dataTypeMedia(b.dataType)) && (b.importSource.storeId === null || scopeStoreIds.has(b.importSource.storeId)));
  const batchIds = batchesInMedia.map((b) => b.id);
  const [ctiRows, townCastRows, townUrlRows, townLandingRows, townStoreRows, heavenShopRows, heavenCastRows] = await Promise.all([
    scopeStoreIds.size ? prisma.ctiCastDaily.findMany({ where: { businessDate: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] }, cast: { mergedIntoCastId: null } }, select: { businessDate: true, storeId: true, castId: true, salesAmount: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.townCastDaily.findMany({ where: { date: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] }, cast: { mergedIntoCastId: null } }, select: { date: true, storeId: true, castId: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.townUrlDaily.findMany({ where: { date: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] }, cast: { mergedIntoCastId: null } }, select: { date: true, storeId: true, castId: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.townLandingDaily.findMany({ where: { date: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] }, cast: { mergedIntoCastId: null } }, select: { date: true, storeId: true, castId: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.townStoreDaily.findMany({ where: { date: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] } }, select: { date: true, storeId: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.heavenShopDaily.findMany({ where: { businessDate: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] } }, select: { businessDate: true, storeId: true, importBatchId: true } }) : Promise.resolve([]),
    scopeStoreIds.size ? prisma.heavenCastDaily.findMany({ where: { businessDate: { gte: input.from, lte: input.to }, storeId: { in: [...scopeStoreIds] } }, select: { businessDate: true, storeId: true, metricKey: true, resolutionKey: true, valueKind: true, rawValueStatus: true, importBatchId: true } }) : Promise.resolve([]),
  ]);
  const persistedBatchIds = new Set([...ctiRows, ...townCastRows, ...townUrlRows, ...townLandingRows, ...townStoreRows, ...heavenShopRows, ...heavenCastRows].map((r) => r.importBatchId));
  const ctiSalesByKey = new Map(ctiRows.map((r) => [`${dateText(r.businessDate)}:${r.storeId}:${r.castId}`, r.salesAmount]));
  const impactBatches: HealthBatch[] = [];
  for (const b of batchesInMedia) {
    const mediaName = dataTypeMedia(b.dataType); const openWarnings = b.errors.filter((e) => e.level === "WARNING").length; const openErrors = b.errors.filter((e) => e.level === "ERROR").length;
    const terminal = ["COMPLETED", "CANCELLED"].includes(b.status); const candidate = ["PREVIEW_READY", "WAITING_FOR_CAST_LINK", "FAILED", "COMPLETED_WITH_WARNINGS"].includes(b.status) && !terminal;
    let saveRows: number | null = candidate ? 0 : null; let impactAmount: number | null = candidate ? 0 : null; let newSales: number | null = candidate ? 0 : null; let updatedSales: number | null = candidate ? 0 : null; let indeterminateRows = 0; let previewAvailable = false; let sourceAvailable = false;
    const duplicate = candidate ? batchRows.find((other) => other.id !== b.id && other.dataType === b.dataType && ["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(other.status) && other.fileHash === b.fileHash) : undefined;
    const duplicateOf: string | null = duplicate?.id ?? null;
    if (candidate) {
      const loaded = await readBatchPreview(b.id, b.storagePath); previewAvailable = Boolean(loaded.preview); sourceAvailable = loaded.sourceAvailable;
      if (loaded.preview) {
        const rows = rowList(loaded.preview); const usable = rows.filter((row) => row.resolutionStatus !== "SKIPPED" && row.castId && !hasIssue(row, "ERROR") && typeof row.metrics?.salesAmount === "number");
        indeterminateRows = rows.length - usable.length; saveRows = usable.length;
        if (mediaName === "CTI") {
          let added = 0; let changed = 0;
          for (const row of usable) { const key = `${dateText(b.targetFrom)}:${row.storeId}:${row.castId}`; const sales = Number(row.metrics?.salesAmount ?? 0); const old = ctiSalesByKey.get(key); if (old === undefined) added += sales; else if (old !== sales) changed += sales - old; }
          newSales = added; updatedSales = changed; impactAmount = added + changed;
          if (duplicateOf) { saveRows = 0; impactAmount = 0; newSales = 0; updatedSales = 0; }
        }
      }
    }
    if (duplicateOf) { saveRows = 0; impactAmount = 0; newSales = 0; updatedSales = 0; }
    const priority: HealthBatch["priority"] = duplicateOf ? "情報" : mediaName === "CTI" && candidate && (impactAmount ?? 0) > 0 ? "最優先" : b.status === "FAILED" ? "最優先" : mediaName === "CTI" || candidate ? "優先" : "確認";
    const recommendation = duplicateOf ? "同一ファイルの確定済みBatchを確認" : b.status === "FAILED" ? "元ファイル・previewを確認" : b.status === "WAITING_FOR_CAST_LINK" ? "Alias解決または部分確定を確認" : b.status === "PREVIEW_READY" ? "内容確認後に確定" : "未保存行を確認";
    impactBatches.push({ id: b.id, dataType: b.dataType, media: mediaName, targetFrom: dateText(b.targetFrom), targetTo: dateText(b.targetTo), filename: b.originalFilename, status: b.status, store: b.importSource.store?.shortName ?? (mediaName === "CTI" ? "複数店舗" : "—"), pending: b.pendingCount, warnings: b.warningCount, errors: b.errorCount, openWarnings, openErrors, saveRows, impactAmount, newSales, updatedSales, indeterminateRows, updatedAt: b.updatedAt.toISOString(), priority, recommendation, duplicateOf, previewAvailable, sourceAvailable });
  }
  const activeBatches = impactBatches.filter((b) => !b.duplicateOf);
  const pendingBatches = activeBatches.filter((b) => ["PREVIEW_READY", "WAITING_FOR_CAST_LINK", "COMPLETED_WITH_WARNINGS"].includes(b.status) && (b.pending > 0 || (b.impactAmount ?? 0) > 0)).length;
  const failedBatches = activeBatches.filter((b) => b.status === "FAILED").length;
  const openWarnings = activeBatches.reduce((n, b) => n + b.openWarnings, 0); const openErrors = activeBatches.reduce((n, b) => n + b.openErrors, 0);
  const impactAmount = activeBatches.reduce((n, b) => n + (b.impactAmount ?? 0), 0);
  const unresolved = activeBatches.reduce((n, b) => n + b.pending, 0);
  const days = dayList(input.from, input.to); const ctiDates = new Set(ctiRows.map((r) => dateText(r.businessDate))); const missingDays = mediaTypes.includes("CTI") ? days.filter((d) => !ctiDates.has(d) && !impactBatches.some((b) => b.media === "CTI" && b.targetFrom <= d && b.targetTo >= d && b.status !== "CANCELLED")).length : 0;
  const previewReady = activeBatches.filter((b) => b.status === "PREVIEW_READY").length; const waiting = activeBatches.filter((b) => b.status === "WAITING_FOR_CAST_LINK").length;
  const scoreBreakdown = { previewReady, failed: failedBatches, waiting, openErrors, openWarnings, missingDays }; const score = calculateDataHealthScore(scoreBreakdown); const state = healthState(score, pendingBatches + failedBatches + openErrors);
  const latest = { cti: ctiRows.length ? dateText(ctiRows.reduce((a, b) => a.businessDate > b.businessDate ? a : b).businessDate) : null, townCast: townCastRows.length ? dateText(townCastRows.reduce((a, b) => a.date > b.date ? a : b).date) : null, townUrl: townUrlRows.length ? dateText(townUrlRows.reduce((a, b) => a.date > b.date ? a : b).date) : null, townLanding: townLandingRows.length ? dateText(townLandingRows.reduce((a, b) => a.date > b.date ? a : b).date) : null, heavenShop: heavenShopRows.length ? dateText(heavenShopRows.reduce((a, b) => a.businessDate > b.businessDate ? a : b).businessDate) : null, heavenCast: heavenCastRows.length ? dateText(heavenCastRows.reduce((a, b) => a.businessDate > b.businessDate ? a : b).businessDate) : null };
  const coverage = days.map((date) => ({ date, cti: ctiDates.has(date) ? "反映済み" : impactBatches.some((b) => b.media === "CTI" && b.targetFrom <= date && b.targetTo >= date) ? "未確定" : "未取込", town: [townStoreRows, townCastRows, townUrlRows, townLandingRows].some((rows) => rows.some((r) => dateText(r.date) === date)) ? "反映済み" : "—", heaven: [heavenShopRows, heavenCastRows].some((rows) => rows.some((r) => dateText(r.businessDate) === date)) ? "反映済み" : "累積CSVのため日次判定なし" }));
  const errorRows = await prisma.importError.findMany({ where: { importBatchId: { in: batchIds }, status: "OPEN" }, select: { errorCode: true } }); const aliases = { openUnmatched: errorRows.filter((e) => e.errorCode === "UNMATCHED_CAST").length, ambiguous: errorRows.filter((e) => e.errorCode === "AMBIGUOUS_CAST").length, outside: errorRows.filter((e) => e.errorCode.includes("OUTSIDE")).length, idNoSourceUrl: errorRows.filter((e) => e.errorCode === "ID_NO_SOURCE_URL").length, revision: errorRows.filter((e) => e.errorCode.includes("REVISION")).length, skipped: 0 };
  const duplicateCount = (keys: string[]) => keys.length - new Set(keys).size;
  const ctiDuplicateCount = duplicateCount(ctiRows.map((r) => `${dateText(r.businessDate)}:${r.storeId}:${r.castId}`));
  const townDuplicateCount = [townCastRows, townUrlRows, townLandingRows].reduce((total, rows) => total + duplicateCount(rows.map((r) => `${dateText(r.date)}:${r.storeId}:${r.castId}`)), 0);
  const heavenDuplicateCount = duplicateCount(heavenCastRows.map((r) => `${dateText(r.businessDate)}:${r.storeId}:${r.metricKey}:${r.resolutionKey}`));
  const heavenKindIssues = heavenCastRows.filter((r) => (r.valueKind === "SNAPSHOT" && ["my_girl", "diary_notice"].includes(r.metricKey) === false) || (r.valueKind === "DAILY_EVENT" && ["my_girl", "diary_notice"].includes(r.metricKey))).length;
  const integrity = [
    { label: "CTI自然キー重複", state: ctiDuplicateCount ? "要対応" as const : "正常" as const, detail: ctiDuplicateCount ? `${ctiDuplicateCount}件の重複候補` : "DB一意制約と照合し、期間内の重複なし" },
    { label: "Town自然キー重複", state: townDuplicateCount ? "要対応" as const : "正常" as const, detail: townDuplicateCount ? `${townDuplicateCount}件の重複候補` : "期間内の重複なし" },
    { label: "Heaven自然キー・valueKind", state: heavenDuplicateCount || heavenKindIssues ? "要対応" as const : "正常" as const, detail: heavenDuplicateCount || heavenKindIssues ? `重複${heavenDuplicateCount}件、valueKind不整合${heavenKindIssues}件` : "重複・valueKind不整合なし" },
    { label: "CTI売上NULL", state: ctiRows.some((r) => r.salesAmount === null) ? "要対応" as const : "正常" as const, detail: ctiRows.some((r) => r.salesAmount === null) ? "salesAmount nullあり" : "nullなし" },
    { label: "未確定Batchと実績の不整合", state: "正常" as const, detail: `${persistedBatchIds.size} Batchの実績参照を確認` },
  ];
  const cards = (["CTI", "TOWN", "HEAVEN"] as const).map((m) => { const bs = activeBatches.filter((b) => b.media === m); return { media: m, target: m === "CTI" ? "春日部・越谷・野田" : m === "TOWN" ? "春日部・越谷" : "春日部のみ", latest: m === "CTI" ? latest.cti : m === "TOWN" ? latest.townCast : latest.heavenCast, completed: bs.filter((b) => b.status === "COMPLETED").length, pending: bs.filter((b) => ["PREVIEW_READY", "WAITING_FOR_CAST_LINK", "COMPLETED_WITH_WARNINGS"].includes(b.status)).length, waiting: bs.filter((b) => b.status === "WAITING_FOR_CAST_LINK").length, failed: bs.filter((b) => b.status === "FAILED").length, openWarnings: bs.reduce((n, b) => n + b.openWarnings, 0), openErrors: bs.reduce((n, b) => n + b.openErrors, 0), pendingRows: bs.reduce((n, b) => n + b.pending + (b.saveRows ?? 0), 0), impactAmount: m === "CTI" ? bs.reduce((n, b) => n + (b.impactAmount ?? 0), 0) : null }; });
  return { range: { from: fromText, to: toText }, scope, media, state, score, scoreBreakdown, summary: { pendingBatches, failedBatches, unresolved, warnings: openWarnings, impactAmount, latestReflectedDate: latest.cti, priority: pendingBatches || failedBatches ? "未確定Batchと影響額を最初に確認" : "重大な未反映はありません" }, mediaCards: cards, batches: impactBatches, coverage, aliases, integrity, latest };
}

export function parseHealthDate(value: string | undefined, fallback: Date) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateOnly(value) : fallback; }
