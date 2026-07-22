# Heaven Parser解析結果サンプル

実ファイルをDBへ保存せず、parserの戻り値だけを確認したサンプルです。

## 店舗CSV

入力: `heaven_shop_202606.csv`

```json
{
  "kind": "HEAVEN_SHOP",
  "sourcePeriodFrom": "2026-06-01",
  "sourcePeriodTo": "2026-06-30",
  "row": {
    "date": "2026-06-01",
    "metricKey": "アクセス総数",
    "rawValue": 4025,
    "valueKind": "DAILY_EVENT",
    "rawValueStatus": "VALUE",
    "sourceColumn": "アクセス総数",
    "sourceRowNumber": 2
  }
}
```

30日×28指標で、日次fact候補は840行です。`合計`等のsummary行は日次行に含めません。

## 女子CSV（内容のみの判定）

入力: `heaven_girl_page_access_202606.csv`

```json
{
  "kind": "UNKNOWN",
  "classificationReason": "女子横持ち構造は検出しましたが、列名がキャスト名だけで指標名を含まないため、内容だけでは指標種別を安全に判定できません。",
  "row": {
    "date": "2026-06-01",
    "sourceCastName": "まゆ",
    "normalizedSourceCastName": "まゆ",
    "metricKey": "unknown",
    "rawValue": 202,
    "valueKind": "UNKNOWN",
    "rawValueStatus": "VALUE",
    "sourceColumn": "まゆ",
    "sourceRowNumber": 2
  }
}
```

女子系ファイルは7件とも同一の構造で、ファイル名を使わない限り指標種別を確定できません。誤って別指標へ保存しないため、現状は`UNKNOWN`で停止します。

## 明示ヒントを与えた場合

```json
{
  "metricKey": "my_girl",
  "valueKind": "SNAPSHOT",
  "rawValueStatus": "VALUE"
}
```

これはファイル名推測ではなく、将来の管理者選択または信頼できる外部メタデータをparserへ渡す方式です。
