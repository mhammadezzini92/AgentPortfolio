import Form from "next/form";
import { Suspense } from "react";
import { SearchResults } from "@/components/admin/search-results";

type SearchParams = PageProps<"/admin/search">["searchParams"];

async function SearchPanel({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const question = typeof q === "string" ? q.trim() : "";

  return (
    <div className="flex flex-col gap-6">
      {/* key resets the uncontrolled input when navigating between searches */}
      <Form action="/admin/search" key={question} className="flex gap-2">
        <input
          name="q"
          defaultValue={question}
          placeholder="Ask what a visitor might ask, e.g. Has he worked with Kafka?"
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Search
        </button>
      </Form>
      {question && (
        <Suspense fallback={<p className="text-sm text-zinc-500">Searching…</p>}>
          <SearchResults question={question} />
        </Suspense>
      )}
    </div>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/admin/search">) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Retrieval search</h1>
        <p className="text-sm text-zinc-500">The chunks the chat agent would retrieve for a question, in ranked order.</p>
      </div>
      <Suspense fallback={null}>
        <SearchPanel searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
