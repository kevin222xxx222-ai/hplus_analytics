# HPlus Analytics Feature Freeze後 全体総合監査

- 監査日: 2026-08-11（JST）
- 監査対象: `/Users/matsu/Documents/Codex/HPlus_Analytics`
- 監査方針: 既存コード、DB、コンテナ、テスト、ドキュメントを読み取り専用で照合。今回、アプリのソース・Prisma schema・migration・設定・テストは変更していない。
- 判定: **READY WITH CONDITIONS（条件付きでリリース準備可能）**。ローカルのビルドとDB接続は正常だが、本番公開前にP1/P2の運用・セキュリティ条件を満たす必要がある。

## 1. 結論サマリー

Feature Freeze後の主要分析画面（Home、Management、Store、Cast、Trend、曜日分析）と、CTI/Town/Heavenの手動取込基盤は実装済みとして確認できる。`npm test`、lint、TypeScript、Next build、Prisma migration statusは成功した。

ただし、以下は本番公開の前提条件として未完了または未検証である。

1. Google Drive自動取込、定期実行、失敗時の再試行・隔離は未実装。
2. バックアップの自動化、リストア訓練、監視通知、構造化アプリケーションログは未整備。
3. 本番HTTPS／リバースプロキシ／秘密情報管理／DBポート非公開はローカル構成からは未検証。
4. E2Eは24テストを列挙できるが、`QA_LOGIN_ID`/`QA_LOGIN_PASSWORD`が必要で、今回の監査では認証済み実行を完了していない。
5. 稼働DBログに、Alias/開始日変更履歴のFK違反とcast name historyの長さ超過が繰り返し記録されている。分析参照は継続しているが、管理操作の監査証跡については修正前に再監査が必要。
6. Docker app起動時に毎回 `prisma migrate deploy` と `prisma db seed` を実行するため、単一環境では冪等でも、本番の複数レプリカ・権限分離・起動時間の観点で運用手順を分離すべき。

### 優先度集計

| 優先度 | 件数 | 主な内容 |
|---|---:|---|
| P0 | 0（ただし公開前ブロッカーあり） | 現時点で即時のデータ破壊・認証バイパスは確認していない |
| P1 | 5 | 本番境界、バックアップ、監視、取込自動化、管理履歴エラー |
| P2 | 8 | E2E実行条件、性能、再解析、レート制限、依存更新、ログ運用など |
| P3 | 4 | 文書整理、UI/運用改善、将来の保守性 |
| FUTURE | 4 | Google Drive、スケジューラ、通知、施策自動化など |

P0件数が0でも、P1を解消しない状態は本番GA承認不可とする。

## 2. 監査対象と実行環境

### リポジトリ

- Git HEAD: `e92dbd2` (`merge: Phase F1 Management Dashboard`)
- タグ: `v1.0.0-phase-f1`
- `git status --short`: 監査開始時点で変更なし
- package scripts: build、lint、Vitest、6本の監査CLI、Playwright E2E/a11y/visual、QA gate、Prisma運用コマンドを確認。

### 実行結果

| コマンド | 結果 | 備考 |
|---|---|---|
| `npm test -- --run` | PASS | 74 files、346 passed、2 skipped / 348。pg query deprecation warningあり |
| `npm run lint` | PASS | ESLint errorなし |
| `npx tsc --noEmit --incremental false` | PASS | 型エラーなし |
| `npm run build` | PASS | Next 16.2.10、全ページ生成完了 |
| `git diff --check` | PASS | 空白エラーなし |
| `npx prisma migrate status` | PASS | 11 migrations、DBはup to date |
| `npm audit --omit=dev --audit-level=high` | 未検証 | registry DNSが解決できず audit endpointへ接続できなかった |
| `npx playwright test --list` | PASS（列挙のみ） | 24 E2E（a11y/routes/visual）。認証情報なしの実行結果は未取得 |

### Docker/DB

