const labels: Record<string, string> = {
  Cause: "現在の状況", Evidence: "判断根拠", Growth: "改善ポイント", "Next Best Action": "推奨アクション", Action: "アクション",
  Performance: "実績", Volume: "実績データ", Efficiency: "効率", Exposure: "媒体露出", Activity: "活動状況", Comparison: "比較結果", Trend: "推移", Time: "曜日分析",
  "Store Comparison": "店舗比較", "Cast Comparison": "キャスト比較", "Data Notes": "データについて", Sample: "サンプル数", Confidence: "信頼度", Availability: "データ状態",
  Unavailable: "利用できません", Missing: "データ不足", MISSING: "データ不足", VALUE: "利用可能", ZERO: "0件", Zero: "0件", High: "高", Medium: "中", Low: "参考", Insufficient: "判定不可",
  "Data不足": "データ不足", "Capacity上限": "受入上限", "Schedule制約": "勤務制約", "Exposure不足": "媒体露出不足", "Activity不足": "活動不足", "Efficiency改善余地": "効率改善余地", "安定維持": "安定維持",
  "Sample / Data Health": "サンプル数 / データ状態", "Growth Potential / Next Best Action": "改善ポイント / 推奨アクション", "Insights / Growth / Action": "分析結果 / 改善ポイント / アクション",
  "Business Day Type Analysis": "営業日タイプ分析", "Weekday Overview": "曜日別概要", "Efficiency by Weekday": "曜日別の効率", "Volume by Weekday": "曜日別の実績データ", "Cast一覧": "キャスト一覧",
  "Performance Funnel": "実績ファネル", "Time Analytics": "曜日分析", "Trend Analytics": "推移分析", "Cast Analytics": "キャスト分析", "Store Analytics": "店舗分析", "Cast比較": "キャスト比較", "Store比較": "店舗比較", "Cast Summary": "キャスト概要", "Cast Composition": "キャスト構成",
};
export function localizeAnalyticsLabel(value: string) {
  if (labels[value]) return labels[value];
  return value.replace(/Next Best Action/g, "推奨アクション").replace(/Growth Potential/g, "改善ポイント").replace(/Store Comparison/g, "店舗比較").replace(/Cast Comparison/g, "キャスト比較").replace(/Data Notes/g, "データについて").replace(/Performance/g, "実績").replace(/Volume/g, "実績データ").replace(/Efficiency/g, "効率").replace(/Exposure/g, "媒体露出").replace(/Activity/g, "活動状況").replace(/Comparison/g, "比較結果").replace(/Trend/g, "推移").replace(/Time/g, "曜日分析").replace(/Sample/g, "サンプル数").replace(/Confidence/g, "信頼度").replace(/Availability/g, "データ状態");
}
