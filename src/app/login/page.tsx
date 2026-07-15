import { BarChart3, Database, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="grid min-h-screen bg-[#f4f6f8] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-[#112722] px-14 py-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3 text-sm font-semibold tracking-[0.16em] text-emerald-200">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-400 text-[#112722]"><BarChart3 className="size-5" /></span>
          HPLUS ANALYTICS
        </div>
        <div className="relative my-auto max-w-xl">
          <p className="mb-4 text-sm font-semibold tracking-[0.2em] text-emerald-300">OPERATIONS INTELLIGENCE</p>
          <h1 className="text-5xl font-semibold leading-[1.15] tracking-tight">店舗の現在地を、<br />ひとつの画面で。</h1>
          <p className="mt-6 max-w-md text-base leading-8 text-slate-300">CTI・媒体データを統合し、店舗とキャストの改善判断につなげる専用分析基盤です。</p>
        </div>
        <div className="relative grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><ShieldCheck className="mb-3 size-5 text-emerald-300" /><p className="text-sm font-medium">独立した認証・権限管理</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><Database className="mb-3 size-5 text-emerald-300" /><p className="text-sm font-medium">分析専用データベース</p></div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><p className="text-sm font-bold tracking-[0.18em] text-emerald-700">HPLUS ANALYTICS</p></div>
          <p className="text-sm font-semibold text-emerald-700">管理画面</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">おかえりなさい</h2>
          <p className="mb-8 mt-3 text-sm leading-6 text-slate-500">アカウント情報を入力してログインしてください。</p>
          <LoginForm />
          <p className="mt-8 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-400">初期管理者は環境変数を設定後、シードを実行して作成します。</p>
        </div>
      </section>
    </main>
  );
}
