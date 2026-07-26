# HPlus Analytics v2.2 Rollback Plan

## 判断基準

- 認証・認可漏れ、主要数値の重大不一致、継続Runtime Error、Docker起動失敗は即時Rollback。
- 390px/768pxで主要操作不能、またはCritical/Seriousアクセシビリティ違反が確認された場合はGAを停止し、必要ならRollback。

## 対象

- 対象Branch：`main`
- 対象Commit：リリース時に承認済みCommitを記録する。
- 前バージョン：v2.1（実際のタグ/イメージIDはRelease担当が記録）。
- DB Migration：v2.2ではなし。
- Prisma Schema：v2.2では変更なし。
- 実績・ImportBatch・Alias・Cast・Goalデータ：変更なし。

## アプリRollback手順

1. 新規デプロイを停止し、Release担当がRollback判断を承認する。
2. v2.1の承認済みDocker ImageまたはCommitを指定する。
3. `docker compose up -d app`でappのみを旧版へ戻す。
4. `docker compose ps app`でrunning/healthを確認する。
5. `/`、`/analytics/management`、`/data-health`、Store Analyticsを読み取り確認する。
6. Console Error、認証Redirect、主要KPI、Availabilityを確認する。

## DB復旧

DB変更がないため、Rollback時のDB migration rollbackやデータ復元は不要。DBコンテナ・Volumeを削除してはならない。

## 責任者と所要手順

- 責任者：Release Managerが承認し、運用担当が実行。
- 想定作業：旧Image選択、app再起動、Smoke確認。

## Rollback後確認画面

- HOME
- 全店舗ダッシュボード
- DATA HEALTH
- Store Analytics
- 目標管理（読み取り）
