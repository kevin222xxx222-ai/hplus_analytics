# Phase H Google Drive 自動Import Source Audit

更新日: 2026-08-12  
対象版: `v1.0.1-production-ready`  
状態: **調査のみ（コード・DB・Prisma・設定変更なし）**

## 1. 結論

現在の実装で、実際にImport可能な入力は次の7系統です。

- CTI女子別レポート: `女子別レポート_YYYYMMDD.xlsx`
- Town店舗別: `dto.jp-shop-..._YYYYMMDD_to_YYYYMMDD.csv`
- Town女子別: `dto.jp-gal-..._YYYYMMDD_to_YYYYMMDD.csv`（一括経路は1日限定）
- Town URL別: `dto.jp-url-..._YYYYMMDD_to_YYYYMMDD.csv`（一括経路は1日限定）
- Town LP別: `dto.jp-lp-..._YYYYMMDD_to_YYYYMMDD.csv`（一括経路は1日限定）
- Heaven店舗CSV（ヘッダー内容で判定）
- Heaven女子CSV 7指標（内容だけでは指標判定不能。現在は管理者の`metricHint`選択が必須）

Phase H v1では、Drive上の**フォルダIDを店舗・種別の正**とし、ファイル名は補助検証に限定するのが安全です。特に「越谷はファイル名末尾`(1)`」という旧運用判定は、現行コードには残っていません。一括Townではフォルダ設定（春日部/越谷）が店舗を決定します。

## 2. 現行共通仕様

`ImportSource`には`MANUAL_UPLOAD`と`GOOGLE_DRIVE`のenum、`folderPath`欄がありますが、Google Drive APIの検知・download・scheduler・自動confirm経路は未実装です。現在の画面・APIで使えるのは原則`MANUAL_UPLOAD`、CTI/Townだけはローカル固定フォルダのBulk経路も存在します。

全経路で、原本は`UPLOAD_DIR`（Dockerでは`/app/data/uploads`、永続volume）へ保存し、SHA-256と`ImportBatch`を記録します。確定前にpreview・エラー・Alias/Cast解決を行い、完了済み同一SHAは重複扱いです。MISSING/UNAVAILABLEを0へ補完する処理はありません。

## 3. Source別一覧