- `hplus-analytics-app`: running、port 3000公開。
- `hplus-analytics-db`: running (healthy)、PostgreSQL 18 Alpine、port 5432もホスト公開。
- DB timezone: `UTC`。アプリの表示時刻は用途ごとにJST formatterを使う必要がある。
- 実DB row概数: stores 4、casts 199、cast_aliases 374、users 1、sessions 11、import_batches 721、import_errors 1523、cti_cast_daily 8654、town_cast_daily 9584、town_url_daily 38608、town_landing_daily 17339、heaven_cast_daily 66430、heaven_shop_daily 1877。
- ImportBatch status: COMPLETED 579、COMPLETED_WITH_WARNINGS 88、PREVIEW_READY 15、WAITING_FOR_CAST_LINK 37、FAILED 1、CANCELLED 1。
- 実績期間（DB実測）: CTI 2026-04-01〜2026-08-07、Town/Heavenの主要日次 2026-06-01〜2026-08-07。
- Heaven誤店舗確認: `heaven_cast_daily` の越谷行は0、春日部行は66430。Heaven春日部固定の実績整合は確認できた。

## 3. 実装機能棚卸し

### IMPLEMENTED

| 領域 | 確認した実装 |
|---|---|
| 認証・権限 | DB session、httpOnly cookie、ADMIN/VIEWER、APIのADMIN再検証、ログイン/ログアウト |
| Home/Management | 日次ブリーフ、管理ダッシュボード、データヘルス導線 |
| Store Analytics | 店舗・全体の結果、媒体、日/週詳細、Availability表示 |
| Cast Analytics | Diagnosis、指標別Comparison、Action Plan、Trend Summary/Trend page、Media Funnel参考表示 |
| 曜日分析 | 曜日×週、Heatmap、営業サマリー/メモ、比較、対象日数、全期間range、店舗別scope |
| Import | CTI XLSX、Town CSV、Heaven CSVのpreview/confirm/reparse、file hash、重複扱い、ImportBatch/Error |
| Master | Store/Cast/Alias、Cast merge、name history、start-date bulk maintenance |
| Data Health | 取込状態・未反映・最新反映日を確認する読み取り画面 |
| Goal | 月次目標と変更履歴の保存・表示 |
| QA/監査 | Vitestのunit/integration、audit CLI 6本、Playwright/a11y/visualの枠組み |

### PARTIAL / 条件付き実装

| 領域 | 事実と残り |
|---|---|
| E2E/実ブラウザ | 24テストと認証fixtureは存在するが、QA secretを用いた実行結果は今回未取得。visual snapshot承認運用も別途必要 |
| 本番デプロイ | Docker Composeのproduction build/startはあるが、VPS/HTTPS/proxy/secret rotation/DB非公開は未検証 |
| Import後運用 | preview、warning、reparseはある。一方で失敗の自動retry/quarantine、定期取込、担当者通知は未接続 |
| Town partial recovery | `docs/TOWN_ID_NO_SOURCE_URL_PARTIAL.md` が、`COMPLETED_WITH_WARNINGS` の後日再解析経路未実装を明記 |
| 監査履歴 | schema上のFKはあるが、稼働ログで開始日履歴FK違反とcast name長さ超過が再現している |
| ログ/監視 | `/api/health` はあるが、アプリ構造化ログ、メトリクス、外部通知、SLOは未確認 |

### NOT IMPLEMENTED / DEPRECATED / FUTURE

| 区分 | 内容 |
|---|---|
| FUTURE | Google Drive API自動取込、Drive webhook/polling、scheduler、retry/quarantine、担当者通知 |
| FUTURE | 自動バックアップ、オフサイト保管、定期restore drill、監視アラート |
| NOT IMPLEMENTED | パスワード再設定、ログイン試行回数制限、専用監査ログ（`docs/SPECIFICATION.md`記載） |
| NOT IMPLEMENTED | 媒体から予約・成約への直接経路の確定、因果推定、自動施策実行 |
| DEPRECATED候補 | `/analytics/diary` はビルド上の既存route。サイドバー通常導線からは除外方針だが、route/APIを削除した状態ではない |

## 4. Analytics/Diagnosis/Action/Trendの監査

- DiagnosisはAvailabilityを保持し、未取得を0補完しない経路を確認。Primary/Confidence/Peer証跡はaudit docsとengine testsで裏付けられる。
- Comparisonは指標別軸、本人除外、Peer不足、同一Cast Alias統合監査の経路を保持。
- Actionは面談方針DTOとReview Targetを持つ。Actionの自動実行・AI文章生成・通知は行わない。
- TrendはCast月次集計と個別Trendページが存在し、PARTIAL/MISSING/UNAVAILABLEをDTOで保持する。一般の推移画面は存在するが、Google Drive等のデータ供給を自動化するものではない。
- 曜日分析はDBからCTI/Town/Heavenを読み、Heavenは春日部のみ、越谷/野田を0補完しない。`weekOfMonthMatrix`を再利用してHeatmap/週ランキングを表示する。
- 統計値の「因果」やキャスト個人評価を断定する文言は監査資料上抑制されている。

