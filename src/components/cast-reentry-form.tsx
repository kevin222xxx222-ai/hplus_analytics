"use client";

import { useActionState, useState } from "react";
import { reenterCastAction, type ReentryActionState } from "@/app/actions/memberships";

const initialState: ReentryActionState = {};

type AliasSuggestion = { storeId: string; storeName: string; mediaType: "CTI" | "TOWN" | "HEAVEN"; aliasName: string; normalizedAlias: string };

export function CastReentryForm({ castId, endedOn, stores, aliasSuggestions }: { castId: string; endedOn: string; stores: Array<{ id: string; shortName: string }>; aliasSuggestions: AliasSuggestion[] }) {
  const [state, action, pending] = useActionState(reenterCastAction, initialState);
  const [selectedAliases, setSelectedAliases] = useState<number[]>([]);
  return <details className="mt-2 rounded border border-amber-200 bg-amber-50/40 p-2">
    <summary className="cursor-pointer text-xs font-semibold text-amber-800">再入店</summary>
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="castId" value={castId} />
      <div className="text-xs text-slate-600">前回退店日: {endedOn}</div>
      <label className="form-label">再入店日<input className="form-input mt-1" type="date" name="reentryDate" required /></label>
      <div className="text-xs font-semibold text-slate-600">在籍店舗</div>
      {stores.map((store) => <label key={store.id} className="flex items-center gap-2 text-xs"><input type="checkbox" name="storeId" value={store.id} />{store.shortName}</label>)}
      {aliasSuggestions.length > 0 && <div><div className="text-xs font-semibold text-slate-600">再入店後に使用する媒体Alias</div>{aliasSuggestions.map((alias, index) => <label key={`${alias.storeId}:${alias.mediaType}:${alias.normalizedAlias}`} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedAliases.includes(index)} onChange={(event) => setSelectedAliases((current) => event.target.checked ? [...current, index] : current.filter((value) => value !== index))} />{alias.storeName} / {alias.mediaType} / {alias.aliasName}</label>)}</div>}
      <input type="hidden" name="aliases" value={JSON.stringify(selectedAliases.map((index) => aliasSuggestions[index]))} />
      <label className="flex items-start gap-2 text-xs"><input className="mt-0.5" type="checkbox" name="confirmedSamePerson" required />同一人物の再入店であることを確認しました</label>
      {state.message && <p aria-live="polite" className={state.status === "ERROR" ? "text-xs text-red-700" : "text-xs text-emerald-700"}>{state.message}</p>}
      <button className="secondary-button" type="submit" disabled={pending}>{pending ? "処理中…" : "再入店を確定"}</button>
    </form>
  </details>;
}
