import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { countTableRows } from "@/services/data-admin/data-admin-repository";
import { listTableSpecs } from "@/services/data-admin/table-specs";
import { formatCount } from "@/utils/format";

export async function DataTablesOverview() {
  await requireAdminSession();
  const specs = listTableSpecs();
  const counts = await Promise.all(specs.map(countTableRows));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {specs.map((spec, index) => (
        <Link
          key={spec.name}
          href={`/admin/data/${spec.name}`}
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 text-sm hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{spec.label}</span>
            <span className="tabular-nums text-zinc-500">{formatCount(counts[index])} rows</span>
          </div>
          <p className="text-xs text-zinc-500">{spec.description}</p>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            {spec.name} · {spec.editFields ? "editable" : "read-only"}
          </p>
        </Link>
      ))}
    </div>
  );
}
