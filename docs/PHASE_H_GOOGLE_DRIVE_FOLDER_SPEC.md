# Phase H Google Drive Folder Specification

## 1. Document Information

- 対象版: `v1.0.1-production-ready`
- 更新日: 2026-08-14
- 状態: **設計仕様（実装なし）**
- 根拠: 現行Import実装、`docs/PHASE_H_DRIVE_IMPORT_SOURCE_AUDIT.md`、既存Import仕様書

この文書は、Google Drive上のどのFolderへ原本を置くと、どのImport設定へ渡すかを固定する。Google Drive API、DB、Prisma、Scheduler、Import処理は本書では実装しない。

## 2. Purpose

Google Driveを新しい分析データ源にするのではなく、既存のCTI/Town/Heaven Import Pipelineへ渡すInput Adapterとして扱う。

```text
Google Drive
  ↓ Folder IDでImport Configurationを特定
  ↓ file取得・一時保存・SHA-256
既存Parser / Preview / Validation / Alias解決
  ↓ ImportBatch
既存fact tableへupsert
  ↓
Analytics
```

## 3. Design Principles

1. **1 Folder = 1 Import Configuration** とする。
2. Folder名ではなく、Google Drive **Folder ID**を内部識別子にする。表示名変更は設定に影響させない。
3. Folder IDを媒体、店舗、`ImportDataType`、Heaven `metricHint`の主要な判定根拠とする。
4. ファイル名は拡張子、期間、重複、補助的な形式検証にのみ使用する。主要分類をファイル名へ依存しない。
5. Google Drive専用の別Parser・別upsertを作らず、既存Pipelineを再利用する。
6. Folderが正しくても、MIME、ヘッダー、シート、必須列、期間、外部店舗ID、Alias/Cast解決を再検証する。
7. 原本はImport成功後も元Folderに残す。移動で重複を防止しない。

## 4. Scope

対象は既存の正式ImportDataTypeのみ。

| MediaType | 正式なImportDataType |
|---|---|
| `CTI` | `CTI_CAST_REPORT` |
| `TOWN` | `TOWN_STORE`, `TOWN_CAST`, `TOWN_URL`, `TOWN_LANDING` |
| `HEAVEN` | `HEAVEN_STORE`, `HEAVEN_CAST` |

Heavenの指標はImportDataTypeではなく、現行コードの`HeavenMetricType`/`metricHint`（`PAGE_ACCESS`等）で区別する。Google Drive自動Import自体は未実装である。

## 5. Official Folder Tree

```text
HPlus Analytics/
├── CTI/
│   └── 女子別レポート/
├── Town/
│   ├── 春日部/
│   │   ├── 店舗別/
│   │   ├── 女子別/
│   │   ├── URL別/
│   │   └── LP別/
│   └── 越谷/
│       ├── 店舗別/
│       ├── 女子別/
│       ├── URL別/
│       └── LP別/
├── Heaven/
│   └── 春日部/
│       ├── Shop/
│       ├── Girl Access/
│       ├── Girl Diary/
│       ├── Girl MyGirl/
│       ├── Girl Mitene/
│       ├── Girl Talk/
│       ├── Diary Notice/
│       └── Attendance Notice/
├── Archive/   (v1未使用・Future)
└── Error/     (v1未使用・Future)
```

Archive/Errorは予約Folderであり、Phase H v1では自動移動・自動監視を行わない。

## 6. Folder Mapping Rules

- `CTI`は1設定で、直下のCTI女子別レポートXLSXを読み、Excel内の3店舗シートを読む。
- Townは店舗Folder IDを正とする。春日部/越谷をファイル名から推測しない。
- Heavenは春日部Folderのみを正式対象とする。越谷・野田Folderは作成しない。
- Heaven Girl系は実ダウンロード名がすべて`tokeiGirl_YYYYMM.csv`になり得るため、Folder IDから`metricHint`を決定する。
- `tokeiGirl_YYYYMM_access.csv`等は管理用にリネームした例であり、提供元の正式ファイル名ではない。
- 未登録Folder IDは`IGNORE`/`UNMAPPED`として記録候補にし、自動Importしない。

