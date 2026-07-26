# HPlus Analytics v2.2 Release Checklist

## Architecture

- [x] 画面からのPrisma直接参照なし（管理ダッシュボードを含む）
- [x] 既存Engine / Integration / DTOを再利用
- [x] 管理ダッシュボードの店舗別DATA HEALTHを店舗スコープで取得
- [x] 新規N+1ループを追加していない（固定3店舗のHealth集計を並列取得）
- [x] UIでKPI・Availability・Confidenceを再計算しない

## Data

- [x] ZEROとMISSINGを区別
- [x] UNAVAILABLEを0表示しない
- [x] TownとHeavenを合算しない
- [x] 目標未設定を0表示しない
- [x] contractsの提供可否を明示（現Engine DTOでは対象外）
- [x] 媒体対象範囲を明示

## UX / Responsive / Accessibility

- [x] Loading表示
- [x] DATA HEALTH導線
- [x] 店舗・期間・比較条件のURL同期
- [x] table caption / th scope / aria-live
- [x] 1280pxで横スクロールなしを確認
- [ ] 390px / 768pxの正式Viewport E2E
- [ ] 自動アクセシビリティ監査（axe等）

## Security

- [x] Server Componentで認証を実施
- [x] 未来日を現在日へ制限
- [x] 期間を最大92日に制限
- [x] 書き込みAPI・DB変更なし
- [ ] 店舗権限モデルが導入された場合の細粒度スコープ

## Quality

- [x] `npm run lint`
- [x] `npx tsc --noEmit --incremental false`
- [x] `npm test -- --run`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Docker build / restart / ps
- [x] Browserで主要表示確認
- [ ] 全主要画面の自動Browser E2E
- [ ] Visual Regression基盤

## Data / Schema safety

- [x] Prisma Schema変更なし
- [x] Migrationなし
- [x] 実績・ImportBatch・Alias・Cast・Store・Goal変更なし
- [x] Import実行なし

## Release gate

## 実測ゲート判定

- PASS：lint、`npx tsc --noEmit --incremental false`、全テスト、Webpack build、Docker build/up、git diff --check
- PASS：Prisma migration status（未適用なし）、Schema差分なし、データ変更なし
- PASS：Management Dashboardの1280px表示、店舗別DATA HEALTH、Loading解除、横スクロールなし
- ACCEPTED LIMITATION：contractsはEngine公開型未提供のためUNAVAILABLE。予約・成約の推測はしない。
- BLOCKED：390px/768px正式Viewport E2E、自動Accessibility監査、全主要画面Browser E2E、Visual Regression

### ACCEPTED LIMITATIONの扱い

- 内容：一部の正式ブラウザQA基盤が現環境にない。
- 業務影響：リリース前のモバイル表示保証と自動アクセシビリティ保証ができない。
- 回避方法：Chromiumで手動確認し、GA前に専用Playwright/axe環境で再検証する。
- 修正予定Phase：v2.2 RC2。
- Release blockerではない理由：本番公開判断前に未検証として停止できるが、現時点ではGA承認条件を満たさない。
