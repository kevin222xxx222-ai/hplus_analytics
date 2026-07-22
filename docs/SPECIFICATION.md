# HPLUS Analytics 最新仕様書

更新日: 2026-07-20
実装段階: Phase 3 デリヘルタウン取込・分析 完了

## 1. システム境界

本システムは店舗・キャスト・媒体データ分析専用の新規アプリです。ドライバー管理システムとは以下を共有しません。

- PostgreSQLデータベースと永続ボリューム
- ユーザー、認証、セッションCookie
- 環境変数
- Dockerコンテナとネットワーク
- Prismaスキーマとマイグレーション
- デプロイ設定とドメイン

Dockerリソース名は `hplus-analytics-*` / `hplus_analytics_*` を使用します。

## 2. 技術構成

- Next.js 16.2.10（App Router）
- React 19.2.4 / TypeScript
- Tailwind CSS 4、shadcn/ui互換のコンポーネント構成、Lucide Icons
- PostgreSQL 18
- Prisma ORM 7.8.0 + PostgreSQL driver adapter
- Node.js 24 LTS（Docker）
- Docker Compose

## 3. 認証・権限

ログイン識別子はログインIDまたはメールアドレスです。パスワードはbcrypt（cost 12）でハッシュ化し、平文保存しません。

ログイン成功時は暗号学的乱数で32バイトのセッショントークンを発行します。DBにはSHA-256ハッシュだけを保存し、ブラウザには次の属性を持つCookieを設定します。

- `HttpOnly`
- `SameSite=Lax`
- `Secure`（本番のみ）
- `Path=/`
- 有効期限は既定7日（`SESSION_DURATION_DAYS` で1〜30日の範囲で変更可能）

権限:

- `ADMIN`: 閲覧、マスタ設定、ユーザー追加・停止、CTI/Town取込、未紐付け解決。
- `VIEWER`: ホームと分析画面の閲覧。更新Server Action/APIはすべてサーバー側でADMINを再検証する。

初期管理者は環境変数を設定し `npm run db:seed` で作成します。シードは冪等です。

## 4. 店舗範囲

| 店舗 | 経営実績 | 集客分析 |
| --- | --- | --- |
| 春日部 | 対象 | 対象 |
| 越谷 | 対象 | 対象 |
| 野田 | 対象 | 対象外 |

- 経営実績の管轄全体 = 春日部 + 越谷 + 野田
- 集客分析の全体 = 春日部 + 越谷

## 5. データモデル

- `users`: ログインID、メール、表示名、パスワードハッシュ、ADMIN/VIEWER、利用状態
- `sessions`: セッショントークンハッシュ、有効期限、IP、User-Agent
- `stores`: 3店舗、表示順、経営実績対象、集客分析対象
- `casts`: UUID内部ID、表示名、正規化名、在籍期間、主所属、状態
- `cast_name_histories`: 内部表示名の変更前後、実行ADMIN、日時、任意理由
- `cast_merge_histories`: 重複Cast統合のsource/target、前後スナップショット、衝突整理、実行ADMIN
- `cast_aliases`: 媒体上の名前、正規化名、媒体、店舗、内部キャスト、確認状態、有効期間
- `media_listings`: 店舗・媒体ごとの掲載/非掲載状態。アクセスゼロとは別に保持する
- `import_sources`: 手動/Google Drive、媒体、店舗、データ種別、metricType、フォルダパス、状態
- `import_batches`: 取込ファイル、SHA-256、対象期間、モード、状態、件数、実行者、結果メタデータ
- `import_errors`: 取込バッチ、ファイル・シート・行・列、エラーコード、問題行、解決状態
- `cti_cast_daily`: 営業日・店舗・キャスト単位のCTI日次実績と元行情報
- `town_store_daily`: 日付・店舗単位のPV/UU/TEL/直帰率
- `town_cast_daily`: 日付・店舗・キャスト単位のPV/UU/TEL
- `town_url_daily`: 日付・店舗・正規化URL単位のアクセス
- `town_landing_daily`: 日付・店舗・正規化入口ページ単位のアクセス
- `improvement_logs`: 自動判定タイプ、対象期間、ルールバージョン、根拠、比較条件、解決状態

