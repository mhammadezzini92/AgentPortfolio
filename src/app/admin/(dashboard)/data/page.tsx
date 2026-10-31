import { Suspense } from "react";
import { DataTablesOverview } from "@/components/admin/data-tables-overview";

export default function DataPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Data</h1>
        <p className="text-sm text-zinc-500">Every table in the database. Knowledge tables are editable; pipeline and audit tables are read-only.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading tables…</p>}>
        <DataTablesOverview />
      </Suspense>
    </div>
  );
}
