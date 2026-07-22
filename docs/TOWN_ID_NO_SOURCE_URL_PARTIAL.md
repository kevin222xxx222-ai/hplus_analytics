# Town `ID_NO_SOURCE_URL` 部分確定モード設計

## 1. 目的と範囲

Town未紐付け候補のうち、`ID_FORMAT` かつ元URLを取得できないため D（再解析待ち）に分類された行を、管理者の明示操作で部分確定するための設計です。

本モードでは、人物を特定できないCAST行を実績へ保存しません。一方、人物紐付けを必要としない店舗・URL・LPの媒体実績は保存し、後日Aliasや元URLが整備された時点で再解析・再集計できる状態を維持します。

内部モード名（案）：`ID_NO_SOURCE_URL_HOLD_PARTIAL`

本書は設計のみを定義します。実装、再解析、確定実行、データ変更は本設計の承認後に行います。

## 2. 対象判定

ImportBatch単位で、次を実行直前に再検証します。

- Townの対象データ種別である
- `PREVIEW_READY` または `WAITING_FOR_CAST_LINK`
- OPENのERRORが0件
- 修正版候補（`correctionBatchIds`）が0件
- OPENな未紐付け行が1件以上ある
- OPENな未紐付け行がすべて D 判定（`ID_FORMAT` + `ID_NO_SOURCE_URL`）である
- D以外の候補（候補なし、候補複数、在籍期間外、修正版等）が混在しない
- SKIPPED行は対象外
- プレビューのフィンガープリントが影響範囲プレビュー時と一致する
- 同じBatchに対する同モードの確定履歴がない

D判定は、保存済みpreviewの正規化名が`ID:数字`形式で、同一店舗・同一正規化名グループの元URL集合が空であることから導出します。行番号だけを識別キーにはしません。

## 3. 保存ルール

| 行種別 | 条件 | 部分確定時の扱い |
|---|---|---|
| TOWN_STORE | ERRORでない | `TownStoreDaily`へ通常の一意キーでupsert |
| TOWN_CAST | `castId`あり、ERRORでない | `TownCastDaily`へupsert（D未紐付け行は保存しない） |
| TOWN_CAST | `castId`なし、D由来 | 保存しない。preview行と`UNMATCHED_CAST`は保持 |
| TOWN_URL | ERRORでない、castIdの有無を問わない | `TownUrlDaily`へupsert。未紐付けなら`castId=null` |
| TOWN_LANDING | ERRORでない、castIdの有無を問わない | `TownLandingDaily`へupsert。未紐付けなら`castId=null` |
| SKIPPED / ERROR | — | 保存しない |

一意キーは既存の正式キーを使用し、既存行を二重加算しません。Cast、CastAlias、MediaListing、元CSV、preview自体は変更しません。

## 4. 状態とImportError

部分確定後の状態は常に`COMPLETED_WITH_WARNINGS`です。D行が残る限り`COMPLETED`へは遷移させません。

- D由来の`UNMATCHED_CAST`：`OPEN`を維持
- 既存のERROR：対象外（実行前に停止）
- `pendingCount`：未保存のD CAST行を含む未紐付け行数
- `warningCount`：OPEN WARNINGの再集計値（Dの保留を含む）
- `errorCount`：OPEN ERRORの再集計値
- `insertedCount`：今回新規作成された実績行数
- `updatedCount`：一意キー既存行のうち値を更新した行数

`PARTIAL_IMPORT`を追加する場合もWARNING・OPENとして保存しますが、元の`UNMATCHED_CAST`を削除・RESOLVED化してはいけません。

## 5. 後日再解析・再集計

再解析では、元CSVを既存Town parserで読み直し、現在のCast・Alias・在籍期間でresolverを実行します。その後、部分確定済みBatchの`importEvents`を参照してモードを復元します。

1. D行がAlias／元URLの取得により解決した場合、preview行へ`castId`を設定する
2. 対応する`UNMATCHED_CAST`をRESOLVEDへ更新する
3. 既に保存済みのURL／LP行は自然キーで再upsertし、必要な場合だけ`castId`を更新する
4. 新たに解決されたCAST行だけ`TownCastDaily`へupsertする
5. 既存実績を再加算しない
6. 未解決D行が残れば`COMPLETED_WITH_WARNINGS`を維持する
7. 未解決行が0件で、他のOPEN WARNING／ERRORもない場合だけ`COMPLETED`へ遷移する

