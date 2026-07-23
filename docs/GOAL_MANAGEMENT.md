# Goal Management

`monthly_goals` に月初日単位で全体（OVERALL）または店舗（STORE）の目標を保存します。`scopeKey`（OVERALL / STORE:{store UUID}）でPostgreSQLのNULL一意制約問題を避けています。

ADMINのみ編集でき、保存ごとに `monthly_goal_change_history` へ変更前後・実行者・理由を記録します。VIEWERは閲覧のみです。目標未設定時はHOMEで未設定と表示し、全体目標を店舗へ按分しません。

着地予測は経過日数で単純ペースを算出し、目標達成率と残日数あたり必要売上を表示します。将来、曜日補正を追加できるよう計算をページロジックから分離できる構造にします。
