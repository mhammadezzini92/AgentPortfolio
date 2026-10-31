import Link from "next/link";
import { ProvenanceBadge } from "@/components/admin/badges";
import { requireAdminSession } from "@/lib/auth";
import { chatEnv } from "@/lib/env";
import { buildMatchExpression } from "@/services/retrieval/query-builder";
import { searchKnowledge } from "@/services/retrieval/retrieval-service";

// Runs exactly what the chat will run (same limits and budget), so what you see here is the
// context the answer model would receive for this question.
export async function SearchResults({ question }: { question: string }) {
  await requireAdminSession();
  const env = chatEnv();
  const trimmed = question.slice(0, env.CHAT_MAX_INPUT_CHARS);
  const matchExpression = buildMatchExpression(trimmed);
  const chunks = await searchKnowledge(trimmed, { topK: env.RETRIEVAL_TOP_K, maxContextChars: env.RETRIEVAL_MAX_CONTEXT_CHARS });
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <p>MATCH {matchExpression ?? "(no searchable terms — the chat will rely on the profile only)"}</p>
        <p>
          {chunks.length} of max {env.RETRIEVAL_TOP_K} chunks · {totalChars} of {env.RETRIEVAL_MAX_CONTEXT_CHARS} chars
        </p>
      </div>

      {matchExpression && chunks.length === 0 && <p className="text-sm text-zinc-500">No matching chunks.</p>}

      <ol className="flex flex-col gap-3">
        {chunks.map((chunk, rank) => (
          <li key={chunk.chunkId} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">#{rank + 1}</span>
              <span className="font-mono">score {chunk.score.toPrecision(3)}</span>
              <ProvenanceBadge provenance={chunk.provenance} />
              <Link href={`/admin/sources/${chunk.source.id}`} className="font-medium hover:underline">
                {chunk.source.title ?? chunk.source.url ?? `Source #${chunk.source.id}`}
              </Link>
              <span>({chunk.source.type})</span>
              {chunk.project && <span>· project {chunk.project.name}</span>}
            </div>
            {chunk.headingPath.length > 0 && <p className="mb-1 text-xs text-zinc-500">{chunk.headingPath.join(" › ")}</p>}
            <p className="whitespace-pre-wrap">{chunk.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
