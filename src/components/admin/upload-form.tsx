"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { callAdminApi } from "@/components/admin/admin-api";

export function UploadForm({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > maxMb * 1024 * 1024) {
      setError(`File is larger than ${maxMb}MB`);
      return;
    }

    setSubmitting(true);
    setError(null);
    const failure = await callAdminApi("/api/ingestion/upload", { method: "POST", body: form });
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
      <h2 className="font-medium">Upload document</h2>
      <input
        name="file"
        type="file"
        required
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:file:bg-zinc-800"
      />
      <div className="flex gap-2">
        <select name="sourceType" defaultValue="cv" className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700">
          <option value="cv">CV</option>
          <option value="portfolio">Portfolio (e.g. a page saved as PDF)</option>
          <option value="upload">Other document (fills gaps only)</option>
        </select>
        <input
          name="title"
          placeholder="Title (optional)"
          maxLength={200}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        />
      </div>
      <p className="text-xs text-zinc-500">PDF or DOCX, up to {maxMb}MB.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Uploading…" : "Upload and process"}
      </button>
    </form>
  );
}