名前正規化はUnicode NFKCと全角・半角スペース除去を行います。ひらがな・カタカナは変換しません。未紐付けエイリアスは `PENDING` とし、キャストを自動登録しません。

内部キャスト表示名はADMINだけがキャスト管理から変更できます。更新対象は`casts.display_name`と`casts.normalized_name`だけで、内部UUID、CTI/TOWN/HEAVEN Alias、CTI/Town女子/URL/LP実績、MediaListingは変更しません。同じ正規化名の別キャストが存在する場合は候補を表示し、在籍期間が重複する候補を含む場合は管理者の再確認なしに保存しません。変更確定時は名前更新と`cast_name_histories`への履歴作成を同一トランザクションで実行します。

キャスト統合はADMIN専用の別機能です。sourceの全関連データをtargetへ移行し、sourceは物理削除せず`merged_into_cast_id`で最終targetを直接参照します。統合済みCast・同一IDは選択不可です。実績の一意キー衝突は完全一致だけ整理し、値が異なる場合は停止します。数値の加算・自動上書きは行いません。通常一覧・分析・Alias/取込候補は未統合Castだけを対象とします。詳細は`docs/CAST_MERGE.md`を参照してください。

## 6. 画面仕様

- ログイン: ID/メールとパスワード、エラー表示
- ホーム: 店舗数、在籍キャスト数、未紐付け数、取込元数、Phase 2案内
- 店舗マスタ: 正式名、表示名、有効状態、経営/集客対象の編集
- キャスト管理: UUID発行、在籍開始日、主所属、退店日、状態変更
- エイリアス管理: CTI/TOWN/HEAVEN別名の登録、確認待ち、紐付け、無視
- 媒体取込元設定: 手動/Drive、媒体、データ種別、店舗、metricType、フォルダ
- ユーザー管理: ADMIN/VIEWER追加、利用停止（自分自身は停止不可）
- CTI取込: XLSXアップロード、対象期間・モード指定、3店舗シート検出、プレビュー、警告/エラー表示
- CTIローカル一括取込: 固定・read-onlyフォルダ走査、ページ応答と走査の分離、対象日順・同時実行1の1ファイル検証、SHA重複/同日別SHA判定、安全条件付き確定、停止/再開、失敗継続・単件再試行。進捗分母は全対象で、全対象が終端状態の場合のみ100%
- 未紐付け解決: 既存キャストへ紐付け、新規キャスト作成、行の除外
- 取込履歴/結果: 状態、対象期間、登録・更新・除外・警告・エラー件数、元ファイル取得
- キャスト実績: 期間・店舗で絞り込み、出勤日数、出勤時間、接客、売上等
- 店舗実績: 店舗・日別集計、重複しない出勤人数と実績合計
- タウン取込: 店舗と4種別を明示選択、CSV検証、プレビュー、既存キャスト紐付け、確定取込
- Townローカル一括取込: 固定・read-onlyフォルダ走査、SHA重複判定、1ファイル順次検証、安全条件付き自動確定、失敗再試行
- Town未紐付け一括候補: CTI Alias・内部表示名・名前履歴・在籍期間を根拠にA/B/C分類し、A全件または管理者が選択したBだけを実行。ID形式・複数候補・期間外・Alias衝突・修正版はCとして一括対象外
- タウン店舗分析: 全体/春日部/越谷、期間、前日・前週比較、加重集計
- タウン女子分析: 店舗別/合計PV・UU・TELと同期間CTI実績、参考派生指標、独立ランキング、評価プレビュー、改善候補
- タウンURL/LP分析: 期間、店舗、ページ種別、キャストで絞り込み
- キャスト詳細: Town春日部/越谷/合計とCTIを同期間で併記

## 7. API / サーバー処理

