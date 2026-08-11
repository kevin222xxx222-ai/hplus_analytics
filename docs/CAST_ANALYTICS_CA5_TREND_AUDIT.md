# Cast Analytics CA-5.0 月次推移データ監査

## 結論

2026-04〜2026-08の月次スナップショットは、既存の `getCastDiagnosis` を月単位で再実行することで構築可能です。0と欠測は分離され、2026-08は `PARTIAL` として扱えます。

ただし、Heaven/Townの媒体値は2026-06以降に有効行が増えるため、4〜5月を0補完してはいけません。また、同名表示のキャストが複数ID存在するため、Trendのキーは表示名ではなく `castId` とします。

## 監査条件

- 対象期間: 2026-04-01〜2026-08-31
- 月数: 5（2026-04〜2026-08）
- 確定済みImportBatchのみ
- merged済みソースは既存Diagnosis経路と同様に除外
- 2026-08は実行日（2026-08-05）時点で未完了のため `PARTIAL`
- 出力: `artifacts/audits/cast-trend/cast-trend-2026-04-01_2026-08-31.json`（Git管理対象外）

## 月別可用性（全Cast IDを母数）

`VALUE / ZERO / MISSING / UNAVAILABLE` の順で記録しています。

| 月 | 状態 | 母数 | 女子報酬 | Town UU | 本指名率 |
|---|---|---:|---|---|---|
| 2026-04 | COMPLETE | 196 | 65 / 16 / 115 / 0 | 0 / 0 / 115 / 81 | 39 / 23 / 134 / 0 |
| 2026-05 | COMPLETE | 196 | 69 / 16 / 111 / 0 | 0 / 0 / 111 / 85 | 39 / 26 / 131 / 0 |
| 2026-06 | COMPLETE | 196 | 65 / 14 / 117 / 0 | 77 / 0 / 117 / 2 | 37 / 25 / 134 / 0 |
| 2026-07 | COMPLETE | 196 | 65 / 18 / 113 / 0 | 81 / 0 / 113 / 2 | 39 / 22 / 135 / 0 |
| 2026-08 | PARTIAL | 196 | 0 / 0 / 196 / 0 | 0 / 0 / 196 / 0 | 0 / 0 / 196 / 0 |

写真指名、リピート、出勤・結果系を含む全19指標をJSONへ出力しています。`UNCOMPUTABLE` は分母0等の算出不能であり、月次の欠測 `MISSING` とは別状態として保持します。

## Alias / merged / 入退店

- Cast ID: 196
- Aliasグループ: 172
- 未紐付・未解決Alias: 0グループ
- 逆転した有効期間: 0件
- merged済みCast: 10件
- merged元・統合先が同月に同時実績を持つ重複リスク: 0件
- 入退店境界に該当するCast: 24件

入店前・退店後の月は0ではなく `MISSING` とします。表示名が同じCast（例: 「まゆ」）も確認されたため、Alias/Trendの自然キーは `castId + month` とし、名前で統合しません。

## 代表Cast（4〜8月）

あゆみ、のの、まゆ、ゆあ、まりな、りあを監査しました。全員について5月次行（4月〜8月）が生成され、8月は `PARTIAL` です。結果系の月次値は各Castの実績月で `VALUE` / `ZERO`、媒体値は媒体未提供月に `UNAVAILABLE` または `MISSING` となります。

「まゆ」は同名の別Cast IDが存在し、片方は2026-07-14入店・同日退店として記録されています。従って、代表出力・今後の画面ともに名前ではなくIDを表示・選択する必要があります。

## 月次DTO案

```ts
type CastMonthlyTrend = {
  castId: string;
  month: string;
  status: "COMPLETE" | "PARTIAL";
  metrics: {
    femaleReward: Metric;
    hourlyReward: Metric;
    contracts: Metric;
    attendanceDays: Metric;
    workingHours: Metric;
    contractsPerDay: Metric;
    contractsPerHour: Metric;
    townPv: Metric;
    townUu: Metric;
    heavenAccess: Metric;
    heavenDiary: Metric;
    photoNominations: Metric;
    photoNominationShare: Metric;
    photoNominationsPerHour: Metric;
    photoNominationsPer100Uu: Metric;
    mainNominations: Metric;
    mainNominationRate: Metric;
    repeatCount: Metric;
    repeatShare: Metric;
  };
  availability: Record<string, "VALUE" | "ZERO" | "MISSING" | "UNAVAILABLE" | "UNCOMPUTABLE">;
  confidence: Confidence;
};
```