再解析は管理者判断を削除する操作ではありません。DはSKIPではないため、再解析で解決可能になった場合に限り実績反映対象へ復帰します。

## 6. API・UI案

既存のTown確定API／`confirmTownImport()`を共通サービスとして利用し、モードだけを明示します。

- API action案：`CONFIRM_ID_NO_SOURCE_URL_PARTIAL`
- 内部モード案：`ID_NO_SOURCE_URL_HOLD_PARTIAL`
- ADMINのみ表示・実行
- VIEWERはUI非表示、APIでも拒否
- 影響範囲プレビューで次を表示：保存URL行数、保存LP行数、保存Store行数、保留CAST行数、対象Batch数、未紐付け件数、実行後状態
- 実行前にフィンガープリント、行数、種別内訳、OPENエラー、修正版候補を再検証
- 1Batchずつ逐次実行し、失敗Batchがあっても次Batchを継続する場合はBatch単位でトランザクションを分離

通常の`CAST_ONLY_HOLD_PARTIAL`（URL/LP未紐付けを含む部分確定）とは別モードとして扱い、対象条件と監査イベントを混同しません。

## 7. 排他・トランザクション

BatchごとにPostgreSQL transaction-scoped advisory lockを取得し、`Serializable`トランザクションで以下を一括実行します。

```sql
SELECT pg_advisory_xact_lock(hashtext('town-id-no-source-url-partial:' || $1)) IS NULL AS locked;
```

途中失敗時は、そのBatchの実績、ImportBatch更新、監査イベントを全ロールバックします。別Batchの既存確定データには影響させません。

## 8. 監査履歴

DBスキーマ変更は原則不要です。`ImportBatch.metadata.importEvents`へ次を追記します。

```json
{
  "type": "TOWN_ID_NO_SOURCE_URL_HOLD_PARTIAL_CONFIRM",
  "mode": "ID_NO_SOURCE_URL_HOLD_PARTIAL",
  "executedBy": "<userId>",
  "executedAt": "<ISO-8601>",
  "batchId": "<batchId>",
  "savedStoreRows": 0,
  "savedUrlRows": 0,
  "savedLandingRows": 0,
  "savedCastRows": 0,
  "heldCastRows": 0,
  "openUnmatchedRows": 0,
  "fingerprint": "<sha256>"
}
```

元CSV、preview行、ImportError、既存実績は削除しません。

## 9. 再紐付け時の正式集計

URL／LPの`castId=null`保存は店舗・URL・LP集計には含めますが、キャスト別集計には含めません。後日Alias解決された場合は同じ自然キーの行を更新し、キャスト別集計へ反映します。CASTのD行は解決されるまでキャスト実績に入りません。

## 10. テスト計画

- D CAST未紐付け＋URL/LP未紐付けの対象判定
- D以外（候補なし、候補複数、修正版、ERROR）混在時の実行拒否
- Store／URL／LP保存、CAST未保存の確認
- URL/LPの`castId=null`保存
- `UNMATCHED_CAST` OPEN維持
- `COMPLETED_WITH_WARNINGS`遷移
- 一意キーupsertによる二重加算防止
- Alias追加後の再解析でCAST追加・URL/LP castId更新
- 再解析後に未解決行が残る場合の状態維持
- 全解決時の`COMPLETED`遷移
- fingerprint不一致、二重実行、VIEWER拒否、ロールバック

## 11. 既知の制約と未決定事項

- 元URLが将来も取得できないD行は、Aliasまたは管理者による別の安全な識別手段がない限りCAST実績へ復帰できません。
- 同じBatchにD以外の理由が混在する場合は、本モードで部分確定せず、既存のC候補／修正版フローで処理します。
- `COMPLETED_WITH_WARNINGS`後のURL／LP行のcastId更新をどの画面で明示するかは、再解析UI設計と合わせて確定します。
- 本設計では新規テーブル・マイグレーションは想定していません。監査要件がmetadataで不足する場合のみ、別途最小スキーマ案を提示します。

