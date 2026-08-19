# HPlus Analytics External Development Brief v1.0.1

## 1. これは何か

HPlus Analyticsは、CTI・デリヘルタウン・シティヘブンの実績を統合し、店長・管理者が「昨日何が起きたか」「曜日の構造」「キャストの改善確認箇所」「目標との差」を短時間で把握する社内分析基盤です。単なるBIではなく、営業会議・面談で次に確認する事実を提示することを重視します。

## 2. 現在の完成範囲

`v1.0.1-production-ready`を引継ぎ基準とします。認証、Home/Morning Report、Management Dashboard、Store Analytics、Weekday Analytics、Cast Diagnosis/Comparison/Action/Trend、Goals、Data Health、CTI/Town/Heaven手動Import、Alias/Merge、Production deploy/backup/restore/retention手順が実装済みです（コード確認済み）。Productionは`https://analytics.womansgroup.link`で稼働し、HTTPS、既存admin login、`/api/health`（`status=ok`、`database=connected`）を確認済みです。

Phase H v1のGoogle Drive取得基盤（scan、detection、download、SHA-256、DriveFileState、RESOLVE_ONLY poll）はProductionで稼働確認済みです。実データのImport Pipeline自動実行、AUTO confirm、ImportBatch自動作成は未解放です。外部監視、offsite backup、login rate limit/password reset、AI施策自動実行も未実装です。破壊的な`restore-production.sh`の本番全手順は未検証です。

## 3. 技術構成

Next.js 16.2.10、React 19.2.4、TypeScript、Tailwind CSS 4、Node 24、PostgreSQL 18、Prisma 7.8、Docker Compose、Vitest、Playwright。XServer VPS上でNginx→HTTPS→127.0.0.1:3001→Docker app、driver-management（port 3000）とはHost分離。Let's Encrypt/Certbot自動更新、UFW、SSH key運用をProductionで確認済み。VPSの正確なOS/server blockは未確認です。

## 4. データと重要制約

- CTI: cast×store×日次、XLSX、3店舗。
- Town: store/cast/url/landing×日次、春日部/越谷。
- Heaven: 春日部のみ。越谷を0補完しない。
- `VALUE`、`ZERO`、`MISSING`、`UNAVAILABLE`、`UNCOMPUTABLE`を区別。
- ImportはSHA-256、ImportBatch、自然キーunique、upsertで二重計上を防止。
- Cast Aliasは媒体・店舗・有効期間を持つ。merged castは分析除外。

## 5. 主要画面

| URL | 概要 |
|---|---|
| `/` | 朝の事実、当月進捗、Data Health |
| `/analytics/management` | 全体/店舗KPI、比較、目標 |
| `/analytics/store` | 店舗結果、日/週詳細、媒体 |
| `/analytics/time` | 曜日×第1〜5週、Heatmap、営業メモ |
| `/analytics/cast` | キャスト一覧 |
| `/analytics/cast/[castId]` | Diagnosis、Comparison、Action、Trend Summary |
| `/analytics/cast/[castId]/trend` | 月次推移、改善ストーリー |
| `/imports/*` | CTI/Town/Heaven取込 |
| `/data-health` | 取込状態と最新確定日 |
| `/settings/goals` | 月次目標 |

## 6. 曜日・キャスト分析の思想

曜日分析は絶対値を主役とし、累計/1日平均表示を分離します。Heatmapの評価は常にセル日平均と全有効セルの日平均baselineで計算し、色は良否ではなく平均との差の方向です。Cast Diagnosis/Actionは原因を断定せず、Availability・Confidence・比較証跡と確認項目を表示します。

## 7. 本番運用

配置先は`/opt/hplus-analytics`。`deploy-production.sh`はProductionでmain、未コミット変更、Compose、image build、DB health、temporary migration、app起動、healthまで実行成功。seedはdeploy時に実行しません。`backup-production.sh`はcustom dump、サイズ、pg_restore-list、正式名SHA-256、自己検証までProductionで成功。`restore-production.sh`はchecksum、pre-restore backup、完全な`RESTORE`確認、schema reset、migration status、healthを必須化しますが、破壊的な本番全手順は未検証です。開発DB→Productionの手動custom-format pg_restoreは成功済みです。

保持処理は14日、`-mmin`ベース、dry-runデフォルト、`--apply`必須です。Productionで14日dry-run（候補なし）と1日dry-run（24時間超候補）を確認済み。root crontabに毎日03:00 backup、04:00 retentionを登録し、`/var/log/hplus-backup.log`と`/var/log/hplus-backup-retention.log`へ出力しています。

移行時点のProduction snapshotはpublic table 23、migration 11、stores 4、users 1、casts 199、cast_aliases 374、cti_cast_daily 8654、heaven_cast_daily 66430、heaven_shop_daily 1877、import_batches 721、import_errors 1523、import_sources 18、sessions 11、town_cast_daily 9584、town_landing_daily 17339、town_store_daily 136、town_url_daily 38608です。これは固定仕様値ではなく、移行時点の照合値です。

## 8. 開発会社に依頼可能な作業

1. RESOLVE_ONLY後段のGoogle Drive preview→ADMIN confirm→ImportBatch連携（実Import解放判断を含む）。
2. retry/quarantine/lock/通知とData Health連携。
3. backup暗号化、offsite保管、restore drill、RTO/RPO。
4. authenticated Playwright CI、visual/a11y gate、OpenAPI/contract tests。
5. login hardening、secret rotation、WAF/reverse proxyレビュー。
6. query/payload benchmark、キャッシュ、構造化ログ・監視。

## 9. 引継ぎ時の禁止事項

Importの自然キー・Availability・Heaven春日部固定・Heatmap baseline・売上/報酬定義を変更しない。schema変更前はbackupとmigrationレビューを行う。driver-managementのDB、port、volume、NginxをHPlusの作業で変更しない。

## 10. 未検証事項

正確なVPS OS、Nginx server block、resource limit、外部監視、QA credentialsによるE2E、npm auditのネットワーク実行、Google Workspace権限、破壊的なProduction restore script全手順は引継ぎ時に確認する。完全仕様書の`CONFIRMED/NOT VERIFIED/FUTURE`ラベルを優先する。

## 11. 最初に読む資料

1. `docs/HPLUS_ANALYTICS_COMPLETE_SYSTEM_SPECIFICATION_v1.0.1.md`
2. `README.md`
3. `docs/PRODUCTION_DEPLOYMENT.md`
4. `docs/PRODUCTION_BACKUP.md`
5. `docs/PRODUCTION_RESTORE.md`
6. `docs/PRODUCTION_BACKUP_AUTOMATION.md`
7. `docs/FEATURE_FREEZE_FULL_AUDIT_2026-08-11.md`
