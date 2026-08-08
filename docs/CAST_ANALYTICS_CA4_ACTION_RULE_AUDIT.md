# Cast Analytics CA-4.0 Action Rule Audit

## 監査目的

Action Engineはまだ実装・接続せず、既存のDiagnosis/Comparison結果から、店長面談で確認すべき段階と安全なAction候補を読み取り専用で試算した。原因の断定、具体的な数値目標、出勤増加の強制、AI文章生成は行わない。

## Stage Stateと優先順位

各段階の代表指標は、結果=平均時給、ページ流入=Town UU、写真転換=100UUあたり写真指名、本指名・再来=本指名率とした。AvailabilityとREFERENCE_ONLYを先に判定し、その後既存Comparison状態（上位群以上=GOOD、同水準=ADEQUATE、中間=BORDERLINE、差を確認=LOW）へ正規化した。

Actionルールは次の順で試算した。

1. 結果GOOD/ADEQUATE → 現状維持
2. 結果LOW/BORDERLINEかつ流入LOW/BORDERLINE → ページ流入を確認
3. 結果LOW/BORDERLINE、流入GOOD/ADEQUATE、写真転換LOW → プロフィール転換を確認
4. 結果LOW/BORDERLINE、流入・写真転換GOOD/ADEQUATE、再来LOW → 本指名・再来への移行を確認
5. 結果のみLOW/BORDERLINE → 予約枠・出勤配置を確認（CTIだけでは空き時間を断定しない）
6. BORDERLINEが複数かつLOWなし → 境界指標を経過観察
7. PrimaryがINSUFFICIENT_DATAまたは重要段階が不足 → 実績の蓄積を待つ
8. 上記以外 → スタッフによる追加確認

## 2026年7月の母集団

- 全キャスト: 83名
- メイン出勤者（通常Action対象）: 57名
- 非メイン: 26名（別集計）

非メイン26名は通常Action対象外として全員 `実績の蓄積を待つ / LOW` に分離した。通常一覧へ改善Actionを混在させていない。

### Actionタイプ別人数

| Action | 人数 |
|---|---:|
| 現状維持 | 11 |
| ページ流入を確認 | 13 |
| プロフィール転換を確認 | 5 |
| 本指名・再来への移行を確認 | 5 |
| 予約枠・出勤配置を確認 | 7 |
| 境界指標を経過観察 | 3 |
| 実績の蓄積を待つ | 2 |
| スタッフによる追加確認 | 11 |

### 優先度別人数

HIGH 19名 / MEDIUM 25名 / LOW 7名 / NONE 6名。Action判定不能は0名で、30%停止条件には該当しない。

### Stage State分布

| 段階 | GOOD | ADEQUATE | BORDERLINE | LOW | REFERENCE_ONLY | INSUFFICIENT |
|---|---:|---:|---:|---:|---:|---:|
| 結果 | 6 | 5 | 15 | 31 | 0 | 0 |
| ページ流入 | 30 | 9 | 7 | 11 | 0 | 0 |
| 写真転換 | 28 | 7 | 5 | 16 | 1 | 0 |
| 本指名・再来 | 11 | 3 | 2 | 7 | 34 | 0 |

## OTHER_REVIEW 24名の再分類

| Action | 人数 | キャスト |
|---|---:|---|
| ページ流入を確認 | 4 | おとは、かんな、久みどり、久みやび |
| 予約枠・出勤配置を確認 | 6 | かりん、しいな、のの、ひめか、ゆあな、りあん |
| 境界指標を経過観察 | 1 | ゆめ |
| スタッフによる追加確認 | 13 | なぎさ、ひびき、まり、もこ、ゆら、れみ、ろぜ、久あみ、久くう、久ののか、久まい、久まりか、久みみ |

OTHER_REVIEWを無理に全件具体Actionへ寄せず、11名はMANUAL_REVIEWとして残した。プロフィール転換・再来Actionへ誤って振り分けたOTHER_REVIEWは0名。

## 代表キャスト

| キャスト | Stage（結果/流入/写真/再来） | Action | Priority | Confidence |
|---|---|---|---|---|
| あゆみ | BORDERLINE / ADEQUATE / GOOD / LOW | 本指名・再来への移行を確認 | HIGH | HIGH |
| のの | LOW / ADEQUATE / GOOD / GOOD | 予約枠・出勤配置を確認 | MEDIUM | HIGH |
| まゆ | GOOD / GOOD / BORDERLINE / GOOD | 現状維持 | NONE | HIGH |
| ゆあ | GOOD / GOOD / GOOD / REFERENCE_ONLY | 現状維持 | NONE | LOW |
| まりな | GOOD / GOOD / LOW / GOOD | 現状維持 | NONE | HIGH |
| りあ | GOOD / GOOD / LOW / GOOD | 現状維持 | NONE | MEDIUM |

あゆみはページ流入・写真転換を維持し、本指名率・リピート構成比を確認する。ののはTown流入、写真指名効率、本指名・再来を維持し、予約可能枠・出勤配置をスタッフが確認する。まゆ・まりな・りあには新規獲得施策や不要な改善を強制しない。ゆあの再来は母数不足の参考値であり、接客改善や稼働増加を提案しない。

代表例として、LOW_PAGE_TRAFFICからは久しおん・久せりか・久まどか、LOW_PROFILE_CONVERSIONからはなほ・久みほ・久みゆで、各々の段階に対応したActionとなった。

## 誤提案監査

以下はすべて0名だった。

- 流入GOOD/ADEQUATEなのにページ流入改善
- 写真転換GOODなのにプロフィール全面改善
- 再来GOODなのに接客改善
- STABLE_HIGH_EFFICIENCYへの改善Action
- 稼働時間・出勤日数の自動増加提案
- MISSINGを0として判定

Heaven非掲載を写メ日記改善へ誘導するAction、成約10本未満の本指名率を正式断定するActionも生成していない。

## 境界値感度分析

| 案 | 現状維持 | ページ流入 | プロフィール | 再来 | 予約配置 | 経過観察 | 追加確認 | 待機 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 案1（80/60） | 11 | 9 | 5 | 5 | 7 | 3 | 15 | 2 |
| 案2（85/65） | 9 | 16 | 4 | 5 | 8 | 2 | 11 | 2 |
| 案3（既存Comparison） | 11 | 9 | 5 | 5 | 7 | 3 | 15 | 2 |

案3を推奨する。既存画面の状態表示・Diagnosis条件と一致し、案2のようにページ流入確認を3名増やし、現状維持を2名減らす境界変更を避けられる。

## 実装可否・停止条件

Action候補は安全に試算でき、誤提案0件、判定不能0名、過剰なHIGH停止条件なし、Availability無視なしだった。したがってCA-4.1の正式Engine実装へ進行可能。ただし、本監査で追加したサービス・CLIは本番API/UIへ接続していない。

## 変更範囲と検証

今回追加したのは監査用の純粋なAction候補生成、監査CLI、本文書のみ。Diagnosis Engine、Comparison Engine、UI、API、DB、Prisma、Migration、実績データは変更していない。監査CLIは次で再実行できる。

```bash
npm run audit:cast-action -- --from=2026-07-01 --to=2026-07-31 --pretty
```
