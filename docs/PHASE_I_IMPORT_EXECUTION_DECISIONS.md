# Phase I Import Execution Decision Record

**対象:** Phase I initial vertical slice / CTI `CTI_CAST_REPORT` manual execute  
**状態:** Decision Freeze  
**変更範囲:** Documentation only（コード、DB、Prisma、Migration、Docker、Compose、Production設定は変更しない）

## Current implementation status

| Phase | Status |
|---|---|
| I1 Existing Pipeline Audit | COMPLETE |
| I2 Import Execution Decision Record | COMPLETE |
| I3 CTI Manual Execute | COMPLETE / Development VERIFIED |
| I4 CTI Manual Review + Post-Confirm Sync | COMPLETE / Development VERIFIED |
| I5 Town STORE Manual Execute | COMPLETE / Production Canary VERIFIED |
| I6 Heaven SHOP | IMPLEMENTED / Development manual execute pending verification |
| I7 MANUAL_REVIEW系 | NOT STARTED |
| I8 AUTO Execution Gate | NOT STARTED |
| I9 Production Rollout | NOT STARTED |

I5では春日部の`TOWN_STORE` CSVをManual Executeし、既存Town Preview/Review/Confirm経路を通して`town_store_daily`への1件の確定とDriveFileStateの`IMPORTED`同期をProduction Canaryで確認した。AUTO Import、AUTO Confirm、cronからの実Importは未解放である。

## I5 Canary decision record

- RunnerへTown既存Pipeline sourceを含め、`MODULE_NOT_FOUND`を解消した。Business Logicは変更していない。
- Town Review URLを`/imports/town/<batchId>`へ統一した。
- Reverse proxy配下のOrigin検証は固定public `APP_ORIGIN`のURL validation・`URL.origin`正規化・完全一致で行う。CSRF/Same-Origin保護、Origin headerなしの既存policy、未設定時fallbackを維持する。
- Production HealthはOK、Databaseはconnected、既存10分Drive cronはRESOLVE_ONLY継続。

## 1. Decision summary

| Decision | Freeze |
|---|---|
| System Actor | Dedicated automation actor abstraction。実ユーザーIDのハードコードは禁止 |
| CTI対象日付 | 明示的な対象日付を必須化。XLSX内の正式日付を将来取得できる場合は最優先。File名だけでは決定しない |
| シート期間不一致 | 自動補正せず、Preview/Validation結果を`REVIEW_REQUIRED`で停止 |
| successful Import | `COMPLETED`または`COMPLETED_WITH_WARNINGS`かつConfirm済み。Preview成功は含めない |
| Confirm後同期 | Drive metadataを持つBatchだけを対象にした専用post-confirm synchronizer。汎用CTI importerへDrive処理を埋め込まない |
| Batch relation | `lastImportBatchId`は直近Preview/Attempt、`lastSuccessfulImportBatchId`はConfirm済み成功Batch |
| Idempotency | `driveFileId + driveModifiedTime + sha256`、既存Batch照合、advisory lock、既存fileHash制御を併用 |
| Re-execution | 通常は`READY`、条件付き`FAILED_RETRYABLE`のみ。Review/同一内容Imported/FAILED_FINALは新規実行しない |
| Partial Import | Phase I CTI Drive経路では禁止。既存Manual Uploadの部分Confirm仕様は変更しない |
| Production | cronは`RESOLVE_ONLY`固定。`EXECUTE`は明示的手動CLIのみ |

## 2. System Actor

### Decision

**D: automation専用actor abstractionを採用し、実体は専用System Userを安定したloginIdでlookupする。** 固定UUID、既存Admin User、実ユーザーIDのハードコードは行わない。

I3実装時に、次の要件を満たすSystem Actor Resolverを追加する。

- `GOOGLE_DRIVE` automation用の専用loginIdを設定値として管理する。
- Userが存在しない場合は自動で既存Adminへフォールバックせず、実行を失敗させる。
- 専用Userは通常ログインに使えない運用（ランダムな使用不能password、管理画面ログイン対象外）とする。
- `uploadedByUserId`にはResolverが返すUser IDを渡す。
- 将来Town/Heavenでも同じ`ImportExecutionActor` abstractionを使う。

