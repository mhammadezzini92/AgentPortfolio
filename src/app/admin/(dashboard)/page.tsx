import { Suspense } from "react";
import { SourcesTable } from "@/components/admin/sources-table";
import { UploadForm } from "@/components/admin/upload-form";
import { UrlImportForm } from "@/components/admin/url-import-form";
import { MAX_UPLOAD_MB } from "@/utils/validation";

const card = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}><UploadForm maxMb={MAX_UPLOAD_MB} /></section>
        <section className={card}><UrlImportForm /></section>
      </div>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Sources</h1>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading sources…</p>}>
          <SourcesTable />
        </Suspense>
      </section>
    </div>
  );
}