| Source | Store | File Type | Current Import | Analytics Used | Phase H Auto Import | Recommended Drive Folder |
|---|---|---|---|---|---|---|
| CTI_CAST_REPORT | 春日部・越谷・野田（3シート） | XLSX | MANUAL_UPLOAD + CTI_BULK | CTI売上、報酬、成約、出勤、指名、顧客構成、曜日/Cast分析 | **REQUIRED** | `CTI/`直下（1ファイルに3店舗シート） |
| TOWN_STORE | 春日部 | CSV | MANUAL_UPLOAD + Town Bulk | 店舗PV/UU/TEL、Store/Weekday/Management | **REQUIRED** | `TOWN/KASUKABE/STORE_DAILY/YYYY/MM/` |
| TOWN_STORE | 越谷 | CSV | MANUAL_UPLOAD + Town Bulk | 店舗PV/UU/TEL、Store/Weekday/Management | **REQUIRED** | `TOWN/KOSHIGAYA/STORE_DAILY/YYYY/MM/` |
| TOWN_CAST | 春日部 | CSV | MANUAL_UPLOAD + Town Bulk | Cast Town PV/UU/TEL、媒体ファネル補助 | **REQUIRED** | `TOWN/KASUKABE/CAST_DAILY/YYYY/MM/` |
| TOWN_CAST | 越谷 | CSV | MANUAL_UPLOAD + Town Bulk | Cast Town PV/UU/TEL、媒体ファネル補助 | **REQUIRED** | `TOWN/KOSHIGAYA/CAST_DAILY/YYYY/MM/` |
| TOWN_URL | 春日部 | CSV | MANUAL_UPLOAD + Town Bulk | URL別分析、Store/Cast参照 | **OPTIONAL** | `TOWN/KASUKABE/URL_DAILY/YYYY/MM/` |
| TOWN_URL | 越谷 | CSV | MANUAL_UPLOAD + Town Bulk | URL別分析、Store/Cast参照 | **OPTIONAL** | `TOWN/KOSHIGAYA/URL_DAILY/YYYY/MM/` |
| TOWN_LANDING | 春日部 | CSV | MANUAL_UPLOAD + Town Bulk | LP別分析、Store/Cast参照 | **OPTIONAL** | `TOWN/KASUKABE/LP_DAILY/YYYY/MM/` |
| TOWN_LANDING | 越谷 | CSV | MANUAL_UPLOAD + Town Bulk | LP別分析、Store/Cast参照 | **OPTIONAL** | `TOWN/KOSHIGAYA/LP_DAILY/YYYY/MM/` |
| HEAVEN_STORE | 春日部のみ | CSV | MANUAL_UPLOADのみ | Heaven店舗指標、Marketing/Heaven分析 | **REQUIRED** | `HEAVEN/KASUKABE/SHOP/YYYY/MM/` |
| HEAVEN_CAST / PAGE_ACCESS | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | Cast/StoreのHeavenアクセス | **REQUIRED** | `HEAVEN/KASUKABE/GIRL/PAGE_ACCESS/YYYY/MM/` |
| HEAVEN_CAST / DIARY_POSTS | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | 写メ日記、Cast/Store/Weekday | **REQUIRED** | `HEAVEN/KASUKABE/GIRL/DIARY_POSTS/YYYY/MM/` |
| HEAVEN_CAST / MY_GIRL | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | 媒体ファネル、Cast overview | **OPTIONAL** | `HEAVEN/KASUKABE/GIRL/MY_GIRL/YYYY/MM/` |
| HEAVEN_CAST / MITENE_SENT | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | Marketing、媒体ファネル補助 | **OPTIONAL** | `HEAVEN/KASUKABE/GIRL/MITENE_SENT/YYYY/MM/` |
| HEAVEN_CAST / OKINI_TALK_SENT | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | Cast媒体ファネル、Marketing一部 | **OPTIONAL** | `HEAVEN/KASUKABE/GIRL/OKINI_TALK_SENT/YYYY/MM/` |
| HEAVEN_CAST / ATTENDANCE_NOTICE | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | Cast overview/Marketing定義あり | **FUTURE** | `HEAVEN/KASUKABE/GIRL/ATTENDANCE_NOTICE/YYYY/MM/` |
| HEAVEN_CAST / DIARY_NOTICE | 春日部のみ | CSV | MANUAL_UPLOADのみ（metricHint必須） | Cast overview/Marketing定義あり | **FUTURE** | `HEAVEN/KASUKABE/GIRL/DIARY_NOTICE/YYYY/MM/` |
| その他 | 野田、久喜、未定義媒体 | — | 現行の正式Import経路なし | 対象外方針/未実装 | **NOT REQUIRED** | 作成しない |

`REQUIRED`はv1の運用母集団に必要、`OPTIONAL`は保存・分析価値があるが欠測でも基幹分析を止めない、`FUTURE`は仕様確認または接続が不足、`NOT REQUIRED`は現行対象外を意味します。これは実装承認ではなく、Drive格納対象の優先度です。

## 4. CTI監査

### 4.1 正式Import

- 正式名: CTI女子別レポート
- `ImportDataType`: `CTI_CAST_REPORT`
- `MediaType`: `CTI`
- 形式: `.xlsx`のみ（`.xls`、CSV、その他XLSXはBulk対象外）
- ファイル名: BulkではUnicode NFC後に厳密に`女子別レポート_YYYYMMDD.xlsx`。通常MANUAL_UPLOADは拡張子/MIME/XLSX ZIPを検証するが、日付ファイル名判定はBulk固有。
- 粒度: 日次。`ImportMode.DAILY`で対象開始日=終了日が確定可能。`MONTH_TO_DATE`/`MONTHLY_FINAL`/`UNKNOWN`は、日別内訳がない限りプレビューのみで日次へ配賦しない。
- 1ファイル: 1冊に最大3店舗シート。複数ファイルへ店舗を分割する仕様ではない。

### 4.2 シート・店舗判定

シート名を完全一致で判定します。

| シート名 | StoreCode |
|---|---|
| `若妻淫乱倶楽部春日部店` | `KASUKABE` |
| `若妻淫乱倶楽部越谷店` | `KOSHIGAYA` |
| `若妻淫乱倶楽部野田店` | `NODA` |