## 7. CTI

### 7.1 Configuration

| 項目 | 正式値 |
|---|---|
| Folder | `CTI` |
| MediaType | `CTI` |
| ImportDataType | `CTI_CAST_REPORT` |
| Store | 春日部・越谷・野田（Excel 3シート） |
| Priority | `REQUIRED` |
| Status | `PARTIAL`（既存Manual/Bulkは実装、Drive経路は未実装） |

### 7.2 File

- 形式: XLSX
- 例: `女子別レポート_20260801.xlsx`、`女子別レポート_20260802.xlsx`
- Bulkのファイル名検証: `女子別レポート_YYYYMMDD.xlsx`（NFC正規化後の完全一致）
- 1ファイル: 1冊、最大3店舗シート
- 店舗判定: Excel内部の完全一致シート名

| シート名 | StoreCode |
|---|---|
| `若妻淫乱倶楽部春日部店` | `KASUKABE` |
| `若妻淫乱倶楽部越谷店` | `KOSHIGAYA` |
| `若妻淫乱倶楽部野田店` | `NODA` |

シート欠損はWARNING、対象シートが1つもなければFAILED。Driveで店舗Folderへ分割しない。

### 7.3 Validation / Pipeline

シート先頭50行からヘッダーを検出する。正式列は、女子名系（または安全なA列推定）、出勤数/出勤時間、予約数、キャンセル数、本指名数、写真指名数、フリー数、料金、女子報酬、利益、写メ日記数、当日欠勤数、有料オプション数。接客数・成約数・新規成約数・リピート成約数は任意列である。

空行、合計/小計/計、繰り返しヘッダー、指定された周知・引継ぎ行は除外する。日次Bulkの対象日はファイル名`YYYYMMDD`、Manualでは管理者指定期間を使用する。月次累計を日次へ配賦しない。

保存先は`CtiCastDaily`。現在のCTI、Cast、Store、Weekday、Goals等で使用される。Manual Uploadと`CTI_BULK_DIR`経路は利用可能。Driveでは取得後、既存`createCtiPreview`/confirmへ渡す。

## 8. Town

形式はCSV（UTF-8、UTF-8 BOM、CP932）。Townの4種別は現行コードの正式enumを使用する。店舗はFolder IDで確定し、ファイル名末尾`(1)`は使用しない。

| Drive Folder | MediaType | Store | ImportDataType | ファイル例 | 必須列の概要 | 保存先 | Priority |
|---|---|---|---|---|---|---|---|
| `Town/春日部/店舗別` | `TOWN` | `KASUKABE` | `TOWN_STORE` | `dto.jp-shop-20260807_to_20260807.csv` | 日付、PV、UU、平均PV、直帰率、TELタップ(UU)、CVR | `TownStoreDaily` | `REQUIRED` |
| `Town/春日部/女子別` | `TOWN` | `KASUKABE` | `TOWN_CAST` | `dto.jp-gal-20260807_to_20260807.csv` | 女の子、PV、UU、平均PV、TELタップ(UU)、CVR | `TownCastDaily` | `REQUIRED` |
| `Town/春日部/URL別` | `TOWN` | `KASUKABE` | `TOWN_URL` | `dto.jp-url-20260807_to_20260807.csv` | URL、PV、UU、平均PV、TELタップ(UU)、CVR | `TownUrlDaily` | `OPTIONAL` |
| `Town/春日部/LP別` | `TOWN` | `KASUKABE` | `TOWN_LANDING` | `dto.jp-lp-20260807_to_20260807.csv` | ランディングページ、UU、直帰率、TELタップ(UU)、CVR | `TownLandingDaily` | `OPTIONAL` |
| `Town/越谷/店舗別` | `TOWN` | `KOSHIGAYA` | `TOWN_STORE` | `dto.jp-shop-20260807_to_20260807.csv` | 同上 | `TownStoreDaily` | `REQUIRED` |
| `Town/越谷/女子別` | `TOWN` | `KOSHIGAYA` | `TOWN_CAST` | `dto.jp-gal-20260807_to_20260807.csv` | 同上 | `TownCastDaily` | `REQUIRED` |
| `Town/越谷/URL別` | `TOWN` | `KOSHIGAYA` | `TOWN_URL` | `dto.jp-url-20260807_to_20260807.csv` | 同上 | `TownUrlDaily` | `OPTIONAL` |
| `Town/越谷/LP別` | `TOWN` | `KOSHIGAYA` | `TOWN_LANDING` | `dto.jp-lp-20260807_to_20260807.csv` | 同上 | `TownLandingDaily` | `OPTIONAL` |