- `GET /api/health`: アプリとDB接続状態をJSONで返す。監視・コンテナヘルス確認用。
- `POST /api/imports/cti/upload`: XLSXを非公開保存し、検証・プレビューを作成する。
- `POST /api/imports/cti/:id/resolve`: 未紐付け行を既存/新規キャストへ紐付け、または除外する。
- `POST /api/imports/cti/:id/confirm`: 日次データをトランザクション内でupsertする。
- `POST /api/imports/cti/:id/reparse`: FAILED / WAITING_FOR_CAST_LINK / COMPLETED_WITH_WARNINGS / COMPLETEDの保存済み元XLSXを、同じImportBatch IDのまま現在のCast在籍期間・Alias有効期間で再解析する。
- `GET /api/imports/cti/bulk/scan`: 固定CTIフォルダをADMIN権限で走査し、対象XLSXと重複状態を返す。
- `POST /api/imports/cti/bulk/process`: 既存CTI解析・確定サービスを1ファイル単位で実行し、安全条件を満たさない場合はプレビューで停止する。
- `GET /api/imports/:id/file`: 権限確認後に元XLSXを返す。
- `POST /api/imports/town/upload`: 店舗・種別を明示してCSVを保存、検証、プレビューする。
- `POST /api/imports/town/:id/resolve`: 既存キャストへのTOWN Alias紐付け、除外、保留。
- `POST /api/imports/town/:id/confirm`: 4種の日次データをupsertする。
- 認証とマスタ更新はServer Actions、取込はRoute Handlersを利用する。更新処理はADMIN権限と同一オリジンをサーバー側で検証する。

## 8. 計算式

Phase 2では接客数・契約数・報酬差引後金額を構成列から再計算し、元ファイル値と差がある場合は警告にします。正式集計は `service_count = 予約数 - キャンセル数`、`contract_count = 本指名数 + 写真指名数 + フリー数` です。CTI「成約数」は `source_contract_count`、CTI「接客数」があれば `source_service_count` として併存させます。`new_count` / `repeat_count` は「新規成約数」/「リピート成約数」だけを採用します。キャスト・店舗集計は日次実績を合算し、出勤人数/出勤日数は営業日単位で重複除外します。比率系の分母0は0ではなく算出不可（`null`）です。

Townの正式値は `average_pv = ΣPV / ΣUU`、`TEL率 = ΣTELタップUU / ΣUU` です。店舗横断・期間集計でも率の単純平均はしません。直帰率はUU加重平均です。CSVの平均PV/CVR原値は検算用に保存します。Town TELとCTI予約・成約は顧客単位では結合せず、同期間・同店舗/キャストの傾向比較に限定します。

### タウン女子分析の参考派生指標

既存保存値を変更せず、画面表示時だけ次を計算します。分母0は `null` です。

- UUあたり成約数（参考） = CTI成約数 ÷ Town UU
- UUあたり売上（参考） = CTI料金 ÷ Town UU
- TELあたり売上（参考） = CTI料金 ÷ Town TELタップUU
- 本指名率 = CTI本指名数 ÷ CTI成約数

Town UU/TELとCTI成約/売上は顧客単位で直接対応しないため、「成約率」「TEL成約率」とは表示せず、同一選択期間・同一店舗範囲の傾向比較に限定します。春日部、越谷、全体をそれぞれ独立集計します。

ランキングはPV、UU、TEL、TEL率、CTI料金、女子報酬、CTI成約数、本指名率、UUあたり売上を別々に降順集計します。同値は同順位、次順位を人数分繰り下げる競技順位方式です。TEL率/UUあたり売上はTown UU、本指名率はCTI成約数が設定最低母数未満なら順位対象外です。総合順位はありません。

評価プレビューは `EXCELLENT / GOOD / WATCH / INSUFFICIENT_DATA` を内部コードとし、好調/良好/要確認/データ不足と表示します。比較対象中央値・TEL率上位分位・最低母数を根拠として表示しますが、DB、Cast、ImprovementLogへ保存しません。改善候補も原因を断定しない参考文だけを画面表示します。

初期設定値は `TOWN_REFERENCE_MIN_UU=20`、`TOWN_REFERENCE_MIN_CONTRACTS=3`、`TOWN_REFERENCE_MIN_ATTENDANCE_MINUTES=240`、`TOWN_REFERENCE_EXCELLENT_TEL_QUANTILE=0.75` です。判定関数はこれらを引数で受け取り、運用検証後に環境設定で変更できます。

## 9. 未実装（Phase 4以降）

- ヘブン取込
- Town写メ日記投稿数スクレイピング
- 曜日・祝日分析、目標、着地予想、自動判定
- Google Drive API自動取込
- XServer VPS本番構築
- 通知（要件により実装対象外）

