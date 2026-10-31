import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SourceDetail } from "@/components/admin/source-detail";
import { parseId } from "@/lib/http";

type Params = PageProps<"/admin/sources/[id]">["params"];

async function SourceDetailForParams({ params }: { params: Params }) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  return <SourceDetail id={id} />;
}

export default function SourcePage({ params }: PageProps<"/admin/sources/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading source…</p>}>
      <SourceDetailForParams params={params} />
    </Suspense>
  );
}
