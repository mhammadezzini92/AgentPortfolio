"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callAdminApi, postJson } from "@/components/admin/admin-api";
import type { ProcessingStatus } from "@/models/schemas";

type Props = {
  sourceId: number;
  status: ProcessingStatus;
  // Where to go after a delete; the list page stays put, the detail page navigates back.
  afterDeleteHref?: string;
};

const buttonClass =
  "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function SourceActions({ sourceId, status, afterDeleteHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || status === "processing";

  async function run(action: () => Promise<string | null>, onSuccess: () => void) {
    setBusy(true);
    setError(null);
    const failure = await action();
    setBusy(false);
    if (failure) setError(failure);
    else onSuccess();
  }

  const reprocess = (force: boolean) =>
    run(() => postJson(`/api/admin/sources/${sourceId}/reprocess`, { force }), () => router.refresh());

  function remove() {
    if (!window.confirm("Delete this source, its chunks, and any facts no other source supports?")) return;
    run(
      () => callAdminApi(`/api/admin/sources/${sourceId}`, { method: "DELETE" }),
      () => (afterDeleteHref ? router.push(afterDeleteHref) : router.refresh()),
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button className={buttonClass} disabled={disabled} onClick={() => reprocess(false)} title="Refetch; skips extraction if unchanged">
          {status === "failed" ? "Retry" : "Reprocess"}
        </button>
        <button className={buttonClass} disabled={disabled} onClick={() => reprocess(true)} title="Re-run extraction even if unchanged">
          Force
        </button>
        <button className={`${buttonClass} text-red-600 dark:text-red-400`} disabled={disabled} onClick={remove}>
          Delete
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