## 5. Import/Idempotency/Data Integrity

### 確認できた安全策

- CTI/Town/HeavenともSHA-256 `fileHash`を計算し、完了済み同一hashを重複扱いにする。
- daily fact tablesに自然キーunique制約と`import_batch_id` FK/indexがあり、同日再取込はupsert経路。
- Heaven APIは春日部storeId以外を400 (`HEAVEN_STORE_NOT_SUPPORTED`) で拒否。
- XLSX/CSVの拡張子、MIME、サイズ上限、magic bytes/バイナリを検査。
- 更新系import APIは`assertSameOrigin`と`requireAdminApi`を通る。

### リスク/未完了

- `ImportBatch`が完了前のまま残る可能性はstatus運用で確認し、PREVIEW/WAITING/FAILEDの担当者処理と期限を運用化する必要がある。
- 同一キーupsertは最新batchが値を更新し得るため、ロールバックは`import_batch_id`とmetadata/eventを用いた事前previewなしに実施しない。
- 稼働DBログのFK/長さ超過エラーは管理操作の証跡欠落につながる。P1として原因特定・再現テスト・既存失敗行の棚卸しが必要。
- Import実データの長期保管、ファイル削除、個人情報を含む原本の保持期間・暗号化・アクセス監査は未定義。

## 6. DB/Migration/Persistence

- Prisma schemaと11 migrationは一致し、`migrate status`はup to date。
- named volume `hplus_analytics_postgres` にDBを永続化。Upload原本は `hplus_analytics_uploads`。
- Production DB handoffは可能だが、事前バックアップ、restore確認、`migrate deploy`、アプリread-only smoke、row count/最新日照合、rollback計画を必須化する。
- `docker-compose.yml`でDBの5432をホスト公開しているため、本番では閉じる。DBはapp network内のみにする。
- migrationは本番で`migrate dev`を使わず、レビュー済みSQLを`migrate deploy`。スキーマ変更を伴う次フェーズはバックアップ後に別承認とする。

## 7. Auth/Security/Upload

### Positive

- session tokenはrandom bytes、DBにはSHA-256 hashのみ保存。
- CookieはhttpOnly、productionではSecure、SameSite=Lax、期限7日（環境変数で1〜30日）。
- APIはhealth以外をADMIN/ログインで保護する網羅性を確認。
- proxyは未ログインをloginへリダイレクトし、サーバー側`requireUser`/`requireAdmin`も実施。

### P1/P2

- proxyだけでは「cookieが存在する」ことしか判定しないため、保護は各server/API側の再検証に依存する。新規route追加時のauth coverage testをCI gateに固定する。
- ログイン試行回数制限、アカウントロック、パスワード再設定、セッション失効UIは未実装。
- `assertSameOrigin`はOriginヘッダが無い場合に許可する設計。Cookie SameSiteと組み合わせた現実的な防御だが、reverse proxy配下のtrusted origin設計を本番で明示する。
- upload sizeのアプリ側検証はあるが、reverse proxy/body limit、ウイルス/マクロスキャン、原本暗号化、保存期間は未検証。
- `.env.example`は開発用デフォルトパスワードを含む。`.env`自体はgitignoreだが、本番secret managerと起動時の必須検証が必要。

## 8. Docker/Production Readiness

- DockerfileはNode 24、multi-stage、Prisma generate/build、production `next start`。
- app起動commandは `npx prisma migrate deploy && npx prisma db seed && npm start`。seedは冪等だが、複数レプリカでの責務分離・migration lock・起動失敗時の再試行を本番runbookに明記する。
- `restart: unless-stopped`、DB healthcheck、named volumesはローカル運用として妥当。
- 本番未確認: TLS終端、HSTS、proxy headers、アクセスログ、resource limits、readiness/liveness分離、secret rotation、DB port非公開、バックアップ暗号化。

## 9. Performance/Scalability

