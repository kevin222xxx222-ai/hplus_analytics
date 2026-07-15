import type { SheetHeaderDiagnostics } from "@/lib/imports/cti/types";

const COLUMN_LABELS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

export function CtiHeaderDiagnostics({ diagnostics, headerNotFound }: { diagnostics: SheetHeaderDiagnostics; headerNotFound: boolean }) {
  return <section className="panel mb-6 overflow-hidden border-amber-200">
    <details open={headerNotFound}>
      <summary className="cursor-pointer list-none border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">
        ヘッダー診断：{diagnostics.sheetName}
        <span className="ml-3 text-xs font-normal text-slate-500">A〜Z / 先頭{diagnostics.scannedRowCount}行</span>
      </summary>
      <div className="space-y-5 p-5">
        {headerNotFound && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">HEADER_NOT_FOUNDのため、先頭30行を強調表示しています。判定条件は変更していません。</p>}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">ヘッダー候補と一致状況</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {diagnostics.candidates.map((candidate) => <div key={candidate.rowNumber} className={`rounded-xl border p-4 text-sm ${candidate.selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">行{candidate.rowNumber}</p><div className="flex gap-2"><span className="status-badge bg-sky-50 text-sky-700">一致列数：{candidate.matchCount}</span>{candidate.eligible && <span className="status-badge bg-emerald-50 text-emerald-700">現行条件を満たす</span>}</div></div>
              <p className="mt-3 text-xs font-semibold text-slate-500">一致</p><p className="mt-1 text-slate-700">{candidate.matchedColumns.join(" / ") || "なし"}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">不足（必須列）</p><p className="mt-1 text-slate-700">{candidate.missingRequiredColumns.join(" / ") || "なし"}</p>
              {candidate.castNameInferred && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">A1は空欄ですが、データ内容からキャスト名列として認識しました</p>}
              {!candidate.hasCastName && <p className="mt-3 text-xs text-red-600">女子名列が一致していません。</p>}
            </div>)}
            {diagnostics.candidates.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">既知列と一致する行はありません。</p>}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">A〜Z セル値（先頭50行）</h3>
          <p className="mt-1 text-xs text-slate-500">HEADER_NOT_FOUND時は行1〜30を赤背景で表示します。横スクロールできます。</p>
          <div className="table-wrap mt-3 max-h-[720px] overflow-auto"><table className="min-w-[2600px]"><thead className="sticky top-0 z-10"><tr><th className="sticky left-0 z-20 bg-slate-100">行</th>{COLUMN_LABELS.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{diagnostics.rows.map((row) => <tr key={row.rowNumber} className={headerNotFound && row.rowNumber <= 30 ? "bg-red-50/60" : undefined}><td className="sticky left-0 bg-white font-semibold">{row.rowNumber}</td>{row.values.map((value, index) => <td key={`${row.rowNumber}-${index}`} className="max-w-[280px] whitespace-pre-wrap break-words align-top text-xs">{value || <span className="text-slate-300">—</span>}</td>)}</tr>)}</tbody></table></div>
        </div>
      </div>
    </details>
  </section>;
}
