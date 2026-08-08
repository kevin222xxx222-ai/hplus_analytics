# Cast Analytics CA-0 データ監査・実装前調査

監査日: 2026-08-01  
対象期間: 2026-07-01〜2026-07-31  
対象: 確定済みImportBatch、mergedIntoCastId IS NULL の実績

## 結論

Cast Analytics v1の診断Engineはまだ実装せず、CA-0では以下を確認した。

- CTIはキャスト・店舗・営業日単位で取得でき、売上、女子報酬、成約、写真指名、本指名、フリー、出勤時間を利用できる。
- Townは `TownCastDaily` にキャスト・店舗・日次のPV/UUが保存され、2026年7月はCTIのメイン出勤者と紐付く。ただし予約・成約との媒体経路は持たない。
- Heavenは `HeavenCastDaily` にキャスト・店舗・日次の `page_access` / `diary_posts` が保存される。実データは春日部のみを対象とし、越谷・野田へ0補完してはいけない。
- 店舗ごとの比較母集団は大きく異なる。春日部は比較群を構成できるが、越谷・野田は2026年7月の正式条件では比較群不足になる。
- `diaryCountCti` はCTI上の旧フィールドとして残るが、Cast Analyticsの正式な写メ日記指標には使用しない。正式な投稿数はHeaven `diary_posts` とする。

## 既存Architecture監査

| 項目 | 現状 | CA-1での扱い |
|---|---|---|
| 既存Cast画面 | `/analytics/cast`、`/analytics/casts`、`/analytics/casts/[id]` が存在 | 新診断一覧は既存画面と役割を分離して段階追加 |
| 既存API | `/api/analytics/cast` は1名の統合分析DTOを返す | CA-1では比較群・診断DTOを別サービス境界で追加 |
| Query | Prisma Query/Integrationを経由 | Prisma ModelをEngineへ直接渡さない |
| 診断Engine | CAST DISCOVERY等の既存判定はあるが、本要件の診断タイプEngineは未実装 | CA-1で設定オブジェクトと純粋関数を追加 |
| UI | 既存Cast AnalyticsはCause/Evidence/Action構成 | CA-2以降で一覧・個別ページへ拡張 |

## データ取得元と粒度

### CTI

`CtiCastDaily` の正式粒度は `businessDate × storeId × castId`。利用可能な主な列は次のとおり。

- `attendanceCount`, `attendanceMinutes`
- `salesAmount`, `castRewardAmount`, `contractCount`
- `regularNominationCount`, `photoNominationCount`, `freeCount`
- `reservationCount`, `cancellationCount`, `serviceCount`
- `newCount`, `repeatCount`, `paidOptionCount`

### Town

`TownCastDaily` の正式粒度は `date × storeId × castId`。`pv`, `uu`, `telTapUu`, `isListed` を取得できる。2026年7月はCTI対象キャストとの紐付きを確認できた。

### Heaven

`HeavenCastDaily` の正式粒度は `businessDate × storeId × metricKey × castId`。`page_access` と `diary_posts` は日次値として扱う。`rawValueStatus` が `VALUE` の行だけを有効値とし、欠測を0へ変換しない。

2026年7月実績では Heaven 行は7,800行（`page_access` 3,900、`diary_posts` 3,900）。Heaven掲載は春日部のみで、店舗別Unavailable判定が必要。

## 2026年7月分布

| 店舗 | CTI実績キャスト | メイン出勤者（2日以上） | 比較候補（4日以上または20時間以上、成約5本以上） | 結果上位群 | 時給3,000円以上 | UU100以上 |
|---|---:|---:|---:|---:|---:|---:|
| 春日部 | 83 | 56 | 36 | 9 | 13 | 55 |
| 越谷 | 55 | 3 | 0 | 0 | 2 | 3 |
| 野田 | 44 | 2 | 0 | 0 | 0 | 0 |

結果上位群の時給上位25%境界は春日部で約3,588.6円/時間、中央値は約2,476.8円/時間だった。越谷・野田は比較候補0名のため、結果上位群中央値を算出できない。

春日部メイン出勤者の平均は出勤7.55日、稼働55.58時間。Townキャスト実績は春日部56名、越谷3名と紐付き、野田はメイン出勤者に紐付くTown値を確認できなかった。Heavenキャスト実績は春日部に紐付き、越谷・野田には付与しない。

## 診断実装前の注意

1. 比較群不足を診断タイプへ無理に割り当てず、`INSUFFICIENT_DATA` とする。
2. UUがないキャストの「流入不足」や「転換不足」を判定しない。
3. 本指名率は成約10本未満では正式判定しない。
4. 写真指名効率は分母（UU、日数、時間）のAvailabilityを保持する。
5. Heavenの非掲載店舗は0ではなく `UNAVAILABLE`。
6. 写メ日記はCTI `diaryCountCti` ではなくHeaven `diary_posts`を正式参照する。
7. 上流（ページ流入）の母数不足時に、下流（再来）を主診断にしない。

## CA-1実装前に確認が必要な事項

- Townのキャスト別PV/UUが「日次スナップショット」か「期間イベント」かを業務定義として確定する。
- Heaven `page_access` の値が日次イベントか累計差分かを取込ファイル単位で確認する。
- 結果上位群を店舗移動期間・在籍期間で絞る正式ルールを確定する。
- 近似稼働量（±40%）の比較対象不足時に、店舗中央値・直近3か月へ拡張する境界を確定する。
- Cast Analytics専用の診断一覧APIを既存 `/api/analytics/cast` と分離するか決定する。

## 推奨Implementation Order

1. CA-1: 閾値定数、Comparison Group、Confidence、Availability、診断純粋関数とユニットテスト
2. CA-2: 改善対象者一覧と判定基準表示
3. CA-3: 個別ページの結果→流入→写真指名→再来構造
4. CA-4: 新規獲得・再来確認ポイント
5. CA-5: 月別・日別推移とStore Day Detail導線
6. CA-6: 実データ照合、モバイル、空状態、Feature Freeze

本監査ではUI、API、Engine、DB、Import、実績データを変更していない。
