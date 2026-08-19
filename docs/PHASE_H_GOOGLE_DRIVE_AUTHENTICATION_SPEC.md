# Phase H Google Drive Authentication Specification

## 1. Document Information

- 対象版: `v1.0.1-production-ready`
- Phase: H2
- 更新日: 2026-08-14
- 状態: **設計のみ（実装なし）**
- 変更対象: 本Markdownのみ
- 前提資料:
  - `docs/PHASE_H_DRIVE_IMPORT_SOURCE_AUDIT.md`
  - `docs/PHASE_H_GOOGLE_DRIVE_FOLDER_SPEC.md`
  - `docs/PHASE_H_IMPORT_AUTOMATION_ARCHITECTURE.md`
  - `docs/HPLUS_ANALYTICS_COMPLETE_SYSTEM_SPECIFICATION_v1.0.1.md`

## 2. Purpose

Phase H v1で、通常のGoogleアカウントのマイドライブに置かれたHPlus Analytics専用Folderを、HPlus Analyticsから安全に読み取る認証方式を定義する。

本書はGoogle Drive APIの実装手順ではない。OAuth情報、秘密鍵、実Folder ID、メールアドレス等の実値は記載しない。コード、DB、Prisma、Docker Compose、Script、既存設定は変更しない。

## 3. Assumptions

- Google Workspace、共有ドライブは使用しない。
- 通常の個人Googleアカウントのマイドライブを使用する。
- ユーザーがマイドライブ直下に`HPlus Analytics`親Folderを作成する。
- 親Folder配下に、既定のCTI/Town/Heaven Folder構成を作成する。
- HPlus側はDriveの読み取りのみ行う。
- Drive原本の削除、移動、rename、Folder作成、Uploadは行わない。
- 既存Import Pipelineは変更せず、認証後の入力をAdapter/Dispatcherへ渡す。

## 4. Authentication Strategy

### 4.1 正式推奨方式

Phase H v1の正式案は**Google Cloud Service Account + My Drive Folder共有**とする。

```text
User Google Account
  ↓ My Drive
HPlus Analytics Folder
  ↓ 親FolderをService AccountへViewer共有
Service Account
  ↓ Google Drive API read-only
HPlus Analytics VPS / Drive Adapter
```

Service Accountは個人アカウントの代替ログインではなく、限定共有されたFolderを読む機械Identityである。ユーザーの個人OAuth refresh tokenをVPSへ置かない。

### 4.2 権限モデル

- 親Folder単位でService Accountへ共有する。
- 子Folderは親からの継承を利用する。
- 共有権限はViewer/Reader相当に限定する。
- Viewerでは削除、移動、rename、作成、Uploadを許可しない。
- 実装時は親Folder、子Folder、対象CSV/XLSXを列挙・downloadできることをConnection Testで確認する。

### 4.3 不採用方式

個人ユーザーのパスワード、ブラウザCookie、手作業OAuth tokenの共有、Drive全体のWrite権限、共有ドライブ前提のDomain-wide DelegationはPhase H v1では採用しない。

## 5. Google Cloud Configuration

設計上、次の構成要素が必要である。

1. HPlus Analytics専用Google Cloud Project
2. Google Drive APIの有効化
3. HPlus用Service Account
4. Service Account credential（秘密鍵を含む）
5. Service Accountの識別子（表示用メールアドレス）
6. マイドライブの`HPlus Analytics`親Folder共有設定
7. VPSのSecret配置
8. 読み取りConnection Test

Google Cloud ProjectやService Accountを個人の別用途と共用しない。Cloud Project名、Project ID、Service Account email、鍵ID、Folder IDの実値は本書へ記載しない。

## 6. Service Account

Service Accountは、Drive AdapterがGoogle APIへ接続するための認証主体である。

保持する情報の分類：

| 情報 | 性質 | 本書への記載 |
|---|---|---|
| Service Account email | 識別子・共有先 | 実値は記載しない |
| Project ID | 構成情報 | 実値は記載しない |
| Private key | Secret | 絶対に記載・commitしない |
| key ID | ローテーション識別 | 実値は記載しない |
| Drive Folder ID | Configuration | 実値は記載しない |

Service Accountがアクセスできるのは共有されたHPlus親Folderだけとする。Google Cloud IAM上のProject権限と、Drive上のFolder共有権限は別々に最小化する。

