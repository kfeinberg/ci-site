"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";

// Skeleton create-workspace flow. On submit it routes to the demo workspace.
// TODO: persist the workspace and kick off the initial CT.gov ingestion.
export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [indication, setIndication] = useState("");
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Demo: jump to the seeded ovarian workspace.
    router.push("/workspaces/ws_ovarian");
  }

  return (
    <>
      <PageHeader
        title="New workspace"
        subtitle="Scope an engagement to one indication. We'll ingest matching CT.gov trials and build a baseline landscape."
      />

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-5 rounded-lg border border-slate-200 bg-white p-6"
      >
        <Field label="Workspace name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ovarian Cancer Landscape"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <Field label="Indication">
          <input
            value={indication}
            onChange={(e) => setIndication(e.target.value)}
            placeholder="Ovarian cancer"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <Field label="CT.gov search query" hint="Drives which trials get ingested.">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ovarian cancer"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create & ingest
          </button>
          <span className="text-xs text-slate-400">
            (Skeleton — opens the demo workspace)
          </span>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </label>
  );
}
