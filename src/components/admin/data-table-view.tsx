import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { type TableRow, listTableRows } from "@/services/data-admin/data-admin-repository";
import { type ListColumn, findTableSpec } from "@/services/data-admin/table-specs";
import { formatCount, formatDateTime } from "@/utils/format";

const PAGE_SIZE = 50;
const MAX_CELL_CHARS = 140;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return formatDateTime(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
}

function Cell({ column, row }: { column: ListColumn; row: TableRow }) {
  const value = row[column.key];
  if (column.key === "sourceId" && typeof value === "number") {
    return <Link href={`/admin/sources/${value}`} className="hover:underline">#{value}</Link>;
  }
  return <>{formatCell(value)}</>;
}

type Props = { tableName: string; page: number; filter: string };

export async function DataTableView({ tableName, page, filter }: Props) {
  await requireAdminSession();
  const spec = findTableSpec(tableName);
  if (!spec) notFound();

  const { rows, total } = await listTableRows(spec, page, PAGE_SIZE, filter);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => `/admin/data/${spec.name}?${new URLSearchParams({ page: String(target), q: filter })}`;
  // The profile is a single row: offer "create" only while it doesn't exist.
  const showCreate = spec.canCreate && (spec.name !== "profile" || total === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/admin/data" className="text-xs text-zinc-500 hover:underline">← All tables</Link>
          <h1 className="text-lg font-semibold">{spec.label}</h1>
          <p className="text-sm text-zinc-500">
            {spec.description} {spec.editFields ? "Click a row to edit." : "Read-only."}
          </p>
        </div>
        {showCreate && (
          <Link href={`/admin/data/${spec.name}/new`} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            New
          </Link>
        )}
      </div>

      <Form action={`/admin/data/${spec.name}`} key={filter} className="flex gap-2">
        <input
          name="q"
          defaultValue={filter}
          placeholder="Filter…"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
        />
        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">Filter</button>
      </Form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>{spec.listColumns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-2">{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row, index) => {
              const editHref = spec.editFields ? `/admin/data/${spec.name}/${row.id}` : null;
              return (
                <tr key={String(row.id ?? row.key ?? index)} className="align-top">
                  {spec.listColumns.map((column, columnIndex) => (
                    <td key={column.key} className="max-w-md px-3 py-2">
                      {editHref && columnIndex === 0 ? (
                        <Link href={editHref} className="font-medium text-blue-600 hover:underline dark:text-blue-400"><Cell column={column} row={row} /></Link>
                      ) : (
                        <Cell column={column} row={row} />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">No rows{filter ? " match the filter" : ""}.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{formatCount(total)} rows · page {page} of {pageCount}</span>
        <div className="flex gap-3">
          {page > 1 && <Link href={pageHref(page - 1)} className="hover:underline">← Previous</Link>}
          {page < pageCount && <Link href={pageHref(page + 1)} className="hover:underline">Next →</Link>}
        </div>
      </div>
    </div>
  );
}
