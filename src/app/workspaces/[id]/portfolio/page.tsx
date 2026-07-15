"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Chip } from "@/components/Badge";
import { assetsForWorkspace } from "@/lib/mockData";
import type { PortfolioAsset, TrialPhase } from "@/lib/types";

const PHASES: TrialPhase[] = [
  "Preclinical",
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
];

// Client's private asset input. This is the per-client "secret sauce" that
// drives competitive-overlap flagging. Skeleton: state is in-session only.
// TODO: persist per client with access control (confidential).
export default function ClientPortfolioPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [assets, setAssets] = useState<PortfolioAsset[]>(() =>
    assetsForWorkspace(workspaceId)
  );
  const [name, setName] = useState("");
  const [mechanism, setMechanism] = useState("");
  const [phase, setPhase] = useState<TrialPhase>("Phase 1");
  const [notes, setNotes] = useState("");

  function addAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !mechanism.trim()) return;
    setAssets((prev) => [
      ...prev,
      {
        id: `pa_${prev.length + 1}_${name.slice(0, 4)}`,
        workspaceId,
        name: name.trim(),
        mechanism: mechanism.trim(),
        phase,
        notes: notes.trim() || undefined,
      },
    ]);
    setName("");
    setMechanism("");
    setPhase("Phase 1");
    setNotes("");
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <>
      <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-800">
        🔒 Private to this client. Assets entered here are matched against tracked
        trials to flag competitive overlaps.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Existing assets */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Tracked assets ({assets.length})
          </h2>
          <div className="space-y-3">
            {assets.length ? (
              assets.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {a.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Chip>{a.mechanism}</Chip>
                        <Chip>{a.phase}</Chip>
                      </div>
                      {a.notes ? (
                        <p className="mt-2 text-xs text-slate-500">{a.notes}</p>
                      ) : null}
                    </div>
                    <button
                      onClick={() => removeAsset(a.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No assets yet.</p>
            )}
          </div>
        </div>

        {/* Add asset form */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Add asset
          </h2>
          <form
            onSubmit={addAsset}
            className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
          >
            <Field label="Asset name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ONX-201 (internal)"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </Field>
            <Field label="Mechanism" hint="Used for overlap matching.">
              <input
                value={mechanism}
                onChange={(e) => setMechanism(e.target.value)}
                placeholder="Anti-FRα ADC"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </Field>
            <Field label="Phase">
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as TrialPhase)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes (optional)">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lead asset; platinum-resistant ovarian."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </Field>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Add asset
            </button>
          </form>
        </div>
      </div>
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
