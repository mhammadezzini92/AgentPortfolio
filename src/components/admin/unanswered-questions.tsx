import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { listUnansweredQuestions } from "@/services/chat/chat-question-repository";
import { formatDateTime } from "@/utils/format";

const LIMIT = 20;

export async function UnansweredQuestions() {
  await requireAdminSession();
  const questions = await listUnansweredQuestions(LIMIT);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Likely unanswered (last 30 days)</h2>
      <p className="text-xs text-zinc-500">
        Questions where nothing matched in the knowledge base, or the answer failed. Add sources or edit facts to cover them.{" "}
        <Link href="/admin/data/chat_questions" className="hover:underline">All questions →</Link>
      </p>
      {questions.length === 0 ? (
        <p className="text-sm text-zinc-500">None so far.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {questions.map((question) => (
            <li key={question.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <span>{question.question}</span>
              <span className="text-xs text-zinc-500">
                {question.outcome} · {formatDateTime(question.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
