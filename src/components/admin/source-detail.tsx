import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { ProvenanceBadge, StatusBadge } from "@/components/admin/badges";
import { SourceActions } from "@/components/admin/source-actions";
import { requireAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listChunksForSource } from "@/services/knowledge/chunk-repository";
import { listRelationshipsForSource } from "@/services/knowledge/entity-repository";
import { listJobsForSource } from "@/services/knowledge/job-repository";
import { findSourceById } from "@/services/knowledge/source-repository";
import { formatDateTime } from "@/utils/format";

const heading = "text-sm font-semibold uppercase tracking-wide text-zinc-500";

export async function SourceDetail({ id }: { id: number }) {
  await requireAdminSession();
  const source = await findSourceById(id);
  if (!source) notFound();

  const [jobs, chunks, relationships] = await Promise.all([
    listJobsForSource(id),
    listChunksForSource(id),
    listRelationshipsForSource(db, id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/admin" className="text-xs text-zinc-500 hover:underline">← Sources</Link>
          <h1 className="text-lg font-semibold">{source.title ?? source.sourceUrl ?? `Source #${source.id}`}</h1>
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <StatusBadge status={source.status} /> {source.sourceType} · last fetched {formatDateTime(source.lastFetchedAt)}
          </p>
          {source.sourceUrl && (
            <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              {source.sourceUrl}
            </a>
          )}
        </div>
        <SourceActions sourceId={source.id} status={source.status} afterDeleteHref="/admin" />
      </div>
      <AutoRefresh active={source.status === "processing" || source.status === "pending"} />

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Ingestion runs</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <StatusBadge status={job.status} />
                <span className="text-xs text-zinc-500">
                  #{job.id} · started {formatDateTime(job.startedAt)} · finished {formatDateTime(job.completedAt)}
                </span>
              </div>
              {job.errorMessage && (
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-600 dark:text-red-400">{job.errorMessage}</pre>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Extracted entities ({relationships.length})</h2>
        {relationships.length === 0 ? (
          <p className="text-sm text-zinc-500">None. Articles and docs never produce entities; for other sources, nothing was found with verifiable evidence.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {relationships.map((link) => (
              <li key={link.id}>
                <span className="font-medium">{link.entityType} #{link.entityId}</span>
                {link.evidence && <span className="text-zinc-500"> — “{link.evidence}”</span>}
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/knowledge" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View merged knowledge →</Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Chunks ({chunks.length})</h2>
        <ol className="flex flex-col gap-2">
          {chunks.map((chunk) => (
            <li key={chunk.id} className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>#{chunk.chunkIndex}</span>
                <ProvenanceBadge provenance={chunk.provenance} />
                {chunk.heading && <span className="font-medium text-zinc-700 dark:text-zinc-300">{chunk.heading}</span>}
                {chunk.projectId && <span>· project #{chunk.projectId}</span>}
              </div>
              <p className="whitespace-pre-wrap">{chunk.content}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
