# デリヘルタウン URL判定規則

更新日: 2026-07-15

## 正規化

- 前後空白を除去
- scheme/hostを小文字化
- queryとfragmentを集計キーから除外
- root以外の末尾 `/` を除外
- 元URLは別カラムに保存
- `shop` / `official` パスの数値を外部店舗ID、`gal` パスの数値を外部キャストIDとして抽出

選択店舗が正です。外部店舗IDは春日部 `16829`、越谷 `32782` との矛盾検証にのみ使用します。

## ページ種別

| ページ種別 | 実ファイルに基づくパス規則 | 用途 |
| --- | --- | --- |
| `STORE_TOP` | `/shop/{storeId}` または `/official/{storeId}` | 店舗トップ |
| `SCHEDULE` | `/shop/{storeId}/schedule` または `/official/{storeId}/schedule` | 出勤情報 |
| `GIRL_LIST` | `/shop/{storeId}/gals` または `/official/{storeId}/gals` | 女子一覧 |
| `SHOP_DIARY` | `/shop/{storeId}/diary` または `/official/{storeId}/diary` | 店舗日記 |
| `CAST_PROFILE` | `/gal/{castId}` または `/official/gal/{castId}` | キャストプロフィール |
| `CAST_DIARY` | 上記キャストパス + `/diary` | キャスト日記アクセス（投稿数ではない） |
| `EVENT` | 店舗パス + `/information` | お知らせ/イベント |
| `OTHER` | review、video、sc、未知パス、解析不能URLなど | 未分類 |

解析不能URLはWARNINGを残して `OTHER` として保存します。URL別と入口を意味するLP別は同じ判定器を使いますが、意味が違うため別テーブルで集計します。