現時点では監査DTOのみで、本番API・UIへは接続していません。

## Trend Engine候補

| 指標 | 判定 |
|---|---|
| 前月比 | ○ |
| 前年同月比 | △（2025年の同一定義データ確認が必要） |
| 3か月平均 / 6か月平均 | ○（有効月のみで計算し、欠測を0補完しない） |
| 最高値 / 最低値 | ○ |
| 最高時給更新 / 過去最高報酬 | ○ |
| 月順位 | ○（同月・同指標・有効値の母集団を固定） |
| 上昇率 | ○（比較不能・分母0は算出不能） |

上昇・横ばい・下降・変動大・データ不足の判定は、閾値を別途正式化してから実装します。

## グラフ候補（優先順）

1. 平均時給、女子報酬、本指名率
2. 100UUあたり写真指名、Town UU、写真指名
3. リピート構成比
4. Heaven写メ日記

異なる単位を同一軸に混在させず、欠測値は0として描画しません。

## Action連携

既存Actionの種別に応じて、次の指標を優先表示できます。例えば `REVIEW_REPEAT_CONVERSION` は本指名率・リピート構成比、`REVIEW_PAGE_TRAFFIC` はTown UU・Heavenアクセスを優先します。これは表示優先順位であり、ActionやDiagnosisの再判定ではありません。

## 月別Diagnosis / Action再計算

可能です。監査CLIは各月について既存 `getCastDiagnosis` を読み取り実行します。結果はDBへ保存せず、CA-5.1でTrend Engineへ渡す入力候補として扱います。

## 推奨実装順

1. `castId + month` のTrend入力DTOを確定
2. 月途中・入退店・媒体未掲載のAvailabilityを確定
3. 前月比と3か月平均を純粋関数で実装
4. Trend判定閾値とConfidenceを設計
5. Action種別ごとの表示優先度を接続
6. UI・グラフを実装

## 監査成果物

- [監査CLI](/Users/matsu/Documents/Codex/HPlus_Analytics/scripts/audit-cast-trend.ts)
- [監査Service / 純粋関数](/Users/matsu/Documents/Codex/HPlus_Analytics/src/lib/analytics/cast-trend/audit.ts)
- [監査テスト](/Users/matsu/Documents/Codex/HPlus_Analytics/src/lib/analytics/cast-trend/audit.test.ts)

今回、Trend Engine、API、UI、DB、Prisma、Migration、Diagnosis、Comparison、Actionの変更は行っていません。

## CA-5.1実装同期

CA-5.1で、上記監査結果を正式Trend Engineへ接続しました。

- 自然キー: `castId + month`
- API: `GET /api/analytics/cast/[castId]/trend`
- クエリ: `from`, `to`, `includeDiagnosis`, `includeAction`
- 最大期間: 24か月
- 月途中: `PARTIAL`（表示ラベルは暫定）
- 前月比較: 直前カレンダー月のみ。欠測月を飛ばさない
- 3/6か月平均: カレンダー窓。確定月のみを有効値として集計し、有効月数を保持
- Trend方向: `RISING / FLAT / FALLING / VOLATILE / INSUFFICIENT_DATA`
- 最高値・最低値: VALUE/ZEROのみ対象。PARTIALの最高値は暫定記録
- Action Focus: 現在Actionの表示優先指標だけを決定し、Trend判定は変更しない
- `includeDiagnosis=true` / `includeAction=true` のときのみ、現在ルールで月次再計算

正式Engine接続後の監査CLI出力:

- 代表Trend生成: 6代表名・同名Castを含む22 Trend結果
- 月次Diagnosis再計算: 22件
- 月次Action再計算: 22件
- merged重複リスク: 0件

Diagnosis/Actionの値は当時の履歴ではなく、「現在のルールによる再計算」です。
