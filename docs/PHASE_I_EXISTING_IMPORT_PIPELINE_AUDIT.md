# Phase I Existing Import Pipeline Audit

## 目的と調査範囲

Phase H H9のProduction取得基盤を、既存のCTI Importへ安全に接続する前提で、現行コードの入口・責務境界・状態・冪等性を監査した。対象はCTI `CTI_CAST_REPORT`であり、今回の監査ではコード・DB・Prisma・設定を変更していない。

## 1. 既存CTI入口

| 層 | 現行入口 | 責務 |
|---|---|---|
| Upload API | `src/app/api/imports/cti/upload/route.ts` `POST` | ADMIN認証、同一Origin、multipart File、ImportSource/Mode/期間の受領 |
| Preview service | `src/lib/imports/cti/service.ts` `createCtiPreview()` | XLSX検証、保存、SHA-256、ImportBatch作成、解析、Preview/ImportError保存 |
| Parser | `src/lib/imports/cti/parser.ts` `parseCtiWorkbook()` | 3店舗シート、ヘッダー、列、値、除外行、日付/期間関連の解析 |
| Resolver | `src/lib/imports/cti/resolver.ts` / `resolution-service.ts` | Alias/Cast解決、未紐付け・曖昧行の解消 |
| Confirm API | `src/app/api/imports/cti/[id]/confirm/route.ts` `POST` | ADMIN確認、duplicate再処理指定の受領 |
| Importer | `src/lib/imports/cti/importer.ts` `confirmCtiImport()` | Previewを読み、既存の`ctiCastDaily`をupsert、Batchを完了/警告完了へ更新 |

Phase Iで再利用する正式なService入口は`createCtiPreview()`と`confirmCtiImport()`である。XLSXを直接読み、`ctiCastDaily`へ書き込む新経路は作らない。

## 2. ImportBatchの作成地点

`createCtiPreview()`が、XLSXを保存した後に`prisma.importBatch.create()`を1回実行する。初期状態は`VALIDATING`で、解析結果に応じて`PREVIEW_READY`、`WAITING_FOR_CAST_LINK`、または`FAILED`へ更新される。`ImportBatch`には`fileHash`、`storagePath`、`dataType`、`importMode`、対象期間、件数、metadataが保存される。

DispatcherやDrive Execution GateはImportBatchを直接作成しない。Drive由来の識別情報は既存`metadata`へ追加する案を採用候補とし、schema変更は行わない。

## 3. Previewと確定の境界

Previewは解析・検証・Preview JSON・ImportErrorを保存するが、`ctiCastDaily`を変更しない。確定は`confirmCtiImport()`だけが行い、`ImportMode.DAILY`かつ同一日付の場合に限り、紐付け済みでERRORのない行を既存自然キーでupsertする。

既存UIは`/imports/[id]`でBatchとPreviewを表示し、未紐付け行を解決してから「取込確定」を押す。保留行を残した部分取込も現仕様で可能だが、Phase IのCTI Vertical Sliceではこの既存Manual Reviewを必須とし、自動confirmしない。

## 4. CTI解析・検証の実態

- `CTI_STORE_CODES`に対応する春日部・越谷・野田のシートを既存parserが扱う。
- ヘッダー行、必須列、任意列、未知列、既知未採用列の値変換を既存parserが診断する。
- 除外行、負数、整数/時間変換、予約・キャンセル・指名内訳の整合を既存parserが検証する。
- Cast名は既存Alias/Resolverで解決し、`UNMATCHED`/`AMBIGUOUS`はPreview上で保留する。
- `ImportMode.DAILY`以外はPreview onlyであり、`confirmCtiImport()`は確定を拒否する。

## 5. 未紐付けCast/Alias

`/api/imports/cti/[id]/resolve`から、既存Cast選択、新規Cast作成、SKIP、PENDINGを操作できる。既存Castを選択するとCTI Aliasを必要に応じて作成し、関連ImportErrorを解決済みにする。対象日付の在籍期間外Castは選べない。Phase Iではこの画面/APIをそのままManual Reviewへ誘導し、Drive側に別のAlias解決ロジックを持たせない。

## 6. 再Import・冪等性の現状

- Preview時にSHA-256で完了済みBatchを検索し、`duplicateCompletedBatchId`をmetadataへ入れて警告する。
- 同一SHAでもBatch作成自体はuniqueではなく、確定には`forceDuplicate=true`が必要である。
- 確定時の`ctiCastDaily`は`businessDate_storeId_castId`でupsertされ、同じ事実の二重行は作られない。
- ただし、既存PipelineはDrive File IDを認識しない。Phase Iでは`driveFileId + modifiedTime + sha256`をExecution Gate側で確認し、同一入力のPreview/Confirm再実行を抑止する必要がある。

## 7. Drive Dispatcherとの接続点

現行`src/lib/import-automation/google-drive/dispatcher.ts`は、MappingからPipeline/Policyを解決する。`RESOLVE_ONLY`ではrouteだけを返し、`EXECUTE`では注入された`executePipeline` callbackだけを呼ぶ設計である。CTIは`MANUAL_REVIEW`であり、現行実装のMANUAL_REVIEW分岐はREADYを`REVIEW_REQUIRED`へ遷移させるだけで、CTI Serviceは未接続である。

したがって、実装時の最小接続先はDispatcherのexecutor境界であり、executorから既存CTI Serviceを呼ぶ。Dispatcherにparser、ImportBatch、DB fact writeを追加してはならない。

## 8. 現行H6/H9との差

現行Production pollは`one-shot-scan.ts`から常に`{ mode: "RESOLVE_ONLY" }`でDispatcherを呼ぶ。Downloadした一時Fileはroute解決後にcleanupされる。H6には`EXECUTE`型とexecutor callbackの枠はあるが、CTIのFile→`createCtiPreview` adapter、Manual Review UIへのリンク、Confirm後のDriveFileState更新はまだ存在しない。

## 9. 既存UIへの接続評価

新しいレビュー画面を作るより、既存`/imports/[id]`を正本とするのが安全である。必要な最小UI/運用情報は次の通り。

1. BatchページにDrive由来であること、`driveFileId`、Folder mapping名、SHA-256、Drive modifiedTimeを表示（secret/Folder IDの実値は表示しない）。
2. Batchページから既存のCast解決、Preview確認、確定操作を利用する。
3. Confirm成功後に、Drive Stateの更新処理を明示的に呼び、`lastSuccessfulImportBatchId`の意味を確定済みBatchだけに限定する。

UI変更はI4で必要性を確定し、I3ではCLI出力でBatch URL/IDを示すだけに留める。

## 10. 結論

既存CTI Pipelineの唯一の確定入口は`createCtiPreview()`→既存Preview/Resolution→`confirmCtiImport()`である。Phase Iはこの入口を薄いDrive adapterから呼び出し、Preview/Manual Reviewを経て停止する設計にする。Parser、Resolver、Importer、ImportBatch作成、Analytics writeは既存実装を再利用する。
