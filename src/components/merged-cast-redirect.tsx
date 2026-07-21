"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitMerge } from "lucide-react";
import { useRouter } from "next/navigation";

export function MergedCastRedirect({ sourceName, targetId, targetName, mergedAt, queryString }: { sourceName: string; targetId: string; targetName: string; mergedAt: string; queryString: string }) {
  const router = useRouter(); const [seconds, setSeconds] = useState(4);
  const href = `/analytics/casts/${targetId}${queryString}`;
  useEffect(() => {
    const interval = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    const timer = window.setTimeout(() => router.replace(href), 4000);
    return () => { window.clearInterval(interval); window.clearTimeout(timer); };
  }, [href, router]);
  return <section className="panel mx-auto max-w-2xl p-8 text-center"><GitMerge className="mx-auto size-10 text-emerald-700" /><h1 className="mt-4 text-2xl font-bold">「{sourceName}」は統合済みです</h1><p className="mt-3 text-slate-600">統合先「{targetName}」へ誘導します。統合日時: {new Date(mergedAt).toLocaleString("ja-JP")}</p><p className="mt-2 text-sm text-slate-400">{seconds}秒後に移動します。</p><Link href={href} className="primary-button mt-5 inline-flex">今すぐ統合先を表示</Link></section>;
}
