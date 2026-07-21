# Changelog

## 2026-07-21 — CTIを正としたTown未紐付け一括候補

- Town一括画面へ読み取り専用の候補解析とA/B/C分類、A全件実行、B選択承認、C個別確認表示を追加
- 同一店舗、在籍期間、CTI Alias、内部表示名、CastNameHistory、接頭辞「久」、Town Alias衝突、ID形式、修正版を安全条件として実装
- 実行直前の候補再計算・フィンガープリント検証、Serializableトランザクション、DB advisory lock、全件ロールバックを追加
- 同店舗・同一正規化名のCAST/URL/LPを横断解決し、未確定実績と既存確定済み実績は変更せず、存在しない実績だけ追加
- ImportBatch件数を台帳から再計算し、`metadata.importEvents`へ`BULK_CTI_TOWN_LINK`監査履歴を保存
- 初回読み取り専用解析: A 0人分/0行、B 2人分/124行、C 76人分/2,344行。紐付け実行なし

## 2026-07-21 — CTI全期間確定後のTown一括プレビュー再解析

- Town詳細へCTI同等の再解析ボタン、`POST /api/imports/town/{id}/reparse`、Bulkの「未確定Townバッチを全再解析」を追加
- STORE / CAST / URL / LANDING全種別に対応し、Alias追加後のresolver再実行でWAITINGからPREVIEW_READYへの遷移を可能化
- 120秒タイムアウト、ref二重送信ロック、同一batchIdのサーバー実行集約を追加
- 未確定Town一括バッチの保存済みCSVを既存parser/resolverで再読込し、現在のCast・TOWN Alias・在籍期間で再判定
- 同一batch IDのpreview JSON、ImportError、ImportBatch検証件数だけを更新し、完了済みSHA重複とTown実績は不変更
- 未確定377件と新規候補1件を再検証し、失敗0件。一括確定は未実行
- 再解析後は自動確定可能99件、WAITING 96件、未紐付け4,467行、正規化名84、店舗＋正規化名100、ERROR 0

## 2026-07-21 — CTI再解析ボタンのpending解除

- 成功・APIエラー・例外・タイムアウトの全経路で`finally`からpendingと送信ロックを解除
- refによる同期ロックでstate反映前の高速二重クリックを防止
- 120秒のAbortControllerタイムアウトと専用エラーメッセージを追加
- 同一batchIdの同時サーバー再解析を単一Promiseへ集約し、preview/ImportError更新の競合を防止
- 再解析、preview、ImportErrorの既存処理とCTI実績・Cast・Alias・MediaListingは変更なし

## 2026-07-21 — CTIローカルフォルダ一括取込

- 504調査を受け、ページ描画からフォルダ走査を分離し、scanは一覧/SHA/既存状態のみ、processは厳密に1リクエスト1ファイルへ固定
- 全108件を固定分母とする進捗、処理中ファイル、停止/再開、HTTP status付き失敗表示、単件再試行を追加し、重複15件だけで100%になる表示不具合を修正
- scan/processへ開始・終了・処理時間ログとServer-Timingを追加し、同一ファイルへの同時process要求を単一処理へ集約
- ADMIN専用`/imports/cti/bulk`を追加し、`CTI_BULK_DIR`で固定したフォルダを読み取り専用で走査
- Unicode正規化後の`女子別レポート_YYYYMMDD.xlsx`だけを対象にし、対象日昇順で1ファイルずつ処理
- 既存`createCtiPreview`、CTI resolver、preview/ImportError保存、`confirmCtiImport`を再利用し、一括専用パーサーは追加しない
- 完了済み同一SHAを重複スキップ、未完了同一SHAを既存バッチへ誘導、同日別SHAを修正版候補として自動確定から除外
- 未紐付け・曖昧・ERRORをプレビューで停止し、既存CTI詳細のAlias追加、新規Cast作成、保留を共通利用
- シンボリックリンク、フォルダ外参照、対象外拡張子を拒否し、DockerではCTIフォルダをread-only bind mount
- 初回運用は走査・検証だけとし、CtiCastDailyへの一括確定は実行しない
- 初回実ファイル検証: 対象108件、完了済みSHA重複15件、既存未完了2件、新規91件、PREVIEW_READY 8件、WAITING_FOR_CAST_LINK 83件、未紐付け520行、ERROR 0件

## 2026-07-20 — Townローカルフォルダ一括取込

- ADMIN専用`/imports/town/bulk`を追加し、環境変数で固定した春日部・越谷フォルダを読み取り専用で走査
- `dto.jp-shop/gal/url/lp`とファイル名期間を判定し、日付昇順・店舗→女子→URL→LP順で1ファイルずつ処理
- 既存`createTownPreview`、resolver、プレビュー保存、`confirmTownImport`を再利用し、専用パーサーは追加しない
- 完了済み同一SHAを重複スキップ、未完了同一SHAを既存バッチへ誘導、同日別SHAを修正版候補として自動確定から除外
- エラー0・全媒体行の未紐付け0・曖昧0・構造/店舗/期間/種別正常の場合だけ自動確定可能
- シンボリックリンク、フォルダ外参照、CSV以外を拒否し、Dockerでは許可フォルダをread-only bind mount
- 初回は走査・検証だけを実施し、一括確定は未実行

