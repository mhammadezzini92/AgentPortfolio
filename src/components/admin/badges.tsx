import type { ProcessingStatus, Provenance } from "@/models/schemas";

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  processing: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const PROVENANCE_STYLES: Record<Provenance, string> = {
  personal: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  general: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  unverified: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  return <span className={`${base} ${STATUS_STYLES[status]}`}>{status}</span>;
}

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return <span className={`${base} ${PROVENANCE_STYLES[provenance]}`}>{provenance}</span>;
}
