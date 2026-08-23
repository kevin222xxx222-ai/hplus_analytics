"use client";

import { useActionState } from "react";
import { exitCastAction } from "@/app/actions/memberships";

type State = { status?: string; message?: string; aliasCount?: number; listingCount?: number };

export function CastExitForm({ castId }: { castId: string }) {
  const [state, action, pending] = useActionState<State, FormData>((_previous, formData) => exitCastAction(formData) as Promise<State>, {});
  const conflict = state.status === "CONFLICT";
  return <div className="space-y-2"><form action={action} className="space-y-2"><input type="hidden" name="castId" value={castId} /><input type="hidden" name="confirmation" value="EXIT_CAST" /><input type="hidden" name="repairLegacy" value={conflict ? "true" : "false"} /><label className="text-xs text-slate-500">Cast全体の退店日</label><div className="flex items-center gap-2"><input type="date" name="leftAt" className="compact-input" required /><button className="icon-button" disabled={pending} title={conflict ? "媒体履歴を無効化して退店" : "退店を確認"}>退店</button></div>{conflict && <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"><p>{state.message}</p><p className="mt-1">明示確認すると、future-start媒体は無効化し、通常期間の媒体は退店日でcloseします。</p><button className="mt-2 rounded bg-amber-700 px-2 py-1 text-white" disabled={pending}>媒体履歴を無効化して退店</button></div>}</form></div>;
}
