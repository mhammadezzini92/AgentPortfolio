"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { postJson } from "@/components/admin/admin-api";

export function UrlImportForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setSubmitting(true);
    setError(null);
    const failure = await postJson("/api/ingestion/url", {
      url: form.get("url"),
      sourceType: form.get("sourceType"),
      title: form.get("title") || null,
    });
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-medium">Import URL</h2>
      <input
        name="url"
        type="url"
        required
        placeholder="https://…"
        className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <select name="sourceType" defaultValue="portfolio" className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700">
          <option value="portfolio">Portfolio</option>
          <option value="github">GitHub repo</option>
          <option value="article">Article</option>
          <option value="documentation">Documentation</option>
        </select>
        <input
          name="title"
          placeholder="Title (optional)"
          maxLength={200}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        />
      </div>
      <p className="text-xs text-zinc-500">Articles and docs are stored as general knowledge, never as your personal experience.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Importing…" : "Import and process"}
      </button>
    </form>
  );
}