店舗別は`日付`列で複数日を扱える。女子/URL/LPは行別日付列がないため、現行Pipelineでは対象開始日=終了日の1日ファイルのみ確定可能。CSV先頭期間、種別、数値、外部店舗ID（春日部`16829`、越谷`32782`）を検証する。野田は現行Town取込対象外。

保存後はPV/UU/TEL等を日次upsertし、分母0はnull、MISSINGを0へしない。未紐付けCastはAlias解決後に確定する。

## 9. Heaven

### 9.1 Store

Heavenは`KASUKABE`のみ許可。API/serviceは越谷・野田等を`HEAVEN_STORE_NOT_SUPPORTED`（400）で拒否する。正式ImportDataTypeは`HEAVEN_STORE`と`HEAVEN_CAST`のみで、各metricに別ImportDataTypeは存在しない。

### 9.2 Shop

| 項目 | 内容 |
|---|---|
| Folder | `Heaven/春日部/Shop` |
| File | `tokeiShop_202607.csv` |
| 判定 | ファイル名ではなくヘッダー`アクセス総数`＋`アクション数_総数`で店舗CSVと判定 |
| Media / DataType | `HEAVEN` / `HEAVEN_STORE` |
| Priority / Status | `REQUIRED` / `PARTIAL`（Manualのみ） |
| 保存 | `HeavenShopDaily` |

日付はヘッダーの`YYYY年M月`と先頭列`M/D`を組み合わせる。最大30日の日次行を読み、合計/今月/先月/前月/増減などのsummary行は日次へ混ぜない。

### 9.3 Girl

7 Folderはすべて独立させ、同じ`HEAVEN_CAST`へ渡す。Folder IDが`metricHint`を決める。

| Folder | 実ファイル例 | metricHint（正式値） | valueKind | Priority | Status |
|---|---|---|---|---|---|
| `Heaven/春日部/Girl Access` | `tokeiGirl_202607.csv` | `PAGE_ACCESS` | `DAILY_EVENT` | `REQUIRED` | `PARTIAL` |
| `Heaven/春日部/Girl Diary` | `tokeiGirl_202607.csv` | `DIARY_POSTS` | `DAILY_EVENT` | `REQUIRED` | `PARTIAL` |
| `Heaven/春日部/Girl MyGirl` | `tokeiGirl_202607.csv` | `MY_GIRL` | `SNAPSHOT` | `OPTIONAL` | `PARTIAL` |
| `Heaven/春日部/Girl Mitene` | `tokeiGirl_202607.csv` | `MITENE_SENT` | `DAILY_EVENT` | `OPTIONAL` | `PARTIAL` |
| `Heaven/春日部/Girl Talk` | `tokeiGirl_202607.csv` | `OKINI_TALK_SENT` | `DAILY_EVENT` | `OPTIONAL` | `PARTIAL` |
| `Heaven/春日部/Diary Notice` | `tokeiGirl_202607.csv` | `DIARY_NOTICE` | `SNAPSHOT` | `FUTURE` | `FUTURE` |
| `Heaven/春日部/Attendance Notice` | `tokeiGirl_202607.csv` | `ATTENDANCE_NOTICE` | `SNAPSHOT` | `FUTURE` | `FUTURE` |