- 主要日次テーブルに`store/date`、`cast/date`、`import_batch_id`、自然キーunique indexが存在。
- 曜日集計は範囲内のCTI/Town/Heaven rowsを`findMany`しアプリ側で配列集計する。現在の実測（数万行）では成立するが、数年・全店舗・同時アクセスではDB側集約またはキャッシュが必要。
- Cast/Trendの広い期間取得も同様にpayloadが増える。API response size、p95、メモリ、同時実行数の計測は未実施。
- ループ内DBアクセス（N+1）を全サービスで完全計測した証跡はない。P2としてquery logging/benchmarkを追加する。
- Frontendの曜日ページは単一コンポーネントに多くの表示責務を持つ。Feature Freeze後の変更は表示専用小分けと回帰テストを必須にする。

## 10. Data/Date/Timezone/Availability

- DBはUTC。日次business dateはdate型で保持し、表示時にAsia/Tokyoを明示する方針。
- Homeは最新確定日を未来日からクランプするテストがある。Cast diagnosis serviceもfuture clamp/source noteを返す。
- AvailabilityはVALUE/ZERO/MISSING/UNAVAILABLE/UNCOMPUTABLEを指標ごとに保持し、媒体非対象店を0補完しない。
- 監査上、Town/HeavenはCTIより開始日が遅い（2026-06-01〜）。全期間初期値と媒体欠測表示はこの差を考慮する。
- 月途中/PARTIALはTrend/曜日DTOに存在。期間・最新確定日・PARTIALを運用画面で継続確認する。

## 11. Tests/QA/CI

- Vitestは346 passed、2 skipped。skippedの理由と期限をリリースゲートに明記する。
- API、engine、import parser/persistence、UI view-model、cast merge/start-date、Heaven policyのテストが存在。
- Playwrightはroutes/a11y/visualの24テストを列挙できる。認証fixtureは`QA_LOGIN_ID`/`QA_LOGIN_PASSWORD`必須で、今回の実行は環境未提供のため未検証。
- visual snapshotは承認済みbaselineが必要（`docs/QA_AUTOMATION_D27.md`）。CIで秘密情報とDB fixtureを注入する手順が必要。
- `scripts/qa-release-gate.ts`はlint/typecheck/unit/build/Playwrightをrequired gateとしている。今回Playwright未実行のため、GA判定は未完了。
- `npm audit`はネットワークDNS失敗で未検証。依存はNext 16.2.10、Prisma 7.8.0等で、更新通知がログに出ているため定期更新計画が必要。

## 12. Docs/Source Drift

確認したドリフト候補:

- READMEのCurrent Statusは「次: Store Analytics v2」のままで、現行のCast/Trend/Weekday/Media Funnel完成状況を反映していない。
- `docs/HEAVEN_IMPORT_DESIGN.md`は「Parser／プレビュー基盤、実績確定未実装」と記載する一方、現コード/DBにはHeaven confirm・fact tables・policy testsがある。仕様書の状態欄を現行実装に更新する必要がある。
- `docs/CAST_ANALYTICS_CA5_TREND_AUDIT.md`は監査DTO段階の記載が残る。現在のTrend API/UI接続状況と「月次Diagnosisは現在ルール再計算」を明示して整理する。
- `docs/SPECIFICATION.md`のPhase 4未実装（Drive、VPS、security gaps）は現状と整合するが、Feature Freeze監査のP1/P2一覧へリンクを追加すると運用しやすい。
- `docs/TOWN_ID_NO_SOURCE_URL_PARTIAL.md`は後日再解析未実装を正しく警告している。これを運用上の停止条件としてData Healthへリンクする。

## 13. Google Drive / 自動取込の次フェーズ計画

現状は`ImportSource.kind`と`folderPath`を保持できるだけで、Drive API client、OAuth/service account、差分cursor、webhook/polling、scheduler、retry/quarantine、通知は未実装。

推奨順序:

1. Drive接続方式・権限・対象folder・秘密保管を決定（service accountまたはWorkspace OAuth）。
2. read-only discovery（file id、etag、modifiedTime、sha256、source period）を実装し、ImportBatch previewへ接続。
3. 既存manual parserを共通pipelineとして利用し、hash/idempotencyとstore/media policyを再利用。
4. confirmは管理者承認のまま、初期は自動確定しない。失敗batchをquarantineし、担当者通知を行う。
5. schedulerは一日一回から開始し、retry/backoff、lock、監査ログを追加。
6. `Drive -> preview -> human confirm -> facts -> Data Health -> analytics` を一通りE2Eで検証してから自動確定範囲を拡張。

