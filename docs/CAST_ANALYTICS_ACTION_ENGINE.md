# Cast Analytics Action Engine

CA-4.1で追加した、診断結果を面談時の確認方針へ変換する純粋なサービス層です。診断条件・Comparison・API・UI・DBを変更せず、既存の `CastEngineCast` を入力として `CastActionPlan` を返します。

## 位置づけ

`Diagnosis` は「現在どの状態か」、`Action Engine` は「次に何を確認するか」を扱います。原因や成果を断定せず、Keep / Review / Avoid / Next month focus と human judgment を明示します。

## Stage State

既存Comparisonの状態を再利用し、結果、ページ流入、写真指名転換、本指名・再来を `GOOD / ADEQUATE / BORDERLINE / LOW / REFERENCE_ONLY / INSUFFICIENT` へ正規化します。Action層で比率を再計算したり、独自の閾値を追加したりしません。

## ルール

1. 結果が良好なら現状維持
2. ページ流入がLOWなら流入確認
3. 流入確保後に写真指名転換がLOWならプロフィール確認
4. 写真指名転換後に本指名・再来がLOWなら再来確認
5. 結果がLOW/BORDERLINEでも他段階が良好なら予約枠・配置をスタッフ確認
6. 複数の境界状態は経過観察
7. 母数・比較不足は実績蓄積待ち
8. それ以外は追加確認

## Priority Score

LOW/BORDERLINEの深刻度、Actionの明確さ、Confidence、比較可能性を加点します。HIGHは「明示的な改善Action」「結果LOW」「Confidence HIGH/MEDIUM」「正式比較あり」「重大warningなし」をすべて満たし、スコアが十分な場合だけ許可します。安定維持はNONE、データ不足待ちはLOWです。

## 人の判断

予約枠、出勤配置、接客、プロフィール変更の実施判断は自動化しません。比較不能・参考値・混在指標はwarningsへ保持し、店長が確認できる状態で返します。

## 公開境界

`CastActionPlan` はIntegration/API/UIへ直接公開せず、CA-4.1ではサービスと監査CLI・ユニットテストで検証します。将来APIへ公開する場合も、`auditCandidate` 内部橋渡しフィールドは除外します。
