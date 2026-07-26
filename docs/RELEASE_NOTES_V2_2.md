# HPlus Analytics v2.2 Release Notes（案）

## 追加・改善

- Daily BriefとHOME Consolidationを継続利用可能。
- 全店舗ダッシュボード（`/analytics/management`）を追加。
- 店舗別の母数・効率・売上・媒体範囲・DATA HEALTHを比較可能にした。
- 店舗別DATA HEALTHを店舗スコープで集計し、全体状態を無条件に複製しないようにした。
- 未来日入力と長すぎる期間を正規化した。
- Availability（利用可能 / 0件 / データ不足 / 対象外等）を保持。
- 単独TypeScriptチェックで検出された既存テスト型不整合を修正。

## 対象範囲

- CTI：春日部・越谷・野田
- Town：春日部・越谷
- Heaven：春日部

媒体から予約・成約への直接経路は算出しない。TownとHeavenのPV相当値も合算しない。

## 品質確認範囲

- lint、TypeScript、全テスト、Webpack/Docker buildを実施。
- Management DashboardのChromium表示と横幅を確認。
- 全画面・全ViewportのBrowser E2E、axe、Visual Regressionは未完了。

## 既知の制約

- contracts / 成約指標は現行Analytics Engineの公開VolumeMetricにないため、推測表示しない。
- 店舗別目標は未導入のため、全体目標を店舗へ按分しない。
- グラフは既存表示を優先し、新規の予測・相関・AI機能は含まない。
- 390px / 768pxの正式Browser E2E、全画面自動E2E、Visual Regressionは未完了。

## Upgrade / Rollback

- Upgrade：承認済みv2.2 Docker Imageへappのみ更新し、DB/Migration操作は行わない。
- Rollback：[ROLLBACK_PLAN_V2_2.md](./ROLLBACK_PLAN_V2_2.md)に従い、承認済みv2.1 Imageへappのみ戻す。

## 対象外

Meeting Mode、Cast Meeting、Alert Center、Forecast、Correlation、施策効果検証、通知、PDF/CSV新規出力、DB/Migration変更。
