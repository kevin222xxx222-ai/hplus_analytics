"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="identifier" className="form-label">ログインID / メールアドレス</label>
        <input id="identifier" name="identifier" autoComplete="username" required className="form-input" placeholder="admin" />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="form-label">パスワード</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="form-input" placeholder="••••••••••••" />
      </div>
      {state.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
        {pending ? "確認中…" : "ログイン"}
        {!pending && <ArrowRight className="ml-auto size-4" />}
      </Button>
    </form>
  );
}
