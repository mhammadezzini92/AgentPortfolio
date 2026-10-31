import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecordEditPanel } from "@/components/admin/record-edit-panel";
import { parseId } from "@/lib/http";

type Params = PageProps<"/admin/data/[table]/[id]">["params"];

async function RecordEditForParams({ params }: { params: Params }) {
  const { table, id } = await params;
  if (id === "new") return <RecordEditPanel tableName={table} recordId={null} />;

  const recordId = parseId(id);
  if (recordId === null) notFound();
  return <RecordEditPanel tableName={table} recordId={recordId} />;
}

export default function RecordEditPage({ params }: PageProps<"/admin/data/[table]/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading row…</p>}>
      <RecordEditForParams params={params} />
    </Suspense>
  );
}
