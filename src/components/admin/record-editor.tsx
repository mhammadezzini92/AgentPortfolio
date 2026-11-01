"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callAdminApi } from "@/components/admin/admin-api";
import type { FieldKind, FieldSpec } from "@/services/data-admin/table-specs";

type Props = {
  tableName: string;
  recordId: number | null;
  fields: FieldSpec[];
  initialValues: Record<string, unknown>;
  expectedUpdatedAt: number | null;
  projectOptions: { id: number; name: string }[];
  canDelete: boolean;
};

const inputClass = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const buttonClass = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";

function toDraft(kind: FieldKind, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (kind === "list") return (value as string[]).join("\n");
  if (kind === "json") return JSON.stringify(value, null, 2);
  return String(value);
}

// Throws with a user-facing message; the server validates the result again with Zod.
function fromDraft(field: FieldSpec, draft: string): unknown {
  const trimmed = draft.trim();
  switch (field.kind) {
    case "list":
      return trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
    case "json":
      try {
        return JSON.parse(trimmed || "null");
      } catch {
        throw new Error(`${field.label}: invalid JSON`);
      }
    case "projectRef":
      return trimmed ? Number(trimmed) : null;
    default:
      return trimmed || null;
  }
}

function FieldInput({ field, value, onChange, projectOptions }: {
  field: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  projectOptions: Props["projectOptions"];
}) {
  switch (field.kind) {
    case "longtext":
    case "list":
      return <textarea rows={field.kind === "list" ? 5 : 6} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case "json":
      return <textarea rows={6} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} font-mono text-xs`} spellCheck={false} />;
    case "enum":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    case "projectRef":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">— none —</option>
          {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      );
    case "partialDate":
      return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="YYYY or YYYY-MM" className={inputClass} />;
    default:
      return <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
  }
}

export function RecordEditor({ tableName, recordId, fields, initialValues, expectedUpdatedAt, projectOptions, canDelete }: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.key, toDraft(field.kind, initialValues[field.key] ?? field.defaultValue)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const listHref = `/admin/data/${tableName}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    let values: Record<string, unknown>;
    try {
      values = Object.fromEntries(fields.map((field) => [field.key, fromDraft(field, drafts[field.key])]));
    } catch (parseError) {
      setError((parseError as Error).message);
      return;
    }

    setBusy(true);
    setError(null);
    const isNew = recordId === null;
    const failure = await callAdminApi(isNew ? `/api/admin/data/${tableName}` : `/api/admin/data/${tableName}/${recordId}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isNew ? { values } : { values, expectedUpdatedAt }),
    });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (isNew) {
      router.push(listHref);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this row? Reprocessing won't re-create it (undo under Data → Suppressed). Its source links go too; chunks keep their text.")) return;
    setBusy(true);
    const failure = await callAdminApi(`/api/admin/data/${tableName}/${recordId}`, { method: "DELETE" });
    setBusy(false);
    if (failure) setError(failure);
    else router.push(listHref);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{field.label}</span>
          <FieldInput
            field={field}
            value={drafts[field.key]}
            onChange={(value) => setDrafts((current) => ({ ...current, [field.key]: value }))}
            projectOptions={projectOptions}
          />
          {field.kind === "list" && <span className="text-xs text-zinc-500">One per line.</span>}
          {field.hint && <span className="font-mono text-xs text-zinc-500">{field.hint}</span>}
        </label>
      ))}
      {error && <p className="whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${buttonClass} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>
          {busy ? "Saving…" : recordId === null ? "Create" : "Save"}
        </button>
        {canDelete && recordId !== null && (
          <button type="button" disabled={busy} onClick={remove} className={`${buttonClass} border border-zinc-300 text-red-600 dark:border-zinc-700 dark:text-red-400`}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
