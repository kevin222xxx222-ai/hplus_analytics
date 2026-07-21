# キャスト統合

更新日: 2026-07-16

## 目的

CTIとTownなどの媒体差により別々の内部Cast IDとして登録された同一人物を、ADMINの明示操作で1つの最終Castへ統合します。表示名変更とは別機能です。

## 状態設計

- `Cast.status`: 在籍・退店だけを表す。統合では変更しない
- `Cast.merged_into_cast_id IS NULL`: 通常利用できるCast
- `Cast.merged_into_cast_id IS NOT NULL`: 統合済みsourceCast
- `merged_into_cast_id`は常に未統合の最終targetを直接参照する
- sourceCastのID、表示名、在籍状態は監査用に保持し、物理削除しない

統合済みsource、統合済みtarget、同一IDの組み合わせは拒否します。既にsourceへ統合されていた過去sourceは新しい最終targetへ直接付け替えますが、過去の`CastMergeHistory.source_cast_id` / `target_cast_id`は変更しません。

## 移行対象

- CastAlias
- MediaListing
- CtiCastDaily
- TownCastDaily
- TownUrlDaily
- TownLandingDaily
- CastNameHistory
- ImprovementLog

`CastMergeHistory`は監査記録なので移行対象外です。現スキーマに`CastTarget`は存在しません。

## 衝突処理

`CtiCastDaily`、`TownCastDaily`、`CastAlias`、`MediaListing`の一意キーを事前検査します。

- 片方のみ: targetへ付け替え
- 完全一致: source側を削除して1件へ整理
- 値が異なる: 統合を停止

数値は加算せず、自動上書きもしません。完全一致はID、castId、作成・更新日時を除く全保存値で判定し、ImportBatchや元行情報も比較します。

## トランザクション

- PostgreSQL Serializableトランザクション
- source/target ID順のadvisory transaction lock
- プレビュー内容のSHA-256フィンガープリントを実行直前に再計算
- プレビュー後に関連データが変化していれば停止
- 途中失敗時は関連移行、target更新、source統合状態、履歴作成をすべてロールバック

## 画面

- `/masters/casts/duplicates`: 重複候補
- `/masters/casts/merge`: 統合プレビューと最終値選択
- `/masters/casts/merges`: 統合履歴
- `/masters/casts?showMerged=true`: 統合済みsourceCast

通常のキャスト一覧、分析、Alias候補、CTI/Town未紐付け候補は`merged_into_cast_id IS NULL`だけを対象にします。統合済みsourceの分析URLは、統合先名と統合日時を表示してから最終targetへ誘導します。
