type Column = { key: string; label: string };
export function AnalyticsSort({ value, columns, onChange, label = "並び順" }: { value: string; columns: Column[]; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field"><span>{label}</span><select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>;
}