`PAGE_ACCESS`、`DIARY_POSTS`、`MY_GIRL`、`MITENE_SENT`、`OKINI_TALK_SENT`、`DIARY_NOTICE`、`ATTENDANCE_NOTICE`は現行`HeavenMetricType`/`metricHint`に存在する。個別の`ImportDataType`は存在しない。通知系はコード上の受け皿・定義はあるが、実ファイルの意味と運用確認が未完了のため、自動監視はFutureとする。

Girl CSVの必須構造は、先頭`YYYY年M月`、1列目の日付、2列目以降のキャスト名横持ち、最大30日の日付行。ファイル名からmetricを推測しない。空欄はBLANK、`---`はNOT_APPLICABLE、数値はVALUE。summary行は除外する。

保存先は`HeavenCastDaily`（`businessDate × storeId × metricKey × resolutionKey`）。`MY_GIRL`と通知snapshotはraw値と前回値との差分`deltaValue`を保持し、日次イベントはrawを日次合計する。前日欠測・初日・リセット時の差分はnull/警告とし、累計値をSUMして二重計上しない。

## 10. File Naming Characteristics

| Source | Filename rule | 判定の扱い |
|---|---|---|
| CTI | `女子別レポート_YYYYMMDD.xlsx` | Bulkの補助検証。店舗はシート名 |
| Town | `dto.jp-shop-` / `dto.jp-gal-` / `dto.jp-url-` / `dto.jp-lp-` + `YYYYMMDD_to_YYYYMMDD.csv` | 種別・期間の補助検証。店舗はFolder ID |
| Heaven Shop | `tokeiShop_YYYYMM.csv` | Shop構造はヘッダーで再検証 |
| Heaven Girl | `tokeiGirl_YYYYMM.csv` | 全指標で同名になり得る。metricはFolder ID |

## 11. Folder ID Mapping

### 11.1 Configuration fields

将来の設定は最低限次を持つ。

`driveFolderId`、`displayName`、`mediaType`、`storeId/storeCode`、`importDataType`、`metricHint`、`priority`、`isActive`、`isFuture`、`createdAt`、`updatedAt`。

現行`ImportSource`の`name`、`kind`、`mediaType`、`dataType`、`metricType`、`storeId`、`folderPath`、`isActive`は概念上再利用可能。ただし`folderPath`は現在ローカル/将来用の文字列であり、Google Drive Folder IDやfileId、modifiedTime、SHA-256履歴を十分に表現しない。DB変更は本仕様の対象外とする。

### 11.2 Mapping table

| Drive Folder | Media | Store | ImportDataType | metricHint | Priority | Status |
|---|---|---|---|---|---|---|
| CTI | CTI | 3店舗シート | CTI_CAST_REPORT | — | REQUIRED | PARTIAL |
| Town/春日部/店舗別 | TOWN | KASUKABE | TOWN_STORE | — | REQUIRED | PARTIAL |
| Town/春日部/女子別 | TOWN | KASUKABE | TOWN_CAST | — | REQUIRED | PARTIAL |
| Town/春日部/URL別 | TOWN | KASUKABE | TOWN_URL | — | OPTIONAL | PARTIAL |
| Town/春日部/LP別 | TOWN | KASUKABE | TOWN_LANDING | — | OPTIONAL | PARTIAL |
| Town/越谷/店舗別 | TOWN | KOSHIGAYA | TOWN_STORE | — | REQUIRED | PARTIAL |
| Town/越谷/女子別 | TOWN | KOSHIGAYA | TOWN_CAST | — | REQUIRED | PARTIAL |
| Town/越谷/URL別 | TOWN | KOSHIGAYA | TOWN_URL | — | OPTIONAL | PARTIAL |
| Town/越谷/LP別 | TOWN | KOSHIGAYA | TOWN_LANDING | — | OPTIONAL | PARTIAL |
| Heaven/春日部/Shop | HEAVEN | KASUKABE | HEAVEN_STORE | — | REQUIRED | PARTIAL |
| Heaven/春日部/Girl Access | HEAVEN | KASUKABE | HEAVEN_CAST | PAGE_ACCESS | REQUIRED | PARTIAL |
| Heaven/春日部/Girl Diary | HEAVEN | KASUKABE | HEAVEN_CAST | DIARY_POSTS | REQUIRED | PARTIAL |
| Heaven/春日部/Girl MyGirl | HEAVEN | KASUKABE | HEAVEN_CAST | MY_GIRL | OPTIONAL | PARTIAL |
| Heaven/春日部/Girl Mitene | HEAVEN | KASUKABE | HEAVEN_CAST | MITENE_SENT | OPTIONAL | PARTIAL |
| Heaven/春日部/Girl Talk | HEAVEN | KASUKABE | HEAVEN_CAST | OKINI_TALK_SENT | OPTIONAL | PARTIAL |
| Heaven/春日部/Diary Notice | HEAVEN | KASUKABE | HEAVEN_CAST | DIARY_NOTICE | FUTURE | FUTURE |
| Heaven/春日部/Attendance Notice | HEAVEN | KASUKABE | HEAVEN_CAST | ATTENDANCE_NOTICE | FUTURE | FUTURE |
| Archive / Error | — | — | — | — | FUTURE | FUTURE |

