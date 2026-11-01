"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ChatTurn, streamChat } from "@/components/chat/chat-stream";
import type { SourceReference } from "@/services/llm/answer-prompt";

type Exchange = {
  question: string;
  answer: string;
  sources: SourceReference[];
  error: string | null;
  latencyMs: number | null;
};

const inputClass = "min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function SourceList({ sources }: { sources: SourceReference[] }) {
  if (sources.length === 0) return <p className="text-xs text-zinc-500">No sources retrieved.</p>;
  return (
    <ul className="flex flex-wrap gap-2 text-xs text-zinc-500">
      {sources.map((source) => (
        <li key={source.id} className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
          [{source.id}] {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">{source.title ?? source.url}</a> : source.title ?? "Untitled"} ({source.type})
        </li>
      ))}
    </ul>
  );
}

// Calls the real public endpoint, so answers, limits and logging match what visitors get.
export function ChatPreview() {
  const router = useRouter();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  function updateLast(change: (exchange: Exchange) => Exchange) {
    setExchanges((current) => [...current.slice(0, -1), change(current[current.length - 1])]);
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;

    const history: ChatTurn[] = exchanges
      .filter((exchange) => !exchange.error)
      .flatMap((exchange) => [
        { role: "user" as const, content: exchange.question },
        { role: "assistant" as const, content: exchange.answer },
      ]);
    setExchanges((current) => [...current, { question: text, answer: "", sources: [], error: null, latencyMs: null }]);
    setQuestion("");
    setBusy(true);

    const startedAt = performance.now();
    for await (const chatEvent of streamChat([...history, { role: "user", content: text }])) {
      if (chatEvent.type === "sources") updateLast((exchange) => ({ ...exchange, sources: chatEvent.sources }));
      if (chatEvent.type === "delta") updateLast((exchange) => ({ ...exchange, answer: exchange.answer + chatEvent.text }));
      if (chatEvent.type === "error") updateLast((exchange) => ({ ...exchange, error: chatEvent.message }));
    }
    updateLast((exchange) => ({ ...exchange, latencyMs: Math.round(performance.now() - startedAt) }));
    setBusy(false);
    // Refreshes the usage total in the header and the unanswered list below.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {exchanges.map((exchange, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-medium">{exchange.question}</p>
            {exchange.answer && <p className="whitespace-pre-wrap">{exchange.answer}</p>}
            {exchange.error && <p className="text-red-600 dark:text-red-400">{exchange.error}</p>}
            {!exchange.answer && !exchange.error && <p className="animate-pulse text-zinc-500">Thinking…</p>}
            <SourceList sources={exchange.sources} />
            {exchange.latencyMs !== null && <p className="text-xs text-zinc-400">{exchange.latencyMs} ms</p>}
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask what a visitor might ask…" className={inputClass} autoFocus />
        <button type="submit" disabled={busy} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {busy ? "Answering…" : "Ask"}
        </button>
        {exchanges.length > 0 && (
          <button type="button" disabled={busy} onClick={() => setExchanges([])} className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            New chat
          </button>
        )}
      </form>
    </div>
  );
}
