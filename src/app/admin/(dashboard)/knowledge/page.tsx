import { Suspense } from "react";
import { KnowledgeOverview } from "@/components/admin/knowledge-overview";

export default function KnowledgePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Knowledge</h1>
        <p className="text-sm text-zinc-500">Merged facts the agent will treat as your verified experience, with the sources behind each.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading knowledge…</p>}>
        <KnowledgeOverview />
      </Suspense>
    </div>
  );
}