## 12. Import Priority

- REQUIRED: CTI、Town店舗/女子、Heaven Shop/Girl Access/Girl Diary
- OPTIONAL: Town URL/LP、Heaven MyGirl/Mitene/Talk
- FUTURE: Heaven Diary Notice/Attendance Notice、Archive/Error
- v1 Schedulerの監視候補は`isActive=true`のREQUIRED + OPTIONAL。ただしOPTIONALの初期有効化は別途決定する。
- FUTURE Folderは監視対象外。

## 13. Validation

Folder IDで設定を確定した後も、既存Pipelineの検証を必ず通す。

- 拡張子、MIME、サイズ、SHA-256
- CTIのXLSX ZIP、対象シート、ヘッダー、除外行、日次対象日
- TownのCSV encoding、種別ヘッダー、期間、必須列、数値、外部店舗ID
- HeavenのCSV構造、月/日付、metricHintとFolder設定の一致、春日部固定、Cast Alias/在籍期間
- ImportBatch重複、未知列、MISSING/BLANK/NOT_APPLICABLE、未紐付け/曖昧候補

Folderが正しいことだけを理由に自動確定しない。失敗時は原本をError Folderへ自動移動せず、ImportBatch/ImportError/Drive stateで追跡する。

## 14. File Lifecycle

1. Folder IDからImport Configurationを解決
2. Drive metadata（fileId、name、modifiedTime、size）を取得
3. 一時領域へdownloadしSHA-256算出
4. 既存Manual/Bulkと同じpreview・validation・resolution
5. 安全条件を満たす場合のみ既存confirm/upsert
6. ImportBatchとDrive stateへ結果を記録
7. 成功・失敗にかかわらず原本は元Folderに残す

原本をArchiveへ移動して重複防止する方式は採用しない。Driveは証跡保管庫、ImportBatchは処理履歴と責務を分担する。

## 15. Duplicate / Update Policy

`fileId`、`modifiedTime`、SHA-256、対象期間、ImportBatchを組み合わせてidempotencyを確保する。

- 未変更fileId: 再Importしない
- 同一fileIdのmodifiedTime/SHA変更: 再処理候補
- 別fileIdでも同一SHA・同一期間: 既存の重複検知へ渡す
- 同一期間の別SHA: CTI/Town/Heaven既存の修正版候補・明示確認方針を維持
- 既存実績を単純加算しない。自然キーupsertと既存ImportBatchの重複ルールを使う

実装詳細（Drive API query、watch、scheduler、retry/backoff、quarantine）は別のGoogle Drive Architecture仕様で決める。

## 16. Archive / Error Future Policy

