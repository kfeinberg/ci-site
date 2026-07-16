"use client";

import { useMemo, useState } from "react";
import { PHASE_RANK, type Trial } from "@/lib/types";
import TrialTable from "./TrialTable";

// Client wrapper around TrialTable: search + phase/status filters, a toggle to
// hide dropped trials, and a "showing X of Y" count. Dropped trials sort last.
export default function TrialsView({ trials }: { trials: Trial[] }) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("all");
  const [hideDropped, setHideDropped] = useState(false);

  const droppedCount = useMemo(
    () => trials.filter((t) => t.droppedAt).length,
    [trials]
  );

  // Distinct phases (ranked, highest first) and statuses (alphabetical) for the dropdowns.
  const phases = useMemo(
    () =>
      Array.from(new Set(trials.map((t) => t.phase))).sort(
        (a, b) => (PHASE_RANK[b] ?? -1) - (PHASE_RANK[a] ?? -1)
      ),
    [trials]
  );
  const statuses = useMemo(
    () => Array.from(new Set(trials.map((t) => t.status))).sort(),
    [trials]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trials
      .filter((t) => {
        if (hideDropped && t.droppedAt) return false;
        if (phase !== "all" && t.phase !== phase) return false;
        if (status !== "all" && t.status !== status) return false;
        if (q) {
          const hay = `${t.nctId} ${t.sponsor} ${t.intervention} ${t.mechanism} ${t.title}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      // Active first, dropped last; preserve incoming order (enrollment desc) within each group.
      .sort((a, b) => Number(Boolean(a.droppedAt)) - Number(Boolean(b.droppedAt)));
  }, [trials, query, phase, status, hideDropped]);

  const selectClass =
    "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search NCT, sponsor, intervention…"
          className="min-w-[16rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
        />

        <select value={phase} onChange={(e) => setPhase(e.target.value)} className={selectClass}>
          <option value="all">All phases</option>
          {phases.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {droppedCount > 0 ? (
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideDropped}
              onChange={(e) => setHideDropped(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Hide dropped
          </label>
        ) : null}
      </div>

      <p className="mb-3 text-sm text-slate-500">
        Showing {visible.length} of {trials.length} trials
        {droppedCount > 0 ? (
          <span className="text-slate-400"> · {droppedCount} dropped</span>
        ) : null}
      </p>

      <TrialTable trials={visible} />
    </>
  );
}