`User`/`ImportBatch`の既存relationを利用できるため、schema変更は必須ではない。System Userの初回作成・権限・password無効化の運用手順はI3の実装前に確定し、Migration/seedを必要とする場合は別Decisionとして記録する。Phase Iでは既存実ユーザーを流用しない。

### 比較

| 案 | 評価 |
|---|---|
| 専用System Userのみ | 監査性は高いが、将来source別actorを扱う抽象化が弱い |
| `uploadedByUserId` nullable変更 | schema変更と監査上の空欄が発生するため初期案にしない |
| 固定既存Admin | 実ユーザー責任と自動処理責任が混ざるため禁止 |
| Actor abstraction + 専用User | 監査性、将来拡張、既存relation再利用のバランスが最もよい |

## 3. CTI対象日付

### Decision

File名を対象日付の正本にしない。優先順位は次の通りとする。

1. XLSX内部から既存Parserが正式に抽出できる日付（現行Parserにその値がない場合は将来拡張候補）
2. 実行要求で明示された`--target-date`または既存Uploadの対象日付
3. File名の日付は照合・警告用の補助情報のみ

現行`createCtiPreview()`は`targetFrom`/`targetTo`を呼び出し側から受け取り、現行CTI Parserは対象日付をXLSXから返していない。そのためI3では`--target-date=YYYY-MM-DD`を必須とし、`ImportMode.DAILY`では開始日と終了日を同一日にする。File名の日付が明示日付と不一致、またはFile名に日付がない場合は自動補正せず、Preview後に`REVIEW_REQUIRED`とする。

不明・不一致の日付で`AUTO`や自動Confirmへ進めない。将来Parserが内部正式日付を返す場合は、内部日付と明示日付を比較し、一致しないときはValidation Reviewへ停止する。

## 4. 3店舗シートの期間不一致

CTI XLSXの春日部・越谷・野田で正式日付または期間が不一致の場合、次のルールをFreezeする。

- 自動補正・最小日付への丸め・File名による上書きは禁止。
- 解析可能な範囲ではPreviewとImportErrorを保存する。
- 不一致は`WARNING`または`ERROR`としてBatchへ記録し、Dispatcher結果は`REVIEW_REQUIRED`にする。
- 1店舗でも対象期間が確定できない場合、Confirmを禁止する。
- Phase I CTI Drive経路では、全対象Sheetが同一対象日であることをManual Reviewで確認する。

現行Parserのシート単位Preview、missing sheet、header/row issueの仕組みを再利用し、Drive側でSheet解析を複製しない。

## 5. successful Importの定義

`DriveFileState.lastSuccessfulImportBatchId`のsuccessfulは、**既存`confirmCtiImport()`がDBへの確定処理を完了し、Batch statusが`COMPLETED`または`COMPLETED_WITH_WARNINGS`で、`completedAt`が設定されたBatch**と定義する。

- `PREVIEW_READY`、`WAITING_FOR_CAST_LINK`、`VALIDATING`はsuccessfulではない。
- Previewが正常でも、Confirm前は`lastSuccessfulImportBatchId`を更新しない。
- `COMPLETED_WITH_WARNINGS`は、確定済みfactが保存され、警告が監査可能である場合はsuccessful候補とする。ただしI4のDrive経路では未解決行・期間不一致・ERRORが残るBatchをConfirmさせない。
- `FAILED`、`CANCELLED`はsuccessfulではない。

## 6. Confirm後のDriveFileState同期

### Decision

**D: 専用post-confirm synchronizerをAPI orchestration層に置く。** 汎用`confirmCtiImport()`内部へDrive処理を埋め込まない。

Confirm APIが次の順で動作する。

1. 既存認証・入力検証を行う。
2. 既存`confirmCtiImport(batchId, forceDuplicate)`を呼ぶ。
3. Confirm後にBatch metadataの`origin=GOOGLE_DRIVE`とDrive identityを確認する。
4. Drive由来Batchだけ、同じ`driveFileId` advisory lockを取得して同期する。
5. statusが`COMPLETED`/`COMPLETED_WITH_WARNINGS`なら、`REVIEW_REQUIRED → IMPORTED`、`lastSuccessfulImportBatchId`、`lastImportedAt`を更新する。
6. 非Drive Batch、metadata不備、既に別内容へ更新済みの場合はDrive Stateを変更せず、監査エラーとして扱う。

