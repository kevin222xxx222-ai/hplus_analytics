# Phase J0-D Cast Membership Review / Management UI

Status: IMPLEMENTED / Production Backfill NOT EXECUTED

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

Service側のstatus、日付順、重複検証を唯一のValidationとする。

Legacy `startedOn`は候補として表示するが、入店日フォームは未入力を初期値とし、自動保存しない。現在所属の確認を優先し、日付不明のMembershipはNULLで登録できる。

## Quick Registration

AdminはEvidenceを確認した店舗を複数選択し、「選択内容を確認」→「確認済み・選択店舗を登録」の2段階でACTIVE Membershipを登録できる。入店日はNULL、sourceは手動確認として保存する。既存Membershipのある店舗はQuick登録から除外し、詳細フォームで確認する。Viewerには操作を表示しない。

Membershipの状態・信頼度は日本語で表示する（在籍・休業・退店、確認済み・推定・不明）。再入店は既存LEFT行を編集せず、新規Membershipを作成する。退店操作は退店日入力と同じフォームで行い、leftAt当日は在籍扱いの既存境界を維持する。

## Production / Import境界

- Production Backfill: 未実行
- 自動Backfill: なし
- CTI/Town/Heaven Resolver: 未変更
- Analytics: 未変更
- Importからの再入店・Cast自動変更: なし
