type Option = { value: string; label: string };
export function AnalyticsComparisonSwitch({ value, options, onChange, label = "比較基準" }: { value?: string; options: Option[]; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field"><span>{label}</span><select className="form-input" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