## 2026-07-18 — CTI既存バッチ再解析

- CTI詳細の元ファイルボタン横へ再解析ボタンを追加
- FAILEDに加えてWAITING_FOR_CAST_LINK / COMPLETED_WITH_WARNINGS / COMPLETEDを対象化
- 初回取込と再解析を共通`analyzeCtiWorkbook`へ統合
- 新規ImportBatchを作らず、保存済み`storagePath`から同じバッチのpreview.json、ImportError、解析件数だけを再生成
- 既存CtiCastDaily、Cast、Alias、MediaListing、inserted/updated件数を変更しない
- 再解析前後の未紐付け・警告・取込可能件数を完了メッセージに追加

## 2026-07-18 — Cast・Alias開始日の一括前倒し

- ADMIN専用の開始日メンテナンス画面をキャスト管理へ追加
- 複数Cast、一括開始日、CTI/Town/Heaven/全媒体を指定する変更プレビューを追加
- `startedOn` / `validFrom`の前方向更新だけを許可し、`validTo`、ID、実績、掲載状態を維持
- 統合済みsource、退店日矛盾、一意キー衝突、別Cast同名Aliasの期間重複を事前停止
- プレビューフィンガープリントを実行直前に再検証し、Serializable単一トランザクションで全件更新または全件ロールバック
- `CastStartDateBulkChangeHistory`を追加し、Cast/Aliasの変更前後、実行者、日時、理由をJSONスナップショットで監査保存
- 2026-04-01の実データプレビューを作成。本番開始日変更は未実行

## 2026-07-16 — キャスト重複統合

- source Castの全関連データをtarget Castへ移行するADMIN専用統合機能を追加
- 統合済み状態を在籍状態と分離し、sourceを物理削除せず最終targetへ直接参照
- 一意キー衝突の完全一致整理、値差分時停止、数値非加算を実装
- Serializableトランザクション、ID順ロック、プレビューフィンガープリント再検証を追加
- 重複候補、統合プレビュー、統合履歴、統合済み一覧、旧URL誘導を追加
- 通常一覧・分析・Alias/CTI/Town候補から統合済みCastを除外
- `CastMergeHistory`へ前後スナップショット、衝突整理、実行者、理由を保存

## 2026-07-15 — 内部キャスト表示名の変更履歴

- Cast UUIDと全関連データを維持したまま、内部表示名・正規化名だけを変更する管理UIを追加
- 同じ正規化名の候補と在籍期間重複を保存前に警告し、明示確認を必須化
- `CastNameHistory`を追加し、変更前後名・実行ADMIN・日時・任意理由をトランザクション保存
- キャスト管理へ媒体・店舗別Aliasと過去の表示名履歴を追加表示
- VIEWERはServer Action側で拒否

## 2026-07-15 — キャスト主所属変更の即時表示修正

- 主所属selectを`defaultValue`の未制御要素からcontrolled stateへ変更
- 保存Actionの確定値を画面へ即時反映し、成功表示後にキャスト一覧を再取得
- `revalidatePath`を維持しつつ、クライアント側`router.refresh()`でServer Componentを同期

## 2026-07-15 — 久喜を主所属店舗として追加

- `StoreCode.KUKI`と久喜店舗マスタを追加し、経営実績・集客分析フラグをともに無効化
- キャスト新規登録、所属変更、Town未紐付け新規作成の主所属候補へ久喜を追加
- 店舗実績と管轄全体を`hasManagementMetrics=true`の店舗に限定
- CTI対象を春日部・越谷・野田の3店舗型へ明示的に限定し、Town取込元は春日部・越谷のみを維持
- 久喜所属キャストの春日部TOWN Alias・MediaListing・Town実績が春日部store_idで保存・集計されることを統合テストで確認

## 2026-07-15 — Town未紐付けからのキャスト新規作成

- Town女子別の未紐付け行へ、原文名・主所属店舗・在籍開始日・メモ付きのインライン新規作成UIを追加
- Cast、TOWN Alias、MediaListing、プレビュー、ImportError、未反映実績、バッチ件数を一操作で更新
- 同店舗・同一正規化名の既存Town女子/URL/LPバッチを自動再解決
- 同名候補1件時の既存紐付け推奨と確認ダイアログ、複数候補時の作成停止を追加
- サーバー側再検査とトランザクション内ロックで意図しない二重作成を防止
- URL/LP画面からの直接作成とVIEWER操作を禁止し、DBスキーマ変更なしで実装

## 2026-07-15 — Town完了後の未紐付け解決

