export type MetricCategory = "CTI" | "効率" | "Town" | "Heaven" | "比較" | "分析分類" | "目標";
export type MetricDefinition = {
  key: string;
  label: string;
  category: MetricCategory;
  meaning: string;
  formula?: string;
  unit?: string;
  whatToSee: string;
  caution: string;
  interpretation?: string;
  pages?: string[];
  related?: string[];
};

const d = (key: string, label: string, category: MetricCategory, meaning: string, whatToSee: string, caution: string, formula?: string, unit?: string): MetricDefinition => ({ key, label, category, meaning, whatToSee, caution, formula, unit, pages: ["/", "/analytics/casts/overview", "/help/analytics-guide"] });

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  sales: d("sales", "売上", "CTI", "CTIに記録された料金の合計です。", "店舗の売上規模と目標差を確認します。", "媒体のPVとは顧客単位で直接対応しません。", "料金の合計", "円"),
  reward: d("reward", "女子報酬", "CTI", "キャストへ支払う報酬の合計です。", "売上に対する報酬規模と粗い収益構造を確認します。", "補正・費用の扱いはCTI仕様を確認してください。", "女子報酬の合計", "円"),
  profit: d("profit", "CTI利益", "CTI", "CTIで記録された利益の合計です。", "売上・報酬以外を含むCTI上の利益を確認します。", "未採用・未取得の場合は—です。", "CTI利益の合計", "円"),
  attendanceDays: d("attendanceDays", "出勤日数", "CTI", "キャストが出勤した実日数です。全体では同日複数店舗を1日と数えます。", "出勤機会と効率の分母を確認します。", "1日だけの値はLOW_SAMPLEとして慎重に読みます。", "同一キャスト・同一日を1日", "日"),
  attendanceMinutes: d("attendanceMinutes", "出勤時間", "CTI", "CTIに記録された出勤時間です。", "時間あたり効率と稼働量を確認します。", "0または未取得の場合、時間あたり指標は—です。", "出勤時間の合計", "分"),
  reservations: d("reservations", "予約", "CTI", "CTIの予約数です。", "予約機会の規模を確認します。", "媒体閲覧との直接の予約経路は特定できません。", "予約数の合計", "件"),
  services: d("services", "接客", "CTI", "CTIの接客数です。", "接客後の成約・本指名との比較に使います。", "母数が少ない率は大きく変動します。", "接客数の合計", "件"),
  contracts: d("contracts", "成約", "CTI", "CTIの成約数です。", "売上へつながった件数を確認します。", "Town・Heavenの閲覧数と顧客単位では対応しません。", "成約数の合計", "件"),
  contractRate: d("contractRate", "成約率", "CTI", "予約に対して成約した割合です。", "予約後の成約傾向を参考確認します。", "予約が少ない場合は不安定。因果関係は断定しません。", "成約数 ÷ 予約数", "%"),
  regular: d("regular", "本指名数", "CTI", "本指名の件数です。", "継続利用の規模を確認します。", "接客数が少ない場合は単独で判断しません。", "本指名数の合計", "件"),
  regularRate: { ...d("regularRate", "本指名率", "CTI", "接客数に対して本指名がどの程度あったかを示します。", "再指名力・接客後の継続性を確認します。", "接客数が少ない場合は大きく変動します。分母0は—です。", "本指名数 ÷ 接客数", "%"), related: ["services", "regular"] },
  averageUnitPrice: d("averageUnitPrice", "平均単価", "CTI", "成約1件あたりの平均料金です。", "単価改善と成約数のどちらが売上差に寄与しているか確認します。", "成約0件の場合は—です。", "料金 ÷ 成約数", "円"),
  salesPerDay: d("salesPerDay", "売上／出勤日", "効率", "1出勤日あたりの売上です。", "少ない出勤で高い成果の候補を探します。", "出勤1日はLOW_SAMPLEです。", "売上 ÷ 出勤日数", "円"),
  salesPerHour: d("salesPerHour", "売上／出勤時間", "効率", "1時間あたりの売上です。", "稼働時間に対する売上効率を確認します。", "出勤時間0は—です。", "売上 ÷ 出勤時間", "円/時"),
  rewardPerHour: d("rewardPerHour", "女子報酬／出勤時間", "効率", "1時間あたりの女子報酬です。", "キャスト側の時間効率を確認します。", "出勤時間0は—です。", "女子報酬 ÷ 出勤時間", "円/時"),
  contractsPerDay: d("contractsPerDay", "成約／出勤日", "効率", "1出勤日あたりの成約数です。", "出勤を増やした場合の参考効率を確認します。", "出勤1日はLOW_SAMPLEです。", "成約数 ÷ 出勤日数", "件/日"),
  contractsPerHour: d("contractsPerHour", "成約／出勤時間", "効率", "1時間あたりの成約数です。", "時間効率を確認します。", "出勤時間0は—です。", "成約数 ÷ 出勤時間", "件/時"),
  salesPerService: d("salesPerService", "売上／接客", "効率", "1接客あたりの売上です。", "接客の単価傾向を確認します。", "接客0件は—です。", "売上 ÷ 接客数", "円"),
  rewardPerService: d("rewardPerService", "女子報酬／接客", "効率", "1接客あたりの女子報酬です。", "接客あたりの報酬効率を確認します。", "接客0件は—です。", "女子報酬 ÷ 接客数", "円"),
  townPv: d("townPv", "Town PV", "Town", "Town女子ページの閲覧数です。", "露出規模を確認します。", "未掲載・未取得は0ではなく—です。", "対象期間PV合計", "PV"),
  townUu: d("townUu", "Town UU", "Town", "Town女子ページのユニーク閲覧数です。", "閲覧した利用者規模を確認します。", "CTI成約と顧客単位では対応しません。", "対象期間UU", "UU"),
  townTel: d("townTel", "Town TEL", "Town", "TownページからのTELタップUUです。", "閲覧からTELタップへの傾向を確認します。", "CTI予約・成約への直接経路は特定できません。", "TELタップUU", "件"),
  townTelRate: d("townTelRate", "TEL率", "Town", "Town UUに対するTELタップの割合です。", "閲覧後のTELタップ傾向を参考確認します。", "UU0件は—。成約率とは呼びません。", "TEL ÷ UU", "%"),
  townPvDay: d("townPvDay", "PV／出勤日", "Town", "1出勤日あたりのTown PVです。", "出勤機会に対する露出を確認します。", "Town未掲載または出勤0日は—です。", "PV ÷ 出勤日数", "PV/日"),
  townPvHour: d("townPvHour", "PV／出勤時間", "Town", "1出勤時間あたりのTown PVです。", "時間あたり露出を確認します。", "出勤時間0は—です。", "PV ÷ 出勤時間", "PV/時"),
  page_access: d("page_access", "Heaven PAGE_ACCESS（女子ページアクセス）", "Heaven", "Heaven女子ページのアクセス数です。", "Heavenでの露出規模を確認します。", "CTI予約・成約との顧客単位の対応はありません。", "DAILY_EVENTの期間合計", "件"),
  diary_posts: d("diary_posts", "Heaven DIARY_POSTS（写メ日記投稿数）", "Heaven", "Heavenの写メ日記投稿数です。", "媒体活動量とアクセスの傾向を確認します。", "投稿数だけで成果を断定しません。", "DAILY_EVENTの期間合計", "件"),
  my_girl: d("my_girl", "Heaven MY_GIRL（マイガール数）", "Heaven", "Heavenの時点スナップショットです。", "期間最終値と期間増減を確認します。", "日次合計せず、SNAPSHOTとして扱います。", "期間最終値・最終値−初期値", "人"),
  mitene_sent: d("mitene_sent", "Heaven MITENE_SENT（ミテネ送信数）", "Heaven", "Heavenのミテネ送信数です。", "接触活動量を確認します。", "CTI成約への直接因果は示しません。", "DAILY_EVENTの期間合計", "件"),
  okini_talk_sent: d("okini_talk_sent", "Heaven OKINI_TALK_SENT（オキニトーク送信数）", "Heaven", "Heavenのオキニトーク送信数です。", "接触活動量を確認します。", "CTI成約への直接因果は示しません。", "DAILY_EVENTの期間合計", "件"),
  attendance_notice: d("attendance_notice", "Heaven ATTENDANCE_NOTICE（出勤通知数）", "Heaven", "Heavenの出勤通知数です。", "出勤告知活動を確認します。", "通知数だけで来店や成約を断定しません。", "DAILY_EVENTの期間合計", "件"),
  diary_notice: d("diary_notice", "Heaven DIARY_NOTICE（写メ日記通知数）", "Heaven", "Heavenの通知スナップショットです。", "期間最終値と増減を確認します。", "日次合計せず、SNAPSHOTとして扱います。", "期間最終値・最終値−初期値", "件"),
  DAILY_EVENT: d("DAILY_EVENT", "DAILY_EVENT（毎日発生値）", "Heaven", "日ごとに発生したイベント値です。", "期間合計と日別推移を確認します。", "SNAPSHOTと合算しません。", "日別値の期間合計"),
  SNAPSHOT: d("SNAPSHOT", "SNAPSHOT（時点値）", "Heaven", "その時点の累積・状態値です。", "期間最終値と期間増減を確認します。", "日次合計しません。前日値がない増減は—です。", "最終値・最終値−初期値"),
  average: d("average", "平均", "比較", "対象集団の算術平均です。", "極端な値の影響を受ける基準として確認します。", "外れ値の影響を受けます。", "合計 ÷ 件数"),
  median: d("median", "中央値", "比較", "値を並べた中央の値です。", "典型的なキャストとの比較に使います。", "対象人数が少ない場合は不安定です。", "並べた中央の値"),
  top25: d("top25", "上位25%", "比較", "対象集団の上位四分位に入る基準です。", "高効率候補を抽出します。", "母集団定義と最低母数を確認します。", "75パーセンタイル以上"),
  bottom25: d("bottom25", "下位25%", "比較", "対象集団の下位四分位に入る基準です。", "改善余地の候補を抽出します。", "因果関係を断定せず、根拠指標を確認します。", "25パーセンタイル以下"),
  storeBasis: d("storeBasis", "店舗基準", "比較", "選択した店舗・全体の比較基準です。", "同じ条件の集団内で差を確認します。", "全体と店舗の対象範囲を確認します。"),
  LOW_SAMPLE: d("LOW_SAMPLE", "LOW_SAMPLE（小母数）", "分析分類", "分母が少なく、値が大きく変動しやすい状態です。", "候補を優先確認する前の注意タグです。", "1日・少数件の率や効率を単独で判断しません。"),
  hiddenAce: d("hiddenAce", "隠れエース候補", "分析分類", "出勤機会が少なく効率が高い候補です。", "出勤増加や成功要因の横展開を検討します。", "候補であり、成果や原因を断定しません。"),
  attendanceOpportunity: d("attendanceOpportunity", "出勤増加候補", "分析分類", "出勤が少なく効率が高い可能性のある候補です。", "追加出勤の参考シミュレーションを確認します。", "単純推計であり、出勤可能性を確認します。"),
  buried: d("buried", "埋もれ候補", "分析分類", "実績や媒体活動の一部に改善余地がある候補です。", "露出・予約・成約・再指名のどこを確認するか決めます。", "媒体未掲載や母数不足は候補判定から除外します。"),
  bottleneck: d("bottleneck", "ボトルネック候補", "分析分類", "店舗基準との差が大きい工程の候補です。", "次に確認する工程を絞ります。", "原因ではなく参考仮説です。"),
  achievementRate: d("achievementRate", "達成率", "目標", "実績が目標の何％に到達したかです。", "目標との差と進捗を確認します。", "目標未設定・目標0は—です。", "実績 ÷ 目標", "%"),
  landingForecast: d("landingForecast", "着地予測", "目標", "現在のペースで期間末に到達する金額の単純予測です。", "目標到達の可能性を早期確認します。", "曜日・営業日補正なしの参考値です。", "現在実績 ÷ 経過日数 × 期間日数", "円"),
  requiredSalesPerDay: d("requiredSalesPerDay", "必要売上／日", "目標", "残り日数で目標に届くために必要な1日売上です。", "残り期間の必要ペースを確認します。", "残日数0・目標未設定は—です。", "(目標−現在実績) ÷ 残日数", "円/日"),
  shortfall: d("shortfall", "不足見込み", "目標", "現在ペースの着地予測と目標との差です。", "追加施策が必要な規模を確認します。", "単純ペース予測に基づく参考値です。", "目標−着地予測", "円"),
  simplePace: d("simplePace", "単純ペース予測", "目標", "経過日数だけで延長した着地予測です。", "速報として現状ペースを把握します。", "曜日補正や営業日補正を含みません。", "現在実績 ÷ 経過日数 × 期間日数", "円"),
  dataHealthScore: d("dataHealthScore", "データ品質スコア", "比較", "取込状態と未反映リスクを確認する運用スコアです。", "分析値を見る前に未確定・FAILED・日付欠損を確認します。", "データの正しさを保証するものではありません。", "100 − 各状態の規定減点", "点"),
  pendingBatch: d("pendingBatch", "未確定Batch", "比較", "previewまたは保留状態で実績へ未反映のImportBatchです。", "確定前に影響額と対象行を確認します。", "意図的保留や重複終了済みは重大度を分けて扱います。", "PREVIEW_READY・WAITING等の件数", "件"),
  estimatedSalesImpact: d("estimatedSalesImpact", "推定売上影響額", "比較", "未確定previewと既存自然キーとの差分から見積もる未反映売上です。", "HOMEの確定済み売上と分けて確認します。", "算出不能行・管理表の追加項目は含めない参考値です。", "新規料金 + 更新料金との差分", "円"),
  dateCoverage: d("dateCoverage", "日付カバレッジ", "比較", "対象期間の日付ごとに媒体の反映状態を示します。", "未取込・未確定・警告日を見つけます。", "Heavenの累積CSVは日次欠損として判定しません。", "対象日と実績・Batchの照合"),
  latestReflectedDate: d("latestReflectedDate", "最新反映日", "比較", "実績テーブルで確認できる媒体別の最新日です。", "データがどこまで反映されているか確認します。", "最新Batch対象日とは異なる場合があります。", "実績の最大businessDate/date"),
  dataMissing: d("dataMissing", "データ欠損", "比較", "期待される対象日に実績または取込状態がない状態です。", "再取込・確認が必要な日を特定します。", "媒体の取込頻度と対象範囲を確認します。"),
  openWarning: d("openWarning", "OPEN WARNING", "比較", "管理者確認や未紐付けなど、解決されていない警告です。", "未確定理由と影響を確認します。", "すべてが同じ重大度ではありません。"),
  openError: d("openError", "OPEN ERROR", "比較", "解析・取込で解決していないエラーです。", "FAILEDや算出不能の原因を確認します。", "自動でstatusを変更しません。"),
  townHeavenReference: d("townHeavenReference", "Town＋Heaven参考合計", "比較", "Town PVとHeavenアクセスを参考値として並べた合計です。", "媒体横断の露出規模を大まかに確認します。", "同じ顧客の重複を除けないため、正式なPV合算ではありません。", "Town PV + Heaven PAGE_ACCESS", "件"),
  correlation: d("correlation", "相関係数", "比較", "2つの値の連動傾向を示す統計値です。", "傾向の強さを探索します。", "相関は因果関係を意味せず、母数が少ない場合は不安定です。", "2変数の相関", "-1〜1"),
};

export const METRIC_CATEGORIES = ["CTI", "効率", "Town", "Heaven", "比較", "分析分類", "目標"] as const;
export function metricDefinition(key: string) { return METRIC_DEFINITIONS[key] ?? { key, label: key, category: "比較" as const, meaning: "未登録の指標です。元キーを表示しています。", whatToSee: "指標定義を確認してください。", caution: "定義未登録", pages: ["/help/metrics"] }; }
