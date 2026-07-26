# HOME v1.0 Release Notes

**正式名称：店舗運営・マーケティング司令塔**  
**位置づけ：Daily Management & Goal Alignment Home**  
**ステータス：Feature Freeze**  
最終更新：2026-07-26

## 目的と利用者

店長、エリア責任者、経営者、運営管理者が、朝5分以内に目標・前日実績・比較・Benchmark・媒体見込み・来月課題を確認し、詳細画面へ進むための基準画面です。

## フェーズ履歴

- Phase D-1：Daily Brief
- Phase D-1.5：HOME Consolidation
- Phase E-1：Comparison / Decision Support
- Phase E-1.5：Daily Management Control Board
- Phase E-1.6：UI Compact & Goal Alignment
- Phase E-1.7：Goal-Based Marketing Benchmarks
- Phase E-1.7 Final：HOME Deduplication、Contract Alignment、Monthly Media Benchmarks

## 主要機能

- DATA HEALTHと最新確定日
- 月間目標達成ペース
- 必要出勤人数・必要成約数・必要時間
- 目標ペース達成日の運営／集客Benchmark
- CTI中心の前日主要KPI
- 前日実績比較と前日媒体活動
- KPI Signal
- 今月の全体状態、店舗・キャスト確認候補
- 月間媒体見込み
- 来月重点改善
- 日別グラフと詳細分析導線

## データと制約

CTIは春日部・越谷・野田、Townは春日部・越谷、Heavenは春日部のみです。成約率、媒体予約経路、媒体と売上の因果関係は未実装・未特定です。Heaven写メ日記PVは存在しません。Benchmarkは保証値ではなく、月間媒体見込みは単純ペース参考値です。前年同月は正式データがある場合のみ利用します。

## UI方針

Semantic Color、状態ラベル、Sample、Confidence、Availability、Compact Gridを維持します。内部enumだけで説明せず、店長が意味を理解できる日本語を優先します。

## QA状況

lint、typecheck、Webpack build、Docker再ビルド・再起動、HOME Browser確認、Console確認を実施します。Playwright／axeや全Viewport確認は環境依存です。開発DB接続を必要とする全テストは、DBが利用可能な環境で再実行してください。

## Freeze方針

重大バグ、数値・Scope誤り、欠測、Accessibility、Responsive、Performance、Security、明確な重複削除、正式データ接続はFreeze対象外です。大型機能追加は次フェーズで設計レビューを行います。

理解容易性Patch：目標・Benchmarkカードは、必要目安または達成日中央値を主表示とし、前日値・同曜日値は補助表示へ整理します。計算式、閾値、母集団、データ取得範囲は変更しません。

Monthly Gap Patch：必要水準との差を当月日平均基準へ修正し、前日値を補足へ限定しました。HOMEの個別キャスト候補表示を削除し、詳細確認はCast Analyticsへ集約しました。DTO互換性と既存導線は維持しています。

## 次フェーズ

HOMEへ詳細原因分析を詰め込まず、Management Dashboard、Store Analytics、Cast Analytics、Trend Analytics、Time Analytics、Diary Analyticsへ、事実→比較→目標差→参考水準→確認導線の原則を展開します。
