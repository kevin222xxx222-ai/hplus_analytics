# Phase J0-D Cast Membership Review / Management UI

Status: IMPLEMENTED / J0-E Production VERIFIED

## UI構成

画面は`/masters/casts/memberships`に追加し、サイドバーからViewerも参照できる。既存のCast管理画面を乱立させず、Review QueueとCast詳細を同一画面の左右レイアウトで提供する。

- Viewer: 閲覧のみ
- Admin: Membershipの追加・更新・退店・休業・復帰・再入店が可能
- Cast Legacy field、Alias、Factは画面操作で自動変更しない

## Review Queue

一覧には次を表示する。

- 表示名
- Cast.status
- primaryStore
- startedOn / endedOn
- Backfill classification
- evidence stores
- Membership設定数

フィルター:

- 名前・Cast ID
- 分類
- 店舗

進捗カード:

- Total casts
- Membership設定済み
- 未対応
- 複数店舗候補（MULTI_STORE_CANDIDATE）
- STORE_UNCERTAIN

## Evidence

選択Castの詳細では、店舗ごとに以下を表示する。

- CTI: 最小日・最大日・件数
- Town: 最小日・最大日・件数
- Heaven: 最小日・最大日・件数
- Alias: validFrom / validTo / mediaType
- MediaListing: listedFrom / listedTo / isListed

Factの最小・最大日は実績の存在範囲であり、退店日ではない。MediaListingの掲載中状態やAliasのvalidTo未設定は現在掲載の候補として表示する。これらは確認された根拠期間であり、Membershipへ自動コピーしない。

## Membership操作

既存の`src/lib/casts/membership-service.ts`をServer Actionから呼び出す。

- 新規Membership
- 更新
- 退店
- 再入店（既存LEFT行を再利用しない）
- ON_LEAVE
- 復帰

## Cast単位の退店と検索（J0-F前運用）

通常の退店操作は店舗単位ではなくCast単位に統一した。`/masters/casts`の「退店」では退店日を1つ入力し、同一transaction内で次を行う。

- 対象CastのACTIVE / ON_LEAVE MembershipをすべてLEFT化し、同じ`leftAt`を設定
- `validTo IS NULL`のAliasを退店日でclose（既にclose済みのAliasは変更しない）
- `isListed=true`のMediaListingを`isListed=false`、`listedTo=退店日`へ更新
- Legacy互換の`Cast.status=INACTIVE`、`Cast.endedOn=退店日`へ同期

Membership・Alias・MediaListing・Castはadvisory lock付きtransactionで更新し、途中失敗時は全体rollbackする。通常画面から店舗別退店ボタンは表示しない。店舗追加・再入店は既存Membershipを削除せず、新しいACTIVE行を作成する。再入店時の媒体Aliasは、別人同名との混同を避けるためOperatorが明示登録する。

キャスト管理には表示名の部分一致検索を追加し、媒体Alias名も検索対象とする。検索はDBのcase-insensitive containsを使い、既存のCast/Alias IDを自動統合しない。

退店後のCastは「退店日」とMembership履歴を表示し、`/masters/casts/memberships`は履歴・Evidence・例外監査用に維持する。

Service側のstatus、日付順、重複検証を唯一のValidationとする。

Legacy `startedOn`は候補として表示するが、入店日フォームは未入力を初期値とし、自動保存しない。現在所属の確認を優先し、日付不明のMembershipはNULLで登録できる。

## Quick Registration

AdminはEvidenceを確認した店舗を複数選択し、「選択内容を確認」→「確認済み・選択店舗を登録」の2段階でACTIVE Membershipを登録できる。入店日はNULL、sourceは手動確認として保存する。既存Membershipのある店舗はQuick登録から除外し、詳細フォームで確認する。Viewerには操作を表示しない。

Membershipの状態・信頼度は日本語で表示する（在籍・休業・退店、確認済み・推定・不明）。再入店は既存LEFT行を編集せず、新規Membershipを作成する。退店操作は退店日入力と同じフォームで行い、leftAt当日は在籍扱いの既存境界を維持する。

## Production / Import境界

- Production Backfill: J0-E Canaryで190件をConfirm済み（ACTIVE 190件、`MEDIA_EVIDENCE_BACKFILL` 190件）
- 初期Evidence内訳: Town CASTのみ128、CTIのみ23、Town CAST + CTI39
- 初期化後Preview: EXISTING_ACTIVE 190件、CREATE_ACTIVE 0件
- 自動Backfill: なし
- CTI/Town/Heaven Resolver: 未変更
- Analytics: 未変更
- Importからの再入店・Cast自動変更: なし

## J0-E Production Canary手順

1. `/masters/casts/memberships/initialize`でPreviewを表示する。
2. CREATE_ACTIVE、Evidence source内訳、店舗集計、Dataset/ImportBatch status、重複数が監査PASSであることを確認する。
3. Adminが明示Confirmする。Confirm payloadは候補UUIDを送らず、Server ActionがPreviewを再取得・再監査する。
4. `cast_store_memberships`の件数、ACTIVE件数、`MEDIA_EVIDENCE_BACKFILL`件数を確認する。
5. 初期化後PreviewがEXISTING_ACTIVEへ変わり、CREATE_ACTIVEが0件であることを確認する。

次の操作Canaryでは、専用の対象Castで店舗追加、退店日入力によるLEFT化、LEFTからの新規Membershipによる再入店、ON_LEAVE/復帰を各1件確認する。FactやAliasの状態から退店日を自動生成せず、既存実データを直接変更しない。
