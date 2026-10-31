import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordEditor } from "@/components/admin/record-editor";
import { requireAdminSession } from "@/lib/auth";
import { findEditableRow, listProjectOptions } from "@/services/data-admin/data-admin-repository";
import { findTableSpec } from "@/services/data-admin/table-specs";
import { formatDateTime } from "@/utils/format";

// recordId null renders the create form.
export async function RecordEditPanel({ tableName, recordId }: { tableName: string; recordId: number | null }) {
  await requireAdminSession();
  const spec = findTableSpec(tableName);
  if (!spec?.editFields) notFound();
  if (recordId === null && !spec.canCreate) notFound();

  const [row, projectOptions] = await Promise.all([
    recordId === null ? undefined : findEditableRow(tableName, recordId),
    spec.editFields.some((field) => field.kind === "projectRef") ? listProjectOptions() : [],
  ]);
  if (recordId !== null && !row) notFound();

  const updatedAt = row?.updatedAt instanceof Date ? row.updatedAt : null;
  const tracksManualEdits = row !== undefined && "manuallyEditedAt" in row;
  const editedAt = row?.manuallyEditedAt instanceof Date ? row.manuallyEditedAt : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/admin/data/${spec.name}`} className="text-xs text-zinc-500 hover:underline">← {spec.label}</Link>
        <h1 className="text-lg font-semibold">{recordId === null ? `New ${spec.label.toLowerCase()} row` : `${spec.label} #${recordId}`}</h1>
        {row && (
          <p className="text-xs text-zinc-500">
            {updatedAt && <>Updated {formatDateTime(updatedAt)} </>}
            {tracksManualEdits && (editedAt ? <>· Hand-edited {formatDateTime(editedAt)} </> : "· Not edited by hand yet ")}
            {typeof row.sourceId === "number" && (
              <>From <Link href={`/admin/sources/${row.sourceId}`} className="hover:underline">source #{row.sourceId}</Link></>
            )}
          </p>
        )}
        {spec.editNote && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{spec.editNote}</p>}
      </div>
      <RecordEditor
        tableName={spec.name}
        recordId={recordId}
        fields={spec.editFields}
        initialValues={row ?? {}}
        expectedUpdatedAt={updatedAt ? Math.floor(updatedAt.getTime() / 1000) : null}
        projectOptions={projectOptions}
        canDelete={spec.canDelete}
      />
    </div>
  );
}