Synchronizerは再実行可能にし、Confirm APIの再送で二重fact writeや別Batch作成を行わない。Confirm失敗時はDrive Stateを`REVIEW_REQUIRED`に残し、自動rollbackはしない。汎用Importerを直接呼ぶCLI経路は禁止し、Drive Confirmはこのorchestration経路だけに限定する。

### 比較

| 案 | 判定 |
|---|---|
| `confirmCtiImport()`内部更新 | 汎用Manual Uploadへ影響し、既存Serviceの責務が混ざるため不採用 |
| Confirm API route直接の一時処理 | 実装は小さいが、同期責務を専用serviceへ分離できないため不採用 |
| status監視poll | 遅延・競合・失敗検知が複雑なため初期案にしない |
| 専用post-confirm synchronizer | Drive Batchだけに限定でき、既存Importerへの侵襲が最小のため採用 |

## 7. ImportBatch fieldの意味

| Field | Freezeした意味 |
|---|---|
| `lastImportBatchId` | Drive Fileについて最後に作成または実行されたPreview/Attempt Batch。Review待ちBatchも含む |
| `lastSuccessfulImportBatchId` | Confirm完了済みで`COMPLETED`または`COMPLETED_WITH_WARNINGS`となったBatchのみ |
| `lastImportAttemptAt` | EXECUTEが既存Pipeline入口へ到達した時刻。Preview作成失敗でもattemptとして監査する |
| `lastImportedAt` | Confirm後Synchronizerが確定成功を確認した時刻 |

CTI Preview作成直後は`lastImportBatchId=preview batch id`、`lastSuccessfulImportBatchId`は変更しない。既存Manual UploadのBatchにはDrive State更新を行わない。

## 8. Idempotency

### Freeze条件

次の3値を1つのDrive content identityとして扱う。

```text
driveFileId + driveModifiedTime + sha256
```

同じidentityで既存Batchがある場合、状態に応じて次のようにする。

- `PREVIEW_READY` / `WAITING_FOR_CAST_LINK` / `REVIEW_REQUIRED`相当：既存Batchのレビュー先へ誘導し、新規Preview Batchを作らない。
- Confirm済み`COMPLETED`/`COMPLETED_WITH_WARNINGS`：同一内容の再実行を禁止し、既存成功Batchを表示する。
- `FAILED`で再試行可能な失敗：advisory lock取得後、既存Batch再解析または明示的な再実行方針へ進む。無条件に新規Batchを作らない。

既存CTIの`fileHash`/`duplicateCompletedBatchId`警告は、同一SHAの別Upload/別Batchを検出する責務として維持する。Drive identity照合はそれより前のExecution Gate責務であり、`forceDuplicate=true`をAutomationから指定しない。

## 9. Re-execution

| DriveFileState | Manual Execute CLI |
|---|---|
| `READY` | 許可。1 file、明示日付、Mapping確認、lock必須 |
| `FAILED_RETRYABLE` | `nextRetryAt <= now`かつretry policy内のみ許可。既存失敗理由を表示 |
| `REVIEW_REQUIRED` | 新規Batch作成禁止。既存Batchレビューへ誘導 |
| `IMPORTED` | 同一contentは拒否。Drive modified/SHAが変わりscanで`DETECTED`へ戻った場合のみ再評価 |
| `FAILED_FINAL` | 管理者の理由付きManual Reset後のみ |
| `DETECTED`/`DOWNLOADING`/`IMPORTING` | CLIが直接奪わず、通常poll/recoveryまたは明示リカバリを待つ |

## 10. Partial Import

Phase I initial CTI Drive sliceでは、部分Confirm、一部店舗のみConfirm、一部Sheetのみ自動確定を**禁止**する。既存CTI Manual Uploadの部分取込仕様は変更しないが、Drive由来BatchではI4のReview guardにより、未紐付け・SKIP・対象Sheet欠損・ERRORを残したConfirmを許可しない。これによりDrive Fileと実績の対応関係を明確にする。

## 11. Manual Execute CLI

I3の正式仕様を次でFreezeする。

```bash
npm run drive:execute-cti -- \
  --drive-file-id=<id> \
  --target-date=YYYY-MM-DD
```

必須安全条件：

