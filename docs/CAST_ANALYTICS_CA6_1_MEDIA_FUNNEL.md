# CA-6.1 Heaven媒体ファネル基盤

## 正式指標

| DTOキー | 取得元 | 集計 | 欠測の扱い |
| --- | --- | --- | --- |
| `heavenMyGirlAdds` | Heaven `MY_GIRL` | Snapshotの有効差分。初回は期間開始前の最新Snapshotを基準 | 欠測・基準不足は0補完せず `MISSING`/`UNCOMPUTABLE`、リセットは `isPartial` |
| `heavenFavoriteTalks` | Heaven `OKINI_TALK_SENT` | `DAILY_EVENT`の期間合計 | 有効0は`ZERO`、対象日不足は`isPartial` |

効率指標として、アクセスまたはTown UUあたりのマイガール増加、出勤日あたり・アクセスあたりのオキニトークを比較DTOへ追加した。すべて媒体値は春日部のHeaven掲載データだけを対象とし、越谷・野田へ0を付与しない。

## Snapshot負差分の方針

CA-6.0の監査でMY_GIRLの負差分を確認したため、アプローチC（リセット境界で区切る）を採用した。負差分そのものは加算せず、現在値を新しい基準として次の正差分を加算する。`negativeDeltaCount`と`reason`を保持し、対象月は暫定（`isPartial`）として扱う。推測で0へ丸めない。

## 比較軸

新規指標はすべて `MAIN_ATTENDANCE_PEERS`。比較DTOには中央値、候補数、有効Peer数、選択方式、稼働時間範囲、フォールバック理由、中央値根拠が既存形式で保持される。DiagnosisのPrimary、Action、Confidenceの判定ステップは変更していない。

## API／CLI

既存のCast Diagnosis APIの`comparisons`に新指標が追加される。監査CLI:

```sh
npm run audit:cast-media-funnel -- --from=2026-07-01 --to=2026-07-31
```

出力は`artifacts/audits/cast-media-funnel/`（Git管理対象外）に保存される。

## CA-6.2 表示接続

個別Castページの「媒体ファネル」と診断データモーダルへ、次の4指標だけを表示する。

- マイガール増加数（`heavenMyGirlAdds`）
- 100アクセスあたりマイガール増加（`heavenMyGirlAddsPer100Access`）
- オキニトーク送信数（`heavenFavoriteTalks`）
- 1出勤日あたりオキニトーク（`heavenFavoriteTalksPerAttendanceDay`）

効率指標は7月実データの解釈しやすさを優先し、マイガールはアクセス基準、Talkは出勤日基準を正式表示とした。Town UU基準・アクセス基準TalkはComparison DTOに保持するが、UIには出していない。

表示は既存の比較状態・中央値Evidenceをそのまま使用し、`PARTIAL`相当（`isPartial`）は「暫定」、`ZERO`は「0件」、`MISSING`は「データなし」、`UNAVAILABLE`は「掲載対象外」、`UNCOMPUTABLE`は「算出不可」とする。

DiagnosisのPrimary、Confidence、Action、Priorityの判定条件には接続していない。

## 未実装・注意

DB、Prisma、Migration、Import Parserは変更していない。HeavenアクセスやCTI成約との顧客単位の経路・因果は推定しない。部分日付・未掲載・未取得は0として扱わない。
