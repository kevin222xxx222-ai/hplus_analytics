import type { ReactNode } from "react";

export type AnalyticsTableColumn = { key: string; label: string; align?: "left" | "right" | "center" };
export function AnalyticsTable({ caption, columns, rows, rowKey, renderCell, emptyMessage = "表示できるデータがありません。" }: { caption: string; columns: AnalyticsTableColumn[]; rows: readonly unknown[]; rowKey?: (row: unknown, index: number) => string; renderCell: (row: unknown, column: AnalyticsTableColumn, index: number) => ReactNode; emptyMessage?: string }) {
  return <div className="table-wrap"><table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map((column) => <th key={column.key} scope="col" style={{ textAlign: column.align }} aria-sort="none">{column.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={rowKey?.(row, index) ?? String(index)}>{columns.map((column) => <td key={column.key} style={{ textAlign: column.align }}>{renderCell(row, column, index)}</td>)}</tr>) : <tr><td colSpan={columns.length}><span role="status">{emptyMessage}</span></td></tr>}</tbody></table></div>;
}
