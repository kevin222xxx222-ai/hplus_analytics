type Store = { value: string; label: string };
export function AnalyticsStoreSelector({ value, stores, onChange, label = "店舗" }: { value: string; stores: Store[]; onChange: (value: string) => void; label?: string }) {
  return <label className="form-field"><span>{label}</span><select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>{stores.map((store) => <option key={store.value} value={store.value}>{store.label}</option>)}</select></label>;
}