## 10. 制約・既知事項

- 月途中累計・月次確定CTIはプレビューまで対応し、日次との差分化・確定取込は未実装。
- 実運用XLSXの対象3店舗で、1行目ヘッダー、A1空欄のキャスト名列、全74列を確認済み。A列は主要11列中8列以上とデータ内容を条件に安全推定する。
- パスワード再設定、ログイン試行回数制限、監査ログはPhase 1の明示要件外で未実装。
- モバイルでは管理サイドバーを非表示にしている。第一版はPC管理画面を主対象とする。
- npm監査でNext.js内包PostCSSのmoderate警告が残る。現安定版に修正版がなく、本アプリはユーザー入力CSSを生成しないため該当経路を使用しない。
- Town女子/URL/LP CSVには行別日付がないため、Phase 3は対象開始日と終了日が同日のファイルだけを確定可能とする。
- Town CSVに存在しないキャストを非掲載へ自動変更せず、削除同期もしない。
- Townの部分取込後は `COMPLETED_WITH_WARNINGS` を完了状態のまま維持し、未紐付け行だけを後追い解決・除外できる。バッチ全体をプレビュー状態へ戻さない。
- タウン女子評価は公式評価ではなく、選択期間内のTown実績があるキャストを比較対象にしたプレビューである。少人数期間では中央値・上位分位が不安定になり得る。

## 11. Phase 1 更新履歴

- 新規独立プロジェクトを作成
- 認証とADMIN/VIEWER権限モデルを確定
- キャスト内部ID、在籍期間、媒体別名、掲載状態のモデルを確定
- 3店舗の経営/集客対象範囲をシードへ反映
- 将来の手動アップロードとGoogle Drive取込に共通利用できる取込元モデルを追加
- セッション有効期限を `SESSION_DURATION_DAYS` に変更し、既定7日・1〜30日の設定構造へ更新
- Phase 2開始前レビューとして `import_errors` と `improvement_logs` を追加
- DB全モデルと媒体掲載状態の設計を `docs/DATABASE.md` に文書化

## 12. Phase 2 更新履歴

- `import_batches` と `cti_cast_daily` を追加
- CTI女子別レポート3店舗シートのXLSX検証、プレビュー、取込履歴を実装
- 期間付き別名を優先する厳密なキャスト紐付けと、管理者による未紐付け解決を実装
- 日次データのトランザクション取込、再取込upsert、同一ファイル警告、部分取込を実装
- キャスト別・店舗別の日次基本集計画面を追加
- 列対応、取込運用、API、変更履歴を文書化
- 実CTIのA1空欄キャスト名列、出勤数、成約内訳を正式対応し、FAILEDバッチ再解析を追加

## 13. Phase 3 更新履歴

- 春日部・越谷の店舗/女子/URL/LP CSV手動取込を追加
- CP932、UTF-8、UTF-8 BOM、列順変更、種別誤選択、数値・割合検証に対応
- Town4日次モデル、店舗限定TOWN Alias、MediaListing連携を追加
- URL正規化、外部ID抽出、8ページ種別判定を追加
- 全体率を母数から再計算する店舗/女子/URL/LP分析とキャスト詳細統合を追加
- 実ファイルは外部参照の統合テストだけに使い、リポジトリには匿名化最小CSVのみ追加

## 14. タウン女子参考分析 更新履歴

- 既存値を再保存せず、4つの参考派生指標を春日部/越谷/全体へ追加
- 9指標の独立ランキングと競技順位方式、母数不足除外を追加
- 環境設定可能な最低母数・比較分位による評価プレビューを追加
- 根拠指標付きの非断定的な改善候補を追加し、ImprovementLogへの保存は行わない

## 15. Town完了後の未紐付け解決