3シートすべてが必須ではなく、欠損はWARNING、対象3店舗すべてなしはFAILEDです。シート外の店舗名やファイル名から店舗を推測しません。

### 4.3 列

保存に必要な正式列（別名を含む）は、`女子名`/`キャスト名`/`名前`、`出勤数`（または`出勤日数`）、`出勤時間`、`予約数`、`キャンセル数`、`本指名数`、`写真指名数`、`フリー数`、`料金`、`女子報酬`、`利益`、`写メ日記数`、`当日欠勤数`、`有料オプション数`です。`接客数`、`成約数`、`新規成約数`、`リピート成約数`は任意です（欠損時nullまたは再計算値を使用）。未知列はWARNINGで保存しません。

ヘッダー候補は各シート先頭50行を走査し、主要列の一致とA列キャスト名推定を行います。A1空欄でも、主要列が十分一致し後続行にキャスト名がある場合だけA列を女子名として採用します。

### 4.4 行・日付

除外行は空行、合計/総合計/小計/計、繰り返しヘッダー、指定された周知・引継ぎ3名称です。日付はBulkのファイル名`YYYYMMDD`から取得し、通常Uploadでは管理者の対象期間指定を使用します。Excel内に日付列を要求する日次レポートではありません。

保存先は`CtiCastDaily`（`businessDate × storeId × castId`）。Alias/Cast解決後、売上・報酬・成約・出勤・指名・新規/リピート等が現在の分析画面で使用されます。MANUAL_UPLOAD=利用可能、Bulk=CTI_BULK_DIR経由で利用可能です。

**Drive判定案:** `CTI` Folder IDを固定し、直下の女子別レポートXLSXだけを対象とする。シート名と対象日が一致しない場合は自動確定せずpreviewへ送る。3店舗シートが同居するため店舗別フォルダへ分割しない。

## 5. Town監査

### 5.1 共通

`MediaType=TOWN`、`ImportDataType`は`TOWN_STORE`/`TOWN_CAST`/`TOWN_URL`/`TOWN_LANDING`の4つです。形式はCSV、UTF-8/UTF-8 BOM/CP932を受け付けます。先頭行の`YYYY年M月D日 ～ YYYY年M月D日`を期間として検証します。店舗別以外は行別日付列がないため、複数日ファイルを日次へ配賦できず、MANUAL_UPLOADでは対象開始日=終了日、一括分類でも同日だけが有効です。店舗別は`日付`列で複数日を扱えます。

店舗はMANUAL_UPLOADでは管理者の`ImportSource.storeId`選択、一括ではフォルダ設定が正です。現行Bulkフォルダは春日部・越谷だけで、野田は`createTownPreview`でも拒否されます。外部店舗IDも矛盾検証します（春日部`16829`、越谷`32782`）。ファイル名末尾`(1)`は現在の店舗判定に使われません。

### 5.2 種別・必須列・保存先

| 種別 | File prefix / 必須列 | 任意列・特徴 | 保存先 | 現行分析/経路 |
|---|---|---|---|---|
| `TOWN_STORE` | `dto.jp-shop-`; `日付`、`PV(ページビュー)`、`UU(ユニークユーザー)`、`平均PV`、`直帰率`、`TELタップ(UU)`、`コンバージョン率(TELタップ/UU)` | 未知列はWARNING。日付列あり | `TownStoreDaily` | Store/Management/Weekday。MANUAL+Bulk、春日部/越谷 |
| `TOWN_CAST` | `dto.jp-gal-`; `女の子`、`PV(ページビュー)`、`UU(ユニークユーザー)`、`平均PV`、`TELタップ(UU)`、`コンバージョン率(TELタップ/UU)` | Cast Alias解決、未紐付け保留 | `TownCastDaily` | Cast/媒体比較。MANUAL+Bulk、春日部/越谷 |
| `TOWN_URL` | `dto.jp-url-`; `URL`、`PV(ページビュー)`、`UU(ユニークユーザー)`、`平均PV`、`TELタップ(UU)`、`コンバージョン率(TELタップ/UU)` | URL内外部店舗ID/キャストIDは検証、Cast名は任意 | `TownUrlDaily` | URL分析。MANUAL+Bulk、春日部/越谷。v1自動化はOPTIONAL |
| `TOWN_LANDING` | `dto.jp-lp-`; `ランディングページ`、`UU(ユニークユーザー)`、`直帰率`、`TELタップ(UU)`、`コンバージョン率(TELタップ/UU)` | Cast名は任意、PV/平均PVはなし | `TownLandingDaily` | LP分析。MANUAL+Bulk、春日部/越谷。v1自動化はOPTIONAL |

