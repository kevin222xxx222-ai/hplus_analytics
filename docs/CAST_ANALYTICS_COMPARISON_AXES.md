# Cast Analytics 比較軸（CA-3.6 Step 3-A）

Cast Diagnosis は、すべての指標を売上上位群へ寄せて比較しません。指標の業務上の意味が異なるため、結果・媒体流入・新規獲得・再来転換をそれぞれ近い稼働量の母集団から比較します。

| 軸 | 指標 |
| --- | --- |
| `RESULT_TOP_PEERS` | 女子報酬、平均時給、成約数、出勤時間、1日/1時間あたり成約 |
| `MAIN_ATTENDANCE_PEERS` | Town PV、Town UU、Heavenアクセス、Heaven写メ日記 |
| `NEW_ACQUISITION_PEERS` | 写真指名、写真指名/日・時間・100UU、写真指名構成比 |
| `REPEAT_CONVERSION_PEERS` | 本指名、本指名率、リピート数、リピート構成比 |

結果軸は既存の管轄結果上位群を維持し、各軸は本人を除外したうえで稼働時間±40%を優先します。3名未満の場合は±60%、軸候補全体、結果上位群フォールバックの順に証跡を残します。いずれも3名未満なら、その比較ステップを `INSUFFICIENT_SAMPLE` とします。

Comparison Engine の `selection`、`medianEvidence`、`diagnosticUsage` を Diagnosis Engine の比較DTOへ追加で保持します。`VALUE` のみを正式判定に使い、`ZERO` は有効値として扱います。`MISSING`、`UNAVAILABLE`、`UNCOMPUTABLE` は条件を満たしません。成約10本未満の再来指標は `REFERENCE_ONLY` としてFactには利用できますが、正式な再来診断条件には利用しません。

NEW_ACQUISITION_PEERSからは、平均時給3,000円以上・本指名率50%以上・写真指名/フリー構成比25%未満・成約10本以上を満たす完成形キャストを除外します。これは診断対象本人を除外するものではなく、他キャストの新規獲得比較Peer候補から除外するための証跡です。

Step 3-A は内部Engine接続のみで、UIの比較ラベルや判定基準モーダルは変更しません。表示文言の最終調整はStep 3-Bで行います。
