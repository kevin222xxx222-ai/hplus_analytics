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
- MULTI_STORE_EVIDENCE
- STORE_UNCERTAIN

## Evidence

選択Castの詳細では、店舗ごとに以下を表示する。

- CTI: 最小日・最大日・件数
- Town: 最小日・最大日・件数
- Heaven: 最小日・最大日・件数
- Alias: validFrom / validTo / mediaType
- MediaListing: listedFrom / listedTo / isListed

これらは確認された根拠期間であり、Membershipへ自動コピーしない。

## Membership操作

既存の`src/lib/casts/membership-service.ts`をServer Actionから呼び出す。

- 新規Membership
- 更新
- 退店
- 再入店（既存LEFT行を再利用しない）
- ON_LEAVE
- 復帰

Service側のstatus、日付順、重複検証を唯一のValidationとする。

Legacy `startedOn`は「入店日候補（編集可）」として表示するだけで、自動保存しない。

## Production / Import境界

- Production Backfill: 未実行
- 自動Backfill: なし
- CTI/Town/Heaven Resolver: 未変更
- Analytics: 未変更
- Importからの再入店・Cast自動変更: なし