## 7. Drive Folder Sharing

### 7.1 共有対象

通常のマイドライブ上の次の親FolderだけをService Accountへ共有する。

```text
My Drive/
└── HPlus Analytics/
    ├── CTI/
    ├── Town/
    ├── Heaven/
    ├── Archive/  (v1未使用)
    └── Error/    (v1未使用)
```

正式な子Folder、店舗、metric mappingは`PHASE_H_GOOGLE_DRIVE_FOLDER_SPEC.md`を正とする。

### 7.2 Folder ID

CredentialはAPIへ接続する認証、Folder IDはImport Configurationの識別設定である。両者を同じSecretや同じ値として扱わない。

Folder IDはPrivate KeyほどのSecretではないが、Production Configurationとして管理し、Git、公開ログ、画面の不要な箇所へ出さない。Folder名変更に依存せず、Folder IDを唯一の正とする。

### 7.3 共有検証

H2実装時のConnection Testでは、次を読み取り専用で確認する。

- 親Folder取得
- 正式子Folder一覧
- 設定済みFolder IDの存在
- Viewer権限でのファイル一覧
- CSV/XLSX metadata取得
- ファイルdownload可否
- Folder IDとImportSource mappingの一致

## 8. OAuth Scopes

### 8.1 推奨scope

ファイル内容（CSV/XLSX）をdownloadする必要があるため、Phase H v1の正式候補は次のGoogle Drive API scopeとする。

```text
https://www.googleapis.com/auth/drive.readonly
```

これは認証主体がアクセスできるDriveリソースの読み取りを許可する。実際の到達範囲は、Service Accountへ共有したFolder権限で制限する。

### 8.2 比較

| Scope | 評価 |
|---|---|
| `drive.readonly` | CSV/XLSXの一覧・metadata・downloadに必要。v1推奨 |
| `drive.metadata.readonly` | metadata中心で、Import原本のdownloadには不足するため単独採用不可 |
| `drive.file` | アプリが作成/Pickerで扱う限定ファイル中心。既存マイドライブFolderをService Accountが読む主用途には適合性が低い |
| Write系scope | v1の削除・移動・作成を行わない方針に反するため不採用 |

Scopeは最小権限で固定し、実装時に利用APIが本当に必要とするscopeとGoogle公式仕様を再確認する。追加scopeは設計審査なしに増やさない。

## 9. Credential Storage

### 9.1 比較

| 方式 | 長所 | リスク/注意 | 評価 |
|---|---|---|---|
| A. JSON key fileをVPSへ配置 | Google SDKと相性がよく、XServer単体でも運用しやすい | ファイル権限、rotation、backup除外が必要 | **Phase H v1推奨** |
| B. JSON全体を環境変数へ格納 | file mount不要 | shell/log/process/env漏洩、改行/escaping、secret管理が難しい | 非推奨 |
| C. Secret Manager等 | rotation/auditが強い | XServer単体構成に追加依存・費用・認証が必要 | Future |

Phase H v1はAを採用する。ただし、鍵ファイルはGit管理外の専用Secret directoryに置き、アプリへread-onlyで参照させる。Bをfallbackにしない。

### 9.2 推奨ホスト配置

```text
/opt/hplus-analytics/secrets/google-drive-service-account.json
```

- `secrets/`はGit管理外
- JSONはroot所有、permission `600`相当を原則とする
- rootまたはHPlus appに必要な読取だけを許可する
- private keyをstdout、app log、health responseへ出さない
- Production backup/restoreのDB dumpへSecretを含めない
- deploy scriptはSecretを上書き、生成、削除しない
- Secret directoryはvolume backupやリポジトリarchiveの対象から除外する

Containerが非rootユーザーで動く場合、`600`のまま読み取り可能なDocker secret/read-only mount方式を実装時に選び、ホスト全体を緩いpermissionへ変更しない。

## 10. Docker Integration

本番Appからは、credentialをread-onlyでmountする設計とする。これは設計例であり、今回は`docker-compose.production.yml`を変更しない。

```text
Host:
  /opt/hplus-analytics/secrets/google-drive-service-account.json

Container:
  /run/secrets/google-drive-service-account.json

Mount:
  read-only
```

`.env.production`へはJSON本体ではなく、次のようなパスだけを保持する。

```text
GOOGLE_DRIVE_CREDENTIALS_PATH=/run/secrets/google-drive-service-account.json
```

