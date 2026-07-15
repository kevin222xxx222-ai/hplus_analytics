export function PageHeader({ eyebrow = "MASTER DATA", title, description }: { eyebrow?: string; title: string; description: string }) {
  return <header className="mb-7"><p className="text-[11px] font-bold tracking-[0.18em] text-emerald-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></header>;
}
