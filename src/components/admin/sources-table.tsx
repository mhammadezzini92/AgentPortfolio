import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { StatusBadge } from "@/components/admin/badges";
import { SourceActions } from "@/components/admin/source-actions";
import { requireAdminSession } from "@/lib/auth";
import { listSourcesWithLatestJob } from "@/services/knowledge/source-repository";
import { formatDateTime } from "@/utils/format";

export async function SourcesTable() {
  await requireAdminSession();
  const rows = await listSourcesWithLatestJob();
  const active = rows.some(({ source }) => source.status === "processing" || source.status === "pending");

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No sources yet. Upload your CV or import a URL to start.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <AutoRefresh active={active} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Chunks</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map(({ source, chunkCount, latestJob }) => (
              <tr key={source.id} className="align-top">
                <td className="max-w-xs px-3 py-2">
                  <Link href={`/admin/sources/${source.id}`} className="font-medium hover:underline">
                    {source.title ?? source.sourceUrl ?? `Source #${source.id}`}
                  </Link>
                  {source.sourceUrl && <p className="truncate text-xs text-zinc-500">{source.sourceUrl}</p>}
                  {latestJob?.status === "failed" && latestJob.errorMessage && (
                    <p className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-400" title={latestJob.errorMessage}>
                      {latestJob.errorMessage}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">{source.sourceType}</td>
                <td className="px-3 py-2"><StatusBadge status={source.status} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{chunkCount}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">{formatDateTime(latestJob?.startedAt)}</td>
                <td className="px-3 py-2"><SourceActions sourceId={source.id} status={source.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
