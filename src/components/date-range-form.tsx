export function DateRangeForm({ from, to, extra }: { from: string; to: string; extra?: React.ReactNode }) {
  return <form className="panel mb-6 flex flex-wrap items-end gap-4 p-4"><div><label className="form-label">開始日</label><input className="form-input mt-2 w-[170px]" type="date" name="from" defaultValue={from} /></div><div><label className="form-label">終了日</label><input className="form-input mt-2 w-[170px]" type="date" name="to" defaultValue={to} /></div>{extra}<button className="primary-button">表示</button></form>;
}
