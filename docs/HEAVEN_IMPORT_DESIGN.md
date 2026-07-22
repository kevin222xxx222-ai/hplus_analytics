# Heaven CSV取込設計（Phase 3実装）

更新日: 2026-07-22  
状態: **Parser／プレビュー基盤を実装。実績確定・Alias作成・UI解決は未実装**

## 1. 基本方針

Heavenは月次ファイル内に日次行と月次サマリーが混在し、指標ごとに日次イベントと累積スナップショットが異なる。従って、次を正とする。

1. 日次のraw値を失わない
2. 累積値からの差分は派生値として別管理する
3. 月次サマリーを日次値として二重保存しない
4. CTI/Townの既存取込・集計式を変更しない

## 2. 推奨モデル案

### HeavenShopDaily

長形式の指標factを推奨する。

| 項目 | 型 | 内容 |
|---|---|---|
| id | UUID | 主キー |
| date | DATE | CSVの日付 |
| storeId | UUID | ImportSourceで明示した店舗 |
| importBatchId | UUID | 元ImportBatch |
| metricKey | VARCHAR | 安定した内部指標名 |
| rawValue | DECIMAL/NULL | CSV原値（`---`はNULL） |
| valueKind | ENUM | `DAILY_EVENT` / `SNAPSHOT` |
| deltaValue | DECIMAL/NULL | 前日差分。初日はNULL |
| rawStatus | ENUM | `VALUE` / `BLANK` / `NOT_APPLICABLE` |
| sourceColumn | VARCHAR | 元列名 |
| sourceRowNumber | INT | 元行番号 |
| createdAt/updatedAt | TIMESTAMPTZ | 監査 |

一意キーは`date + storeId + metricKey`。月次サマリーは別の`HeavenMonthlySummary`（またはImportBatch.metadata）にraw保存し、Daily表へ混在させない。

### HeavenCastDaily

| 項目 | 型 | 内容 |
|---|---|---|
| id | UUID | 主キー |
| date | DATE | 日次行の日付 |
| storeId | UUID | 取込対象店舗 |
| castId | UUID NULL | 未紐付け時NULL |
| sourceCastName | VARCHAR | CSV列名の原文 |
| importBatchId | UUID | 元ImportBatch |
| metricKey | VARCHAR | `page_access`等 |
| rawValue | DECIMAL/NULL | 原値 |
| valueKind | ENUM | `DAILY_EVENT` / `SNAPSHOT` |
| deltaValue | DECIMAL/NULL | 累積指標の前日差分 |
| rawStatus | ENUM | 値/空欄/`---` |
| sourceColumn/sourceRowNumber | VARCHAR/INT | 原資料追跡 |
| createdAt/updatedAt | TIMESTAMPTZ | 監査 |

一意キーは`date + storeId + castId + metricKey`。`castId`がNULLの未紐付け行は、別の安定キー（`date + storeId + normalizedSourceCastName + metricKey`）で保持するか、Preview/holding表に分離する。確定後にAlias解決してcastIdを付け替える。

## 3. 保存粒度と差分

- 保存粒度は日次rawを基本とする
- `DAILY_EVENT`: rawValueを日次実績として採用、deltaValueはNULL
- `SNAPSHOT`: rawValueを日次スナップショットとして採用、deltaValue=`当日raw - 前日raw`
- 前日が欠落、月初、またはリセット検知時はdeltaValue=NULL＋WARNING
- 集計画面では、イベント型はSUM、スナップショット型は指定日のLAST_VALUEを使用
- 月次相関分析では、CTI成約日/女子報酬日とHeavenの`date`を同一期間で突合する。累積値をSUMして二重計上しない

## 4. 再取込・差分更新

- 元CSVを`hplus_analytics_uploads`へ保存し、SHA-256をImportBatchに記録
- 完了済み同一SHAは重複スキップ
- 同一月・店舗・種別でSHAが異なる場合は修正版候補として停止し、自動上書きしない
- 再解析は現在のCast/HEAVEN Alias/在籍期間でresolverだけを再実行し、実績を変更しない
- 再確定は自然キーupsert。既存行を単純加算しない
- 累積値の差分は再取込時に全期間を再計算し、途中日だけの差分を固定保存しない

## 5. Heaven Alias運用

- 既存`CastAlias(mediaType=HEAVEN)`を利用。新Aliasテーブルは作らない
- `storeId`は必須（店舗指定なしのグローバルAliasを作らない）
- `validFrom/validTo`はCast在籍期間と整合させる
- 同名候補が複数の場合は自動解決しない
- 改名時はCastNameHistoryとHEAVEN Aliasを追加し、既存実績のcastIdは変更しない
- Alias追加後は同店舗・同正規化名の未紐付け行だけ再解決する

