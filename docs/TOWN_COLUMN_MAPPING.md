# デリヘルタウンCSV 列マッピング

更新日: 2026-07-15

実運用8ファイルで確認した全列です。割合はCSVの `%` 表記を0〜1のDecimalへ変換します。平均PV/CVRは原値と再計算値を併存させます。

## 店舗別（ヘッダー3行目）

| 元列名 | 内部項目 | 保存先 | 型/規則 |
| --- | --- | --- | --- |
| 日付 | date | TownStoreDaily.date | date |
| PV(ページビュー) | pv | TownStoreDaily.pv | 非負整数 |
| UU(ユニークユーザー) | uu | TownStoreDaily.uu | 非負整数 |
| 平均PV | sourceAveragePv / averagePv | source_average_pv / average_pv | 原値 / PV÷UU |
| 直帰率 | bounceRate | TownStoreDaily.bounce_rate | 非負割合 |
| TELタップ(UU) | telTapUu | TownStoreDaily.tel_tap_uu | 非負整数 |
| コンバージョン率(TELタップ/UU) | sourceConversionRate / conversionRate | source_conversion_rate / conversion_rate | 原値 / TEL÷UU |

## 女子別（ヘッダー4行目）

| 元列名 | 内部項目 | 保存先 | 型/規則 |
| --- | --- | --- | --- |
| 女の子 | originalCastName | source_cast_name + TOWN Alias | 文字列、必須 |
| PV(ページビュー) | pv | TownCastDaily.pv | 非負整数 |
| UU(ユニークユーザー) | uu | TownCastDaily.uu | 非負整数 |
| 平均PV | sourceAveragePv / averagePv | source_average_pv / average_pv | 原値 / PV÷UU |
| TELタップ(UU) | telTapUu | TownCastDaily.tel_tap_uu | 非負整数 |
| コンバージョン率(TELタップ/UU) | sourceConversionRate / conversionRate | source_conversion_rate / conversion_rate | 原値 / TEL÷UU |

## URL別（ヘッダー4行目）

| 元列名 | 内部項目 | 保存先 | 型/規則 |
| --- | --- | --- | --- |
| URL | url / normalizedUrl | TownUrlDaily.url / normalized_url | 元値保持、query/fragment除外で正規化 |
| 女の子 | sourceCastName | source_cast_name + nullable cast_id | 空欄可 |
| PV(ページビュー) | pv | TownUrlDaily.pv | 非負整数 |
| UU(ユニークユーザー) | uu | TownUrlDaily.uu | 非負整数 |
| 平均PV | sourceAveragePv / averagePv | source_average_pv / average_pv | 原値 / PV÷UU |
| TELタップ(UU) | telTapUu | TownUrlDaily.tel_tap_uu | 非負整数 |
| コンバージョン率(TELタップ/UU) | sourceConversionRate / conversionRate | source_conversion_rate / conversion_rate | 原値 / TEL÷UU |

## LP別（ヘッダー4行目）

| 元列名 | 内部項目 | 保存先 | 型/規則 |
| --- | --- | --- | --- |
| ランディングページ | landingUrl / normalizedUrl | TownLandingDaily.landing_url / normalized_url | 元値保持、query/fragment除外で正規化 |
| 女の子 | sourceCastName | source_cast_name + nullable cast_id | 空欄可 |
| UU(ユニークユーザー) | uu | TownLandingDaily.uu | 非負整数 |
| 直帰率 | bounceRate | TownLandingDaily.bounce_rate | 非負割合 |
| TELタップ(UU) | telTapUu | TownLandingDaily.tel_tap_uu | 非負整数 |
| コンバージョン率(TELタップ/UU) | sourceConversionRate / conversionRate | source_conversion_rate / conversion_rate | 原値 / TEL÷UU |

空欄や `-` は、nullableな比率項目ではnullとして扱えます。必須件数・必須URL・必須名称の欠損や変換不能はERRORで、その行を0として取り込みません。実運用8ファイルでは未知列は0件でした。
