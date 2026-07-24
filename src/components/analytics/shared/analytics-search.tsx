export function AnalyticsSearch({ value, onChange, label = "検索" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field"><span>{label}</span><input className="form-input" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="名前を検索" /></label>;
}