数値は日次（店舗は行別日付、女子/URL/LPは対象日指定）で、PV/UU/TEL等をupsertします。比率は再計算値と元CSV値を別保持し、分母0はnull。欠測を0へしません。

**Drive判定案:** `TOWN/{KASUKABE|KOSHIGAYA}/{STORE|CAST|URL|LANDING}/YYYY/MM/`のFolder IDから店舗・種別を確定し、prefixと期間は整合性検証にする。Driveファイル名だけで店舗を決めない。

## 6. Heaven監査

### 6.1 店舗・データ型

`MediaType=HEAVEN`はAPI/serviceとも`KASUKABE`のstoreIdだけを許可し、越谷・野田その他は400 `HEAVEN_STORE_NOT_SUPPORTED`です。Heavenの正式enumは`HEAVEN_STORE`（店舗CSV）と`HEAVEN_CAST`（女子CSV）の2つだけです。Heaven Bulk経路は現状ありません。MANUAL_UPLOADの`/imports/heaven`のみ利用可能です。

### 6.2 Shop

- 形式: CSV。ファイル名ではなく、ヘッダーに`アクセス総数`と`アクション数_総数`が存在する内容判定で`HEAVEN_SHOP`。
- 日付: 先頭ヘッダーの`YYYY年M月`と、先頭列の日付（`M/D`）を組み合わせ、最大30日をUTC日付へ変換。
- 必須構造: 上記2ヘッダー、日付行、数値列。未知の店舗metric列も列名からmetricKey化して保存。
- 1ファイル: 春日部の店舗指標を複数metric列で含む。対象月のsummary（合計/今月/先月/前月/増減）は日次行から除外しraw summaryとしてpreviewに保持。
- 保存: `HeavenShopDaily`（`businessDate × storeId × metricKey`）。現在のHeaven/Marketing/一部Managementで利用。`PAGE_ACCESS`等を店舗指標として扱えるが、主要Cast Analyticsは女子側アクセスを主に参照する。
- Drive: **REQUIRED**。`HEAVEN/KASUKABE/SHOP/YYYY/MM/`固定Folder IDで運用。

### 6.3 Girl（7指標）

女子CSVは7ファイルとも同じ「月ヘッダー＋日付行＋キャスト名横持ち」形式で、内容に指標名を含みません。したがって現在のparserはファイル名から指標を推測せず、`metricHint`を管理者が明示しないと確定できません。ファイル名は監査・人間向け命名に使えても、分類の正にはなりません。

共通必須構造は、先頭ヘッダーの`YYYY年M月`、1列目の日付、2列目以降のキャスト名、最大30日の日付行です。空欄は`BLANK`、`---`は`NOT_APPLICABLE`、数値は`VALUE`。summary行は除外します。Cast解決はHEAVEN Alias/在籍期間を使い、未解決はWAITING_FOR_CAST_LINKです。

| metricHint / 現行ファイル例 | 値の粒度 | 保存 | 現在の主な利用 | Drive判定 |
|---|---|---|---|---|
| `PAGE_ACCESS` / `heaven_girl_page_access_YYYYMM.csv` | 日次イベント、期間SUM | `HeavenCastDaily.metricKey=page_access` | Cast/Store/Weekday/Management | **REQUIRED** |
| `DIARY_POSTS` / `heaven_girl_diary_posts_YYYYMM.csv` | 日次イベント、期間SUM | `diary_posts` | Cast/Store/Weekday/Diary | **REQUIRED** |
| `MY_GIRL` / `heaven_girl_my_girl_YYYYMM.csv` | 累計スナップショット、期間最終値・差分 | `my_girl` + `deltaValue` | Cast overview/媒体ファネル | **OPTIONAL** |
| `MITENE_SENT` / `heaven_girl_mitene_sent_YYYYMM.csv` | 日次イベント、期間SUM | `mitene_sent` | Marketing/媒体ファネル補助 | **OPTIONAL** |
| `OKINI_TALK_SENT` / `heaven_girl_okini_talk_sent_YYYYMM.csv` | 日次イベント、期間SUM | `okini_talk_sent` | Cast媒体ファネル/Marketing一部 | **OPTIONAL** |
| `ATTENDANCE_NOTICE` / 出勤通知相当ファイル | 現行は保守的にSNAPSHOT | `attendance_notice` | Cast overview/定義あり | **FUTURE**（意味・実ファイル確定待ち） |
| `DIARY_NOTICE` / `heaven_girl_diary_notice_YYYYMM.csv` | 現行はSNAPSHOT | `diary_notice` | Cast overview/定義あり | **FUTURE**（通知種別の内容確認待ち） |