ファイルが存在しない場合はDrive Automationだけを停止し、既存のManual ImportとAnalytics本体は起動・利用可能にする。health APIでprivate keyやcredential内容を返さない。

## 11. Production Configuration

Productionには次の非Secret設定を持つ想定である。

- `GOOGLE_DRIVE_CREDENTIALS_PATH`
- Root Folder Configuration（Folder IDは実値をSecret/config管理）
- `ImportSource` mapping
- poll interval（将来Scheduler）
- retry上限、timeout、dry-run/auto-confirm flag

Service Account credentialはProduction用とし、Developmentへコピーしない。deployでSecretがない場合は、Drive Adapterをdisabledにしてdeployを失敗させるか、既存Analyticsに影響しないwarning-only起動にするかをH9で決定する。初期安全方針は**Automation disabled、既存アプリは起動継続**である。

## 12. Local Development

### 12.1 比較

| 案 | 内容 | 評価 |
|---|---|---|
| Production SA共用 | Productionと同じ鍵/Folderを読む | 漏洩時の影響範囲が大きく禁止 |
| 同一SA + Development Folderのみ共有 | 同一Identityで権限を分離 | Identityと監査が混ざるため非推奨 |
| Development専用SA + Development Folder | Credential、Folder、監査を完全分離 | **推奨** |

推奨はDevelopment専用Service Accountと、マイドライブ内の`HPlus Analytics Development`専用Folderである。匿名化fixtureを第一候補とし、実データを使う場合もProduction Folderを共有しない。

### 12.2 Local Secret

Local credentialもGit外（例: user home配下）に置き、`.env.local`にはpathのみを記載する。Production JSON、Production Folder ID、Production Service Account emailをローカルへコピーしない。

## 13. Security

- Private Key、JSON全体、refresh tokenをGitへcommitしない。
- secret値、Authorization header、API token、credential pathの不要な詳細をログへ出さない。
- API errorをそのまま画面へ返さず、秘密値をredactする。
- Drive共有は親FolderのViewerに限定し、Write権限を与えない。
- Production/DevelopmentのCloud Project、Service Account、Folderを分離する。
- Folder共有権限を定期確認し、退職・担当変更時に解除する。
- Key rotation時は新Key検証後に旧Keyを無効化・削除する。
- 漏洩時はGoogle Cloud側で該当Keyを即時disable/deleteし、Service Account共有を見直す。
- credentialをDB、ImportBatch metadata、Analytics DTOへ保存しない。
- backupにはSecret directoryを含めず、ログ・snapshot・support bundleからも除外する。

## 14. Failure Handling

すべての認証/接続障害は、自動Importを安全停止し、既存Analytics・Manual Import・DBを壊さない。自動rollbackやDB resetは行わない。

| Failure | 判定 | 対応 |
|---|---|---|
| Credential file missing | 起動/接続前 | Drive Automation disabled、明確なerror code、Manual Import継続 |
| JSON malformed | credential parse | RetryせずQuarantine/Manual修正 |
| Service Account disabled | auth 401/403 | 自動Import停止、管理者確認 |
| Drive API disabled | API設定エラー | 自動RetryせずCloud設定確認 |
| Folder未共有 | 403/404 | Folder mapping不一致として停止 |
| Folder ID誤り | root/child取得不能 | 未登録/UNMAPPED、Importしない |
| Permission denied | list/download 403 | 権限修正まで停止 |
| API quota/5xx | 一時APIエラー | backoff付き有限Retry |
| Credential revoked/expired相当 | auth失敗 | key rotation/再発行後に手動再開 |
| Network error | timeout/DNS/TLS | 有限Retry、超過後RETRY_WAITING |

取得後のMIME、ヘッダー、シート、必須列、期間、metricHint不一致はDrive認証障害ではなく、既存Import PipelineのValidation/ImportErrorとして扱う。

## 15. Diagnostics

### 15.1 Connection Test

将来、管理画面またはADMIN専用CLIに`Google Drive Connection Test`を設ける。

確認項目：

1. credential parse/auth成功
2. root Folder取得
3. 正式子Folder一覧
4. Folder ID mapping
5. Viewer read permission
6. 代表CSV/XLSX metadata取得
7. download read test（temporaryのみ）
8. API latency
9. last successful access

