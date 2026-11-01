"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callAdminApi } from "@/components/admin/admin-api";

type Props = { tableName: string; rowId: number; label: string; confirmText: string };

export function DeleteRowButton({ tableName, rowId, label, confirmText }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const failure = await callAdminApi(`/api/admin/data/${tableName}/${rowId}`, { method: "DELETE" });
    setBusy(false);
    if (failure) setError(failure);
    else router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {label}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
