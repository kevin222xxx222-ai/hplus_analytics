# HOME Change Policy

**HOME v1.0 / Feature Freeze**  
最終更新：2026-07-26

## 1. Freeze

HOME v1.0では新しい大型セクション、別の意思決定フロー、HOME専用の永続モデルを追加しません。

## 2. 許可される変更

- 重大バグ・数値誤り・Scope誤りの修正
- 欠測判定、Accessibility、Responsive、Performance、Securityの修正
- 明確な重複削除・文言改善
- 正式データ接続による欠測解消

## 3. 事前設計レビューが必要な変更

新セクション、既存セクション削除、表示順の大幅変更、主要指標変更、Benchmark条件、目標計算、Semantic Color、Scope、Confidence、Sample基準の変更。

## 4. 禁止

UI内集計、欠測0補完、必要PV／UU断定、因果関係・媒体寄与・予約経路・機会損失の推定、AI施策生成、Benchmark永続保存、新規DBモデル、指標定義の無断変更、テスト削除、失敗テストの安易なskip化。

## 5. 必須検証

変更時はlint、typecheck、Unit Test、build、Docker、Browser、Console、1280px／390px、主要数値照合、DB変更有無を確認します。可能なら変更前後のスクリーンショットも保存します。

## 6. Release分類

- Patch：文言、CSS、表示崩れ、軽微なBug
- Minor：正式指標接続、比較軸追加、既存セクション内拡張
- Major：意思決定フロー、全面構造、データモデル変更（HOME v1.xでは原則禁止）