## 12. 現在のWAITING_FOR_CAST_LINK 93件との照合（読み取り専用、2026-07-22）

保存済みpreview.jsonを走査し、現在`WAITING_FOR_CAST_LINK`である93バッチを、元CSV・DBの変更なしで確認した。93件はすべて`TOWN_CAST`であり、今回の93件には`TOWN_STORE`、`TOWN_URL`、`TOWN_LANDING`の行は存在しない。

| 区分 | バッチ数 | 行数 |
|---|---:|---:|
| 全行 | 93 | 8,869 |
| D（`ID_FORMAT` + `ID_NO_SOURCE_URL`、OPEN未紐付け） | 93 | 603 |
| D以外で保存可能な紐付け済みCAST | 93 | 8,140 |
| SKIPPED | 93 | 89 |
| 行レベルERROR | 0 | 0 |
| D以外のOPEN未紐付け（修正版・その他C） | 37 | 37 |

「D以外で保存可能」は`castId`が設定済みで、ERRORでもSKIPPEDでもない行を指す。したがって、単純にD行だけを保留する**許容的な仮定**なら、93件で8,140行を保存見込み、603行を未保存とできる。ただし本設計の安全条件は「OPEN未紐付けがすべてD」であり、D以外の未紐付け混在を禁止するため、この仮定を採用しない。

安全条件をそのまま適用すると、次の結果になる。

| 区分 | バッチ数 | D行 | 保存可能CAST | SKIPPED | D以外のOPEN未紐付け |
|---|---:|---:|---:|---:|---:|
| 実行可能（Dのみ） | 56 | 427 | 5,747 | 79 | 0 |
| 実行停止（混在） | 37 | 176 | 2,393 | 10 | 37 |
| 合計 | 93 | 603 | 8,140 | 89 | 37 |

実行可能56件では、`TownCastDaily`への保存見込みは5,747行、Dの未保存行は427行、空バッチは0件である。混在37件は、修正版候補35行（越谷35バッチ）またはその他C候補2行（春日部2バッチ）が含まれるため、D部分だけを保存する本モードの対象外とする。従って、現仕様で`COMPLETED_WITH_WARNINGS`へ進めてよいファイル数は56件であり、93件すべてではない。

既存の`TownStoreDaily`、`TownUrlDaily`、`TownLandingDaily`について、これら93バッチを参照する保存済み行はそれぞれ0件だった。設計書のStore／URL／LP保存ルールは将来それらの種別を含むバッチへ適用するためのもので、今回の93件では実際には検証対象にならない。

### CAST_ONLY_HOLD_PARTIALとの責務差

- `CAST_ONLY_HOLD_PARTIAL`：URL／LPの未紐付けを`castId=null`で保存し、CAST未紐付けがないことを前提とする。
- `ID_NO_SOURCE_URL_HOLD_PARTIAL`：ID_NO_SOURCE_URLのCAST未紐付けを保存せず保留し、人物を必要としないStore／URL／LPは保存可能とする。

今回の93件はCASTのみでURL／LP行が0件のため、既存の`CAST_ONLY_HOLD_PARTIAL`では目的を満たさない。

### 後日Alias解決と現行実装上の注意

設計上は、部分確定済みバッチのD行を後日解決し、自然キーupsertで未保存CAST実績だけを追加する。管理者判断を再解析で消さないため、`importEvents`と安定fingerprintを再適用する必要がある。既存Town再解析サービスの再解析可能状態には`COMPLETED_WITH_WARNINGS`が含まれていないため、現時点ではこの設計どおりの後日再解析は未実装であり、実装時に再解析・再集計経路の拡張が必要である。今回の照合ではその拡張や再解析を実行していない。

### 空バッチの扱い

今回の93件に空バッチは0件だった。本モードでは、保存可能行が0件のバッチは安全上の理由から実行対象外とし、`PREVIEW_READY`または`WAITING_FOR_CAST_LINK`に留める。将来、空バッチを許可する場合は、監査イベントに`emptyEligibleBatch: true`、`savedCastRows: 0`、`heldDRows`、対象行・バッチ内訳、実行理由を必須記録し、状態のみを変更することの承認を別途必要とする。