Classification：H2/H3の実装前検証には必須、一般運用の常設UIはFuture。失敗してもConnection Test自身がImportやDBを実行しない。

### 15.2 Health

既存`/api/health`のDB healthとDrive connection healthを混同しない。Driveが停止しても、Database connectedのAnalytics healthを失敗扱いにしない。将来は別の内部診断状態として`DRIVE_DISABLED`、`DRIVE_AUTH_FAILED`、`DRIVE_LAST_SUCCESS`等を表示する。

## 16. Audit / Logging

認証と接続結果を秘密値なしで監査する。

```text
serviceAccountIdentifier (必要最小限、hash化も可)
timestamp
operation (AUTH / LIST / DOWNLOAD / CONNECTION_TEST)
folderConfigKey（実Folder IDの直接出力は避ける）
result (SUCCESS / FAILURE)
errorCode
latencyMs
driveFileIdのhash化識別子
```

Service Account emailやFolder IDを毎回ログへ平文出力しない。Private key、Authorization header、credential JSON、ファイル内容は絶対に監査ログへ保存しない。既存ImportBatch/ImportErrorには必要な処理結果だけを関連付ける。

## 17. Credential Rotation

1. 新KeyをGoogle Cloudで発行
2. 新Keyを安全な一時Secretとして配置
3. read-only Connection Test
4. Drive list/downloadのdry-run
5. App/workerを新Keyへ切替
6. last successful access確認
7. 旧Keyをdisable/delete
8. 一時ファイル、旧Secret、ログ痕跡を削除
9. Rotation eventを監査記録

周期はOpen Questionとするが、漏洩疑い・担当変更・Cloud policy変更時は即時rotationする。DB migrationやDrive原本移動はrotationに含めない。

## 18. Implementation Requirements

- Google公式SDK/API仕様に従い、Service Account JWT認証と`drive.readonly`を使用する。
- credentialはread-only mountし、アプリの書き込み対象にしない。
- Folder ID mappingは`PHASE_H_GOOGLE_DRIVE_FOLDER_SPEC.md`と一致させる。
- Drive Adapterと既存Import Pipelineの境界をテストする。
- credential missing時のAutomation disabled起動をテストする。
- Auth、list、download、quota、permission、networkのintegration testを匿名/専用Development Folderで行う。
- Productionへdeployする前に、dry-run、Connection Test、backup、rollback不要の安全停止を確認する。
- 共有ドライブ、Write scope、個人OAuth token、Production credentialのLocal利用を実装しない。

## 19. Open Questions

- Development専用Service Account/Folderをいつ作成するか。
- Key rotation周期と担当者、緊急disable手順。
- Secret Managerを導入するPhaseと、XServer単体での費用/運用評価。
- Connection TestをCLIのみとするか、管理画面にも出すか。
- Folder IDを既存ImportSourceへ持たせるか、Drive State/configへ分離するか。
- Auto-confirmを許可するDataTypeと、常にADMIN確認を要求するDataType。
- 将来Write permissionが必要になった場合の別Service Account分離。
- Shared Driveへ移行する場合の認証・権限再設計。
- 監査ログの保持期間、Service Account identifierのhash化方式。
- Scheduler、quota、retry、notification、SLOの正式値。

## 20. Appendix

### 20.1 Formal existing values

- `MediaType`: `CTI`, `TOWN`, `HEAVEN`
- `ImportDataType`: `CTI_CAST_REPORT`, `TOWN_STORE`, `TOWN_CAST`, `TOWN_URL`, `TOWN_LANDING`, `HEAVEN_STORE`, `HEAVEN_CAST`
- Heaven `metricHint`: `PAGE_ACCESS`, `DIARY_POSTS`, `MY_GIRL`, `MITENE_SENT`, `OKINI_TALK_SENT`, `ATTENDANCE_NOTICE`, `DIARY_NOTICE`
- `ImportSourceKind`: `MANUAL_UPLOAD`, `GOOGLE_DRIVE`
- 推奨OAuth scope: `https://www.googleapis.com/auth/drive.readonly`

### 20.2 Consistency

本書は、通常のマイドライブ、親Folder共有、Folder IDを設定の正とするFolder仕様、Adapter/Dispatcher/Drive Stateを定義したAutomation Architecture、既存ProductionのSecret非公開・Docker運用方針と整合する。今回の設計は新しいImportDataType、metric enum、Parser、DB model、Docker設定を追加するものではない。