- `--drive-file-id`を必須とし、Folder全件処理・複数File指定を禁止。
- `--target-date`を必須とし、File名だけで補完しない。
- DriveFileStateが`READY`（または条件を満たす`FAILED_RETRYABLE`）であることを確認。
- Mappingがactive、futureではなく、`CTI_CAST_REPORT`であることを確認。
- `driveFileId` advisory lockを取得できなければSKIP。
- Download、SHA-256、既存`createCtiPreview()`まで実行し、ImportBatch IDを表示。
- `AUTO confirm`、`forceDuplicate`、cronからの呼出しを禁止。
- Review URL（`/imports/{batchId}`）、review reason、`import=NOT_EXECUTED`を表示。
- Developmentでは明示file指定だけで実行可能。Productionでは`--confirm-production-execution=...`等の明示確認フラグを追加し、既定は拒否する。
- CLIは1 File終了であり、retry loop、scheduler、Drive書込み、Archive移動を行わない。

## 12. Production Cron

Phase I initial slice中も、既存10分cronは次の状態を維持する。

```text
Production cron = RESOLVE_ONLY固定
EXECUTE = 手動CLIのみ
AUTO Import = OFF
AUTO Confirm = OFF
```

Production環境変数やcronをI3/I4のために変更しない。実Import解放はI8 DecisionとI9 canary承認後に限る。

## 13. Initial Success Criteria

Developmentで次をすべて満たすことをI3/I4の完了条件とする。

1. READYのCTI Fileを`driveFileId`で明示指定できる。
2. `driveFileId` advisory lockを取得できる。
3. 既存Download/一時StorageでFileを取得できる。
4. `createCtiPreview()`が既存CTI Parser/Resolverを通る。
5. 既存PipelineがImportBatchを作成する。
6. ImportError、Validation、Preview JSONが保存される。
7. DriveFileStateが`REVIEW_REQUIRED`になる。
8. `lastImportBatchId`にPreview Batch IDが設定される。
9. `/imports/[id]`で既存Review画面を開ける。
10. Confirmは人が明示操作する。
11. Confirm後SynchronizerでDriveFileStateが`IMPORTED`になる。
12. `lastSuccessfulImportBatchId`と`lastImportedAt`が設定される。
13. 同一File identityの再実行でBatch数が増えず、既存Batchへ誘導される。
14. Production cronが`RESOLVE_ONLY`のままである。
15. Import実績、secret、Folder IDをログへ漏らさない。

## 14. Remaining Open Questions

- System Userの初回provision手順と`uploadedByUserId` nullable扱いをI3前に確定する。
- 現行ParserにXLSX内部正式日付がない場合の、対象日付検証の実装範囲を確定する。
- `COMPLETED_WITH_WARNINGS`のwarning許容範囲と、Drive成功定義を運用承認する。
- Confirm API以外の既存Confirm呼出し経路を棚卸しし、Drive Batchが必ずSynchronizerを通ることを保証する。
- 既存UIにDrive metadata/Review戻りリンクを追加する最小変更をI4で確定する。
- Production I9のcanary、停止、監視、通知、RTO/RPOを決める。

## 15. Design Freeze変更手順

## 16. I6 Heaven SHOP Decision

- 対象は春日部の`HEAVEN_STORE` Shop Mappingのみ。女子指標MappingはI6対象外。
- `npm run drive:execute-heaven-shop -- --drive-file-id=<id>`で1 Fileを明示実行し、`createHeavenPreview()`へ委譲する。独自CSV解析、`target-date`補完、直接fact writeは行わない。
- source periodは既存Heaven parserの`sourcePeriodFrom` / `sourcePeriodTo`を正とする。
- 実行は`READY → IMPORTING → REVIEW_REQUIRED`で止まり、Confirmは既存Heaven Review UIの人手操作のみ。Confirm後のDrive Stateは既存Synchronizerで更新する。
- Productionでは`--confirm-production`が必要だが、cronは引き続き`RESOLVE_ONLY`、AUTO Import/ConfirmはOFF。
- `driveFileId` advisory lock、modifiedTime/SHA検証、既存HeavenのfileHash duplicate制御を併用し、同一内容のBatch増殖を禁止する。

本書をPhase I initial vertical sliceのDecision Freezeとする。変更時は必ず次を記録する。

```text
Decision変更
  ↓
変更理由
  ↓
代替案との比較
  ↓
影響範囲（既存Import、Batch、Drive State、UI、Production）
  ↓
承認後に関連Documentationを更新
```
