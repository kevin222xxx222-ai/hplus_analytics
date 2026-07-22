import { formatDateOnly } from "@/lib/date";

export const HEAVEN_METRIC_LABELS: Record<string, string> = {
  page_access: "女の子ページアクセス",
  diary_posts: "写メ日記投稿数",
  my_girl: "マイガール数",
  mitene_sent: "ミテネ送信数",
  okini_talk_sent: "オキニトーク送信数",
  attendance_notice: "出勤通知数",
  diary_notice: "写メ日記通知数",
  "お気に入り数_マイガール": "お気に入り数（マイガール）",
  "お気に入り数_マイショップ": "お気に入り数（マイショップ）",
  "アクション数_ヨヤク": "アクション数（予約）",
  "アクション数_総数": "アクション数（総数）",
  "アクション数_電話": "アクション数（電話）",
  "アクセス媒体_スマホ": "アクセス（スマートフォン）",
  "アクセス媒体_パソコン": "アクセス（パソコン）",
  "アクセス総数": "アクセス総数",
  "オキニトーク_送信人数": "オキニトーク送信人数",
  "オキニトーク_送信回数": "オキニトーク送信回数",
  "オキニトーク_送信女の子人数": "オキニトーク送信女子人数",
  "プラチナメール受信者数_マイヘブン受信": "プラチナメール受信者数（マイヘブン）",
  "プラチナメール受信者数_メール受信": "プラチナメール受信者数（メール）",
  "プラチナメール配信回数": "プラチナメール配信回数",
  "ミテネ送信数": "ミテネ送信数",
  "写メ日記投稿数": "写メ日記投稿数",
  "即ヒメ登録数": "即ヒメ登録数",
  "口コミ": "口コミ",
  "通知数_写メ日記": "通知数（写メ日記）",
  "通知数_出勤": "通知数（出勤）",
  "写メ日記_動画__フリーポス_時間限定_マイガール限定": "写メ日記動画（フリーポス・時間限定・マイガール限定）",
  "写メ日記_動画__フリーポス_時間限定_通常": "写メ日記動画（フリーポス・時間限定）",
  "写メ日記_動画__マイガール限定": "写メ日記動画（マイガール限定）",
  "写メ日記_動画__通常": "写メ日記動画（通常）",
  "写メ日記_画像_テキスト__フリーポス_時間限定_マイガール限定": "写メ日記画像・テキスト（フリーポス・時間限定・マイガール限定）",
  "写メ日記_画像_テキスト__フリーポス_時間限定_通常": "写メ日記画像・テキスト（フリーポス・時間限定）",
  "写メ日記_画像_テキスト__マイガール限定": "写メ日記画像・テキスト（マイガール限定）",
  "写メ日記_画像_テキスト__通常": "写メ日記画像・テキスト（通常）",
};

export function heavenMetricLabel(key: string) {
  return HEAVEN_METRIC_LABELS[key] ?? key.replaceAll("_", " ");
}

export type HeavenAnalyticsRecord = {
  businessDate: Date;
  metricKey: string;
  rawValue: unknown;
  deltaValue: unknown;
  valueKind: string;
  rawValueStatus: string;
};

function numeric(value: unknown) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function aggregateHeavenMetric(records: HeavenAnalyticsRecord[]) {
  const usable = records.filter((r) => r.rawValueStatus === "VALUE" && numeric(r.rawValue) !== null).sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime());
  const valueKind = records[0]?.valueKind ?? "DAILY_EVENT";
  const byDate = new Map<string, number>();
  for (const row of usable) {
    const value = numeric(row.rawValue)!;
    byDate.set(formatDateOnly(row.businessDate), (byDate.get(formatDateOnly(row.businessDate)) ?? 0) + value);
  }
  const values = usable.map((r) => numeric(r.rawValue)!).filter((v) => v !== null);
  const firstValue = values[0] ?? null;
  const lastValue = values.at(-1) ?? null;
  const deltaSum = usable.reduce((sum, r) => sum + (numeric(r.deltaValue) ?? 0), 0);
  return {
    valueKind,
    firstValue,
    lastValue,
    change: firstValue === null || lastValue === null ? null : lastValue - firstValue,
    periodValue: valueKind === "SNAPSHOT" ? lastValue : values.reduce((sum, value) => sum + value, 0),
    deltaSum: valueKind === "SNAPSHOT" ? deltaSum : null,
    daily: [...byDate.entries()].map(([date, value]) => ({ date, value })),
  };
}

export function previousRange(from: Date, to: Date) {
  const span = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const previousTo = new Date(from); previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo); previousFrom.setUTCDate(previousFrom.getUTCDate() - span + 1);
  return { from: previousFrom, to: previousTo };
}

export function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