## 6. 未紐付け処理

`castId=NULL`のままPreviewに保持し、ImportBatchを`WAITING_FOR_CAST_LINK`とする。URL/LPのように人物が特定できない状態で数値を別Castへ推測付与しない。

ADMIN操作:

- 既存Cast選択 → HEAVEN Alias追加 → 同店舗・同名の未紐付け行を横断再解決
- 保留 → OPEN ImportErrorを維持
- 新規Cast作成 → 明示理由・在籍開始日・同名確認を必須化。自動作成禁止

未紐付け行は実績表への確定対象外。後日Alias解決時には未保存行だけを自然キーupsertし、既存行を二重加算しない。

## 7. 監査

ImportBatch.metadata.importEventsへ以下を記録する。

- `HEAVEN_PREVIEW_CREATED`
- `HEAVEN_CONFIRMED`
- `HEAVEN_REPARSED`
- `HEAVEN_ALIAS_RESOLVED`
- `HEAVEN_REVISION_HELD`

各イベントに、実行者、日時、SHA、店舗、種別、対象日、保存件数、未紐付け件数、snapshot/delta判定、再計算範囲を保存する。構造不一致・ID不在・日付不正はImportErrorへ保存する。

## 8. Phase 1の実装前確認項目

1. 店舗を画面で明示選択する
2. 指標辞書（特に通知と`tokeiGirl`）を確定する
3. 147名の既存Cast/HEAVEN Aliasとの候補数を読み取り専用で確認する
4. 前月末スナップショットの有無を確認する
5. スキーマmigrationは上記確認後に別途承認を得る

本設計段階では、既存CTI/Townのテーブル、Alias、Cast、MediaListing、ImportBatch、実績値を変更しない。

## 10. Phase 3 metricHint とプレビュー基盤

女子CSVは管理者が次の `metricHint` を選択して送信する。未指定または`UNKNOWN`はプレビュー作成を拒否する。

| metricHint | valueKind |
|---|---|
| PAGE_ACCESS | DAILY_EVENT |
| DIARY_POSTS | DAILY_EVENT |
| MY_GIRL | SNAPSHOT |
| MITENE_SENT | DAILY_EVENT |
| OKINI_TALK_SENT | DAILY_EVENT |
| ATTENDANCE_NOTICE | SNAPSHOT（保守的な扱い） |
| DIARY_NOTICE | SNAPSHOT |

店舗CSVはヘッダー内容から`HEAVEN_SHOP`を検出し、女子metricHint指定を拒否する。アップロードAPIは店舗を明示選択し、SHA-256、保存済み原CSV、ImportBatch、preview.json、未紐付けImportErrorを作成する。CastAlias（`mediaType=HEAVEN`）は読み取り専用で解決し、Alias作成・Heaven実績テーブルへの確定保存は行わない。

Previewには店舗、指標、valueKind、期間、行数、未紐付け人数／行数、曖昧件数、警告／エラー件数、および各Cast行の解決状態を保持する。未紐付け・曖昧候補があれば`WAITING_FOR_CAST_LINK`、全行解決なら`PREVIEW_READY`とする。

## 9. Parser Phase 2実装

`src/lib/imports/heaven/parser.ts`に、DBへ書き込まない共通CSV parserを追加した。

- BOM付きUTF-8、引用符、引用符内改行、カンマを解析
- 店舗CSVはヘッダー内容（`アクセス総数`、`アクション数_総数`）から`HEAVEN_SHOP`と判定
- 日付、元列名、metricKey、rawValue、rawValueStatus、sourceRowNumberを生成
- 女子CSVはcast名横持ちの30日行を`HeavenParsedCastRow`へ展開
- `my_girl`/`diary_notice`を明示ヒントで渡した場合は`SNAPSHOT`として扱う
- 空欄は`BLANK`、`---`は`NOT_APPLICABLE`、数値は`VALUE`
- `合計`、`今月`、`先月`、`増減`は日次行から除外しsummary rawとして返す

重要な安全策として、女子7ファイルはCSV内容が同じ「月＋キャスト名ヘッダー」形式で、指標名を含まない。したがって、ファイル名を使わずに`PAGE_ACCESS`、`DIARY_POSTS`等へ推測分類しない。内容だけでは判定不能な場合は`UNKNOWN`を返し、metricKey/valueKindの外部ヒントがない限り確定保存へ進めない。