- `COMPLETED_WITH_WARNINGS`を完了状態のまま維持し、OPEN未紐付け行のAlias追加・除外UI/APIを有効化
- 同店舗・同一正規化名の女子/URL/LPを横断して再解決し、別店舗は対象外に固定
- 後追い解決された未反映行だけを一意キーupsertし、確定済み行の再加算を防止
- inserted/updated/pending/skipped/OPEN warning/errorを累計状態として再集計
- 全未紐付け解消時に`COMPLETED`へ遷移し、操作履歴をImportBatch.metadataへ保存
- 今回除外を対象バッチ限定とし、MediaListing・在籍状態・将来バッチへ影響させない
- DBスキーマとマイグレーションの変更なし

## 2026-07-15 — タウン女子参考分析

- UUあたり成約数、UUあたり売上、TELあたり売上、本指名率を表示時だけ計算
- 春日部、越谷、全体の同一期間スコープを分離して参考指標を表示
- PV、UU、TEL、TEL率、CTI料金、女子報酬、CTI成約数、本指名率、UUあたり売上の独立ランキングを追加
- 同値は競技順位方式とし、率・参考指標は設定最低母数未満を順位対象外に変更
- 設定注入型の評価プレビューと根拠指標付き改善候補を追加
- DB、取込、既存集計、既存KPI、ImprovementLogは変更なし

## 2026-07-15 — Phase 3 デリヘルタウン取込・分析

- 春日部・越谷の店舗別、女子別、URL別、LP別CSV手動取込を追加
- ファイル名に依存せず、管理画面の店舗選択を正としてURL内店舗IDを矛盾検証に使用
- CP932/UTF-8/BOM、列名マッピング、種別誤選択、数値・期間、不明列を検証
- TownStoreDaily、TownCastDaily、TownUrlDaily、TownLandingDailyとページ種別Enumを追加
- TOWN Aliasによる既存キャスト紐付け、保留/除外、MediaListing更新を追加（新規Cast作成なし）
- 元比率と再計算比率を分離し、全体TEL率・平均PVを母数から再計算
- タウン店舗/女子/URL/LP分析とキャスト詳細へのCTI併記を追加
- 実運用8ファイルを解析・照合し、匿名化フィクスチャと回帰テストを追加

## 2026-07-14 — 未紐付けキャスト新規作成の省力化

- 新規キャスト名へCTIのキャスト原文名を初期入力
- 「新規作成して紐付け」ボタンでキャスト作成、CTI Alias作成、対象行紐付けを一括実行
- 必要な場合だけ管理者が初期入力名を修正する運用へ変更

## 2026-07-14 — CTI全74列カタログ・列別負数検証

- 実運用74列をADOPTED 17、FUTURE_CANDIDATE 56、INTENTIONALLY_UNUSED 1へ分類
- FUTURE_CANDIDATE/INTENTIONALLY_UNUSEDを既知列化し、UNKNOWN_COLUMNS対象から除外
- 未定義列警告へ店舗、シート、元列名、列番号、ヘッダー行番号を追加
- 件数・出勤時間は負数禁止、補正・費用・料金・報酬・利益は負数許可へ変更
- 未採用列は保存せず型・負数のみ検証
- NEGATIVE_VALUEへ店舗、キャスト、シート、行、列、元値、許可状態、理由を追加
- 実ファイルの正常な費用・補正・負利益19セルが警告されないことを確認

## 2026-07-14 — 実運用CTIヘッダー正式対応

- 対象3店舗の1行目ヘッダーとA1空欄キャスト名列を安全推定
- 「出勤数」「出勤日数」を `attendance_count` へ統合し、元列名を保持
- 「新規成約数」「リピート成約数」を正式な成約内訳へ変更。「リピート数」は未使用
- 成約/接客の元値と再計算値を分離し、差分をWARNING保存・画面併記
- 実CTIの10進時間を分換算
- `new_count` / `repeat_count` をnullable化
- FAILEDバッチの保存済みファイル再解析を追加
- 診断画面を維持し、実ファイル全74列を文書化

## 2026-07-14 — CTIヘッダー診断

- 対象3シートのA〜Z・先頭最大50行を取込詳細へ表示
- ヘッダー候補行、一致列数、一致列、必須不足列を表示
- HEADER_NOT_FOUND時に先頭30行を強調表示
- 保存済みの失敗バッチを再アップロードなしで遡及診断
- ヘッダー判定条件は変更なし

## 2026-07-14 — Phase 2 CTI女子別レポート

- ImportBatch、CtiCastDailyを追加
- ImportErrorへImportBatch外部キーを追加
- 非公開XLSX保存ボリュームを追加
- CTIアップロード、検証、プレビュー、未紐付け、確定取込を追加
- 同一ファイル警告、修正版upsert、部分取込を追加
- キャスト一覧/詳細、店舗実績を追加
- CTIパーサー、キャスト解決、集計のテストを追加
- API、DB、CTI取込、列マッピング文書を追加
- ExcelJSの推移依存 `uuid` を修正版11.1.1へ限定override

## 2026-07-14 — Phase 1レビュー

- セッション既定7日設定
- ImportError、ImprovementLogを追加

## 2026-07-14 — Phase 1

- プロジェクト基盤、独自認証、ADMIN/VIEWER、基本マスタを追加
