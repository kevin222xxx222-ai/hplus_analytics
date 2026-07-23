# Metric Glossary

指標の表示辞書は `src/lib/analytics/metric-definitions.ts` を正とします。画面には日本語の標準名を表示し、内部キーはガイドとURLアンカーで確認できます。未存在媒体・分母なしは0ではなく「—」で表示します。

各指標は、意味・計算式・見るポイント・注意点・使用画面を `/help/metrics` の検索可能なガイドで確認できます。主要カードの「?」または「指標の意味」から同じ定義へ遷移します。

DAILY_EVENTは期間合計、SNAPSHOTは期間最終値と期間増減を使用します。分母0はnull（画面上は—）です。LOW_SAMPLEは母数不足を示すタグで、率を原因や成果として断定しません。

Town/HeavenのPV・UU・アクセスとCTI予約・成約は顧客単位で直接対応しないため、「成約／Town UU」「成約／Heaven PAGE_ACCESS」「Town＋Heaven参考合計」は傾向比較用の参考指標です。相関係数も因果関係を示しません。

## よく使う指標

売上、成約、本指名率、出勤日数、Town PV/UU/TEL、Heavenページアクセス、達成率、着地予測。

## 判断時に注意が必要な指標

本指名率、成約／Town UU、成約／Heaven PAGE_ACCESS、Town＋Heaven参考合計、LOW_SAMPLE、着地予測、相関係数。
# DATA HEALTH指標

- データ品質スコア：取込状態の運用指標。データの正しさを保証しない。
- 未確定Batch：preview・保留状態で実績へ未反映のBatch。
- 推定売上影響額：previewと既存自然キーとの差分から算出する参考値。
- 日付カバレッジ：対象日ごとの反映済み・未確定・未取込の状態。