## 14. DB handoff/runbook

### 事前

1. 書き込み停止または取込凍結時間を設定。
2. `pg_dump --format=custom` とupload原本の暗号化バックアップを取得し、checksumを保存。
3. backupから別DBへrestoreし、migration status、FK、unique、row count、最新business dateを照合。
4. secretsをsecret managerへ登録し、DB port外部公開を解除。

### 適用

1. reviewed imageを固定tagでdeploy。
2. migration専用jobで `npx prisma migrate deploy`（app replica起動commandから分離）。
3. health/readiness、ログイン、Data Health、Store/Cast/Weekday、Import previewのread-only smoke。
4. importは確認後に再開し、最初のbatchは少量ファイルで検証。

### ロールバック

- アプリのみ: 前imageへ戻し、schema互換性を確認。
- schema変更後: down migrationを自動実行せず、バックアップrestoreまたはレビュー済みforward fixを選択。
- データ誤取込: ImportBatch、fileHash、import_batch_id、metadata/eventを用いて対象batchだけをpreviewしてから訂正。

## 15. Production deploy checklist

- [ ] P1管理履歴FK/文字長エラーを修正・再監査
- [ ] HTTPS reverse proxy、HSTS、Secure cookie、trusted proxy headers
- [ ] DB 5432外部公開解除、network policy
- [ ] secret manager、初期admin password、rotation、`.env.example`の開発値分離
- [ ] backup + restore drill + offsite保管
- [ ] health/readiness/liveness、外部監視、通知先、ログ保持
- [ ] Playwright authenticated E2E/a11y/visualをCIでPASS
- [ ] npm audit（ネットワーク可能なCI）と依存更新方針
- [ ] Import failure/retry/quarantine/manual recovery runbook
- [ ] migration deployをapp startupから分離
- [ ] 本番データのrow count、最新日、Availability、Heaven春日部固定を確認

## 16. 主要課題バックログ

| ID | 優先度 | 課題 | 受入条件 |
|---|---|---|---|
| FF-01 | P1 | 管理履歴FK/文字長超過エラー | 再現テスト、エラー0、履歴の欠落/再試行方針 |
| FF-02 | P1 | 本番境界（HTTPS/DB/secret） | stagingでTLS、DB非公開、cookie/headers確認 |
| FF-03 | P1 | backup/restore/monitoring | restore drill、外部監視、通知、保持期間 |
| FF-04 | P1 | Import運用自動化前の安全策 | retry/quarantine、担当通知、manual recovery |
| FF-05 | P1 | 認証済みE2E gate | QA secret付きPlaywright全件PASS |
| FF-06 | P2 | query/payload benchmark | 代表期間・全店舗・同時実行でp95/メモリ基準 |
| FF-07 | P2 | login hardening | rate limit、lockout、password reset、session revoke |
| FF-08 | P2 | ドキュメント状態更新 | README/Heaven/Trend/仕様書のImplemented/Partial一致 |
| FF-09 | FUTURE | Google Drive pipeline | discovery、preview、confirm、retry、監査、E2E |

## 17. Final verdict

**Feature Freeze状態は「実装凍結」としては成立、Production GAは条件付き。**

- 分析Engine/API/DBの主要経路は、テスト・build・migration status・実DB件数で確認できた。
- ただし、E2Eの認証済み実行、ネットワーク越し依存監査、本番インフラ、バックアップ/監視、管理履歴エラーは未完了。
- Google Drive自動取込は現時点で未実装であり、次フェーズの設計・実装対象。手動Importを前提にした現行Feature FreezeをDrive実装済みと誤認しない。
- DB handoffは可能だが、上記checklistとrunbookを満たすまで本番GA承認は行わない。

## 18. 監査制約

- 今回はコード、schema、migration、DBデータ、コンテナ状態を変更していない。
- `npm audit`はネットワーク制約で未検証。Playwrightはテスト列挙までで、QA credentialsを用いた実行は未検証。
- ブラウザの見た目・Consoleの実測は、認証済みQA E2Eを実行できる環境で再実施する。
