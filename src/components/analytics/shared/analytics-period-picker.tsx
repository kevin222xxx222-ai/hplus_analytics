import type { ChangeEvent } from "react";

type Props = { from: string; to: string; onChange: (next: { from?: string; to?: string }) => void; label?: string };
export function AnalyticsPeriodPicker({ from, to, onChange, label = "期間" }: Props) {
  const input = (name: "from" | "to", value: string, text: string) => <label className="form-field"><span>{text}</span><input className="form-input" type="date" name={name} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ [name]: event.target.value })} aria-label={`${label}${text}`} /></label>;
  return <div className="analytics-period-picker" aria-label={label}>{input("from", from, "開始日")}<span className="analytics-period-separator" aria-hidden="true">〜</span>{input("to", to, "終了日")}</div>;
}
