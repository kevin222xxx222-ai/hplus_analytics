"use client";

import { useState } from "react";
import { quickRegisterMembershipsAction } from "@/app/actions/memberships";

type Store = { id: string; shortName: string };

export function QuickMembershipRegistration({ castId, stores, existingStoreIds }: { castId: string; stores: Store[]; existingStoreIds: string[] }) {
  const available = stores.filter((store) => !existingStoreIds.includes(store.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  if (available.length === 0) return <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">追加候補の店舗はありません。既存Membershipの詳細フォームを確認してください。</p>;
  const toggle = (storeId: string) => setSelected((current) => current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId]);
  return <form action={quickRegisterMembershipsAction} className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4" onSubmit={(event) => { if (!confirmed) { event.preventDefault(); setConfirmed(true); } }}>
    <input type="hidden" name="castId" value={castId} />
    <h4 className="font-semibold">現在所属候補を一括登録</h4>
    <p className="mt-1 text-xs text-slate-600">Fact・Alias・掲載根拠を確認したうえで選択してください。入店日は不明（NULL）で登録し、既存Membershipは自動変更しません。</p>
    <div className="mt-3 flex flex-wrap gap-3">{available.map((store) => <label key={store.id} className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"><input type="checkbox" name="storeId" value={store.id} checked={selected.includes(store.id)} onChange={() => toggle(store.id)} />{store.shortName}<span className="text-xs text-slate-500">在籍</span></label>)}</div>
    {selected.length > 0 && <div className="mt-3 rounded-md bg-white p-3 text-sm"><p className="font-medium">登録予定（確認）</p><ul className="mt-1 list-disc pl-5">{selected.map((id) => <li key={id}>{stores.find((store) => store.id === id)?.shortName} / 在籍 / 入店日 不明</li>)}</ul></div>}
    <button type="submit" disabled={selected.length === 0} className="primary-button mt-3 disabled:cursor-not-allowed disabled:opacity-50">{confirmed ? "確認済み・選択店舗を登録" : "選択内容を確認"}</button>
    {confirmed && <button type="button" className="secondary-button ml-2" onClick={() => setConfirmed(false)}>選択へ戻る</button>}
  </form>;
}
