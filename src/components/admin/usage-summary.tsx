import { requireAdminSession } from "@/lib/auth";
import { getUsageTotals } from "@/services/llm/usage-repository";
import { formatCount, formatUsd } from "@/utils/format";

export async function UsageSummary() {
  await requireAdminSession();
  const totals = await getUsageTotals();

  return (
    <p className="text-xs text-zinc-500" title="All LLM requests recorded in llm_usage">
      {formatCount(totals.requests)} LLM requests · {formatCount(totals.inputTokens + totals.outputTokens)} tokens ·{" "}
      {formatUsd(totals.costUsd)}
      {totals.requestsWithoutCost > 0 && ` (+${totals.requestsWithoutCost} without reported cost)`}
    </p>
  );
}