Phase H v1ではArchive/Errorへ自動移動しない。成功失敗はImportBatch、ImportError、将来のDrive stateで管理する。

- `Archive`: 将来の保管整理用予約Folder
- `Error`: 将来の隔離・再処理用予約Folder
- v1での自動移動、削除、名前変更、Folder間コピーは禁止

## 17. Security

- Google Drive OAuth/service account認証情報を本書・Gitへ記載しない。
- 実Folder IDを本書・ログ・画面へ露出しない。Production Secret/Configurationとして管理する。
- Drive権限は必要なFolderのみの最小権限とする。
- 取得後の原本は既存の非公開Upload領域へ一時保存し、ADMIN保護、サイズ/MIME検証、SHA-256を適用する。
- 外部ファイルの内容を無条件に信用せず、既存Parser/Validationを必ず通す。

## 18. Phase H v1 Monitoring Scope

監視対象は原則、`isActive=true`のREQUIRED + OPTIONAL Folder。FUTURE、Archive、Error、未登録Folder IDは自動Importしない。

最低限記録する状態は、Folder ID（内部参照）、fileId、modifiedTime、SHA-256、検知時刻、download状態、ImportBatch ID、Import status、error code、再試行回数です。未登録Folderは`UNMAPPED/IGNORE`として監査可能にする。

## 19. Known Limitations

1. Google Drive API、Folder ID登録、Drive state、Scheduler、retry/quarantineは未実装。
2. `ImportSource.folderPath`は将来用で、Folder IDの代替実装ではない。
3. Heaven Girl CSVは同一ファイル名であり、Folder IDと明示metricHintが必須。
4. Heaven通知系はenum/metricHintの受け皿はあるが、実ファイル意味の確認が未完了。
5. CTI/Town/Heavenの自動confirm安全条件は既存Manual/Bulkの制約を継承する。

## 20. Open Questions

- Productionで利用するGoogle Workspace、共有Drive、サービスアカウント/OAuth方式は何か。
- 各Folderの実Folder ID、アクセス権、監視アカウントをどこへ安全に登録するか。
- Driveファイルの保持期間、版管理、削除禁止ポリシーをどうするか。
- OPTIONAL Folder（Town URL/LP、Heaven MyGirl/Mitene/Talk）をv1初日から有効化するか。
- Heaven `DIARY_NOTICE`/`ATTENDANCE_NOTICE`の実CSV定義、累計/日次意味、正式運用開始条件。
- Auto-confirmを許可する条件と、ADMIN preview/confirmを必須にする範囲。
- 同日別SHAの修正版をDriveでどう扱うか。
- Drive APIのquota、失敗retry、通知、SLO、監査ログ保持期間。

## 21. Appendix

### 21.1 Formal values verified in code

- `MediaType`: `CTI`, `TOWN`, `HEAVEN`
- `ImportDataType`: `CTI_CAST_REPORT`, `TOWN_STORE`, `TOWN_CAST`, `TOWN_URL`, `TOWN_LANDING`, `HEAVEN_STORE`, `HEAVEN_CAST`
- `HeavenMetricType` / `metricHint`: `PAGE_ACCESS`, `DIARY_POSTS`, `MY_GIRL`, `MITENE_SENT`, `OKINI_TALK_SENT`, `ATTENDANCE_NOTICE`, `DIARY_NOTICE`, `UNKNOWN`
- `ImportSourceKind`: `MANUAL_UPLOAD`, `GOOGLE_DRIVE`

### 21.2 Cross-document consistency

本書は`docs/PHASE_H_DRIVE_IMPORT_SOURCE_AUDIT.md`の監査結果、CTI/Town/Heavenの既存Import仕様、Production-ready仕様書のImportDataType/Heaven春日部固定方針と整合する。差分は、Folder IDをDrive側の唯一の設定識別子として追加した点、およびHeaven同名ファイルをmetric別Folderで分離する点である。いずれも今回の設計提案であり、コード・DB変更を意味しない。