- `PREVIEW_READY`、`WAITING_FOR_CAST_LINK`、`COMPLETED_WITH_WARNINGS`、およびOPEN未紐付けを持つ`COMPLETED`で解決UI/APIを許可する
- 解決対象はTOWN_CAST/TOWN_URL/TOWN_LANDINGの `cast_id=null`、非SKIPPED、対応するOPEN `UNMATCHED_CAST` がある行だけとする
- 完了済みバッチではAlias作成、同店舗・同一正規化名の再解決、未反映行upsert、ImportError解決、件数再集計を一操作で行う
- URL/LPの既存アクセス行は値を再加算せず、nullableな `cast_id` だけを含む最新行へupsertする
- pendingとOPEN警告・エラーが0になれば`COMPLETED`、残れば`COMPLETED_WITH_WARNINGS`を維持する
- inserted/updatedはmetadataの一意キー台帳と実績テーブルの一意制約から累計再計算し、操作イベントを`importEvents`へ保存する

## 16. Town未紐付けからのキャスト作成

- Town女子別のOPEN未紐付け行に限り、ADMINが画面遷移せず内部Castを新規作成できる
- 原文名、対象店舗、対象日を初期値とし、主所属店舗・在籍開始日・任意メモを管理者が確認・変更する
- Cast、対象店舗TOWN Alias、MediaListing、プレビュー、ImportError、同名女子/URL/LP再解決、実績upsert、件数再集計を同一DBトランザクションで行う
- 同じ正規化名の在籍候補が1件なら既存紐付けを推奨し、別人作成には確認を必須とする。複数候補なら新規作成を停止する
- サーバーは同名単位のトランザクションロック後に候補を再検査し、並行操作による意図しない二重作成を防ぐ
- URL/LP画面からの直接作成、原文名だけによる自動作成、VIEWER操作は許可しない

## 17. 久喜所属店舗

- `KUKI / 久喜`はキャストの主所属先としてのみ使用する
- `hasManagementMetrics=false`、`hasAcquisitionMetrics=false`とし、店舗実績、管轄全体、Town分析、Town取込、CTI対象シート、目標、取込フォルダへ含めない
- 久喜所属キャストでも、実際の実績行・Alias・MediaListingの`store_id`は春日部等の活動店舗を保持できる
- 店舗・管轄集計はCastの主所属ではなく実績行の`store_id`を使う

## 18. Cast・Alias開始日の一括前倒し

- ADMIN専用の `/masters/casts/start-date-maintenance` で複数Cast、一括開始日、CTI/TOWN/HEAVEN/全媒体を選択する
- `Cast.startedOn` と対象媒体の `CastAlias.validFrom` は、指定日が現在値より前の場合だけ更新する。後ろ方向の変更、`validTo`、ID、実績、MediaListingは変更しない
- 統合済みsourceCast、指定日が`endedOn`より後のCast、Alias一意キー衝突、前倒し区間に別Castの同名Aliasがある操作は実行不可とする
- 退店済みCastの在籍判定は`startedOn`/`endedOn`を唯一の真実とし、専用のIgnore・除外状態は追加しない。`endedOn`より後のTown行はC（在籍期間外）へ分類し、退店日設定後の再解析で再評価する。Town AliasとMediaListingは削除せず履歴として保持する。
- 変更前に全Cast/Aliasの前後値、衝突、入店日確認注意を表示し、実行時に同じフィンガープリントをSerializableトランザクション内で再検証する
- Cast、Alias、監査履歴を単一トランザクションで更新し、一部失敗時は全件ロールバックする
- 一括変更は既存プレビューJSONを自動書換えしない。既存未紐付けバッチは詳細画面の再解析により、拡張後の期間を使って再解決する

## 19. CTI既存バッチ再解析

- 初回アップロードと再解析は共通の`analyzeCtiWorkbook`を使用し、パーサー・resolver・警告判定を分岐させない
- `ImportBatch.storagePath`の保存済みXLSXを読み、現在の`Cast.startedOn/endedOn`と`CastAlias.validFrom/validTo`で同じバッチを再評価する
- 更新対象は`preview.json`、当該バッチの`ImportError`、ImportBatchの検出列・pending/warning/error/skipped・状態だけとする
- CtiCastDaily、Cast、CastAlias、MediaListing、元XLSX、ImportBatch ID、既存inserted/updated件数は変更しない
- WAITING_FOR_CAST_LINKは結果に応じてPREVIEW_READYまたはWAITING_FOR_CAST_LINKへ更新する。完了済みバッチは完了系状態を維持する
- 完了後に未紐付け・警告・取込可能件数の前後差を画面表示する