累計値の差分化は`MY_GIRL`（および現行定義上の通知snapshot）で、前回VALUEとの差を`deltaValue`に保存します。初日、前日欠測、リセット時は差分を安全に算出できずnull/警告扱いです。日次イベントを累計として再差分化しません。Shop/ Girlとも月次summaryを日次値として二重保存しません。

## 7. その他 ImportSource

DB enumには`ImportSourceKind.GOOGLE_DRIVE`がありますが、現行コードにDrive API、Folder ID解決、ファイル検知、download、scheduler、retry、quarantine、auto-confirmはありません。ImportSource管理画面の`folderPath`は「将来用」入力です。したがって、現時点でGoogle Driveを設定しても自動Importは開始されません。

正式な`ImportDataType`は`CTI_CAST_REPORT`、4 Town種別、`HEAVEN_STORE`、`HEAVEN_CAST`だけです。その他のデータ種別（Google Drive上のPDF、画像、XLS、未知CSV、手書き集計、月次summary単体）は対象外です。

## 8. Phase H v1で実際に置くべきファイル一覧

まず自動化対象にする最小集合は次の9系統です。

1. CTI `女子別レポート_YYYYMMDD.xlsx`（3店舗シート）
2. Town春日部 `dto.jp-shop-...csv`
3. Town越谷 `dto.jp-shop-...csv`
4. Town春日部 `dto.jp-gal-...csv`
5. Town越谷 `dto.jp-gal-...csv`
6. Heaven春日部 Shop CSV
7. Heaven春日部 Girl PAGE_ACCESS CSV
8. Heaven春日部 Girl DIARY_POSTS CSV
9. 運用価値を確認した後に MY_GIRL / MITENE_SENT / OKINI_TALK_SENT を追加（OPTIONAL）

Town URL/LPは保存・分析価値があるためDriveフォルダ設計は行うが、v1の自動confirmはOPTIONALです。通知2種は指標定義と実ファイル構造が確定するまでFUTUREとし、Driveへ置いても自動取込対象にしません。

## 9. 自動Import設計の前提・停止条件

- Folder IDからStoreCode/DataType/metricHintを決定し、DBの`ImportSource.storeId/dataType/metricType`と一致検証する。
- Drive metadata（fileId、modifiedTime、size、SHA-256）でidempotencyを確保し、同一SHA・同一対象期間の重複を自動スキップする。
- preview→検証→Alias/Cast resolution→ADMIN confirmの段階を維持する。未紐付け、複数候補、期間不一致、外部店舗ID不一致、指標ヒント不一致は自動確定しない。
- CTIは3シートの欠損をWARNINGとして可視化し、対象3店舗シートなしは停止する。
- HeavenはKasukabe以外を拒否し、Girl CSVのmetricHintをFolder IDと照合する。ファイル名だけで`PAGE_ACCESS`等へ推測しない。
- 月次累計/summaryを日次へ推測配賦しない。SNAPSHOTはraw＋delta、DAILY_EVENTはraw日次SUMの現行意味を維持する。
- Drive API実装、folder ID登録、scheduler/retry/quarantine、監査ログ、権限設計はPhase H実装時に別途承認する。

## 10. 監査結論

現行v1.0.1で「実際にImport可能」なのは、CTI 1種、Town 4種、Heaven 2 data type（Heaven女子は7 metricHint）です。Google Drive自動Importはまだ存在しないため、Phase H v1の対象ファイルを先に固定し、フォルダIDを店舗・種別・指標の唯一の運用キーとして設計するのが安全です。DB schema、既存parser、分析Engineを変更せずに開始できるのは、まず上記REQUIRED集合のpreview-only discovery設計です。
