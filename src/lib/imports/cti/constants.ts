import { StoreCode } from "@/generated/prisma/client";

export const TARGET_SHEETS: Record<string, StoreCode> = {
  "若妻淫乱倶楽部春日部店": StoreCode.KASUKABE,
  "若妻淫乱倶楽部越谷店": StoreCode.KOSHIGAYA,
  "若妻淫乱倶楽部野田店": StoreCode.NODA,
};

export const EXCLUDED_CAST_NAMES = new Set([
  "本日の周知&引継ぎ事項(春日部店)",
  "本日の周知&引継ぎ事項(僕店)",
  "本日の周知&引継ぎ事項(久喜店)",
]);

export const COLUMN_DEFINITIONS = {
  castName: ["女子名", "キャスト名", "名前"],
  attendanceCount: ["出勤数", "出勤日数"],
  attendanceMinutes: ["出勤時間"],
  reservationCount: ["予約数"],
  cancellationCount: ["キャンセル数"],
  sourceServiceCount: ["接客数"],
  regularNominationCount: ["本指名数"],
  photoNominationCount: ["写真指名数"],
  freeCount: ["フリー数"],
  sourceContractCount: ["成約数"],
  newCount: ["新規成約数"],
  repeatCount: ["リピート成約数"],
  salesAmount: ["料金"],
  castRewardAmount: ["女子報酬"],
  ctiProfitAmount: ["利益"],
  diaryCountCti: ["写メ日記数"],
  sameDayAbsenceCount: ["当日欠勤数"],
  paidOptionCount: ["有料オプション数"],
} as const;

export type CtiColumnKey = keyof typeof COLUMN_DEFINITIONS;

export const REQUIRED_COLUMNS = Object.keys(COLUMN_DEFINITIONS).filter(
  (key) => !["sourceServiceCount", "sourceContractCount", "newCount", "repeatCount"].includes(key),
) as CtiColumnKey[];

export const HEADER_REQUIRED_COLUMNS: CtiColumnKey[] = [
  "attendanceCount",
  "regularNominationCount",
  "photoNominationCount",
  "freeCount",
  "reservationCount",
  "cancellationCount",
  "sourceContractCount",
  "castRewardAmount",
  "ctiProfitAmount",
  "attendanceMinutes",
  "salesAmount",
];

export const HEADER_REQUIRED_MIN_MATCHES = 8;

export const OPTIONAL_BREAKDOWN_COLUMNS: CtiColumnKey[] = ["newCount", "repeatCount"];
