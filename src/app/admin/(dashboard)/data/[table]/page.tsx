import { Suspense } from "react";
import { DataTableView } from "@/components/admin/data-table-view";

type Props = PageProps<"/admin/data/[table]">;

async function DataTableForRequest({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ table }, { page, q }] = await Promise.all([params, searchParams]);
  const pageNumber = Math.max(1, Number.parseInt(typeof page === "string" ? page : "1", 10) || 1);
  const filter = typeof q === "string" ? q.trim().slice(0, 200) : "";
  return <DataTableView tableName={table} page={pageNumber} filter={filter} />;
}

export default function DataTablePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading rows…</p>}>
      <DataTableForRequest params={params} searchParams={searchParams} />
    </Suspense>
  );
}
