"use client";

import { useMemo, useState } from "react";
import type { TceTrial } from "@/lib/tce";

const PHASE_LABEL: Record<string, string> = {
  RECRUITING: "Recruiting",
};

function statusLabel(s: string | null): string {
  if (!s) return "—";
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Flag({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Yes
    </span>
  ) : (
    <span className="text-xs text-slate-300">—</span>
  );
}

export default function TceTable({
  trials,
  stats,
}: {
  trials: TceTrial[];
  stats: { total: number; tceCount: number; muc16Count: number; generatedAt: string };
}) {
  const [tceOnly, setTceOnly] = useState(true);
  const [ovarianOnly, setOvarianOnly] = useState(false);
  const [usOnly, setUsOnly] = useState(false);
  const [muc16Only, setMuc16Only] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return trials.filter((t) => {
      if (tceOnly && !t.isTce) return false;
      if (ovarianOnly && !t.enrollsOvarian) return false;
      if (usOnly && !t.hasUsSites) return false;
      if (muc16Only && t.tumorTarget !== "MUC16") return false;
      if (needle) {
        const hay = [
          t.drug,
          t.targetPair,
          t.tumorTarget,
          t.sponsor,
          t.title,
          t.nctId,
          t.conditions.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [trials, tceOnly, ovarianOnly, usOnly, muc16Only, q]);

  return (
    <div>
      {/* Stat row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In modality net" value={stats.total} />
        <Stat label="T-cell engagers" value={stats.tceCount} accent />
        <Stat label="CD3×MUC16 trials" value={stats.muc16Count} accent />
        <Stat label="Showing" value={filtered.length} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search drug, target, sponsor, NCT…"
          className="w-64 rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
        />
        <Toggle label="Confirmed TCEs only" on={tceOnly} set={setTceOnly} />
        <Toggle label="MUC16 only" on={muc16Only} set={setMuc16Only} />
        <Toggle label="Enrolls ovarian" on={ovarianOnly} set={setOvarianOnly} />
        <Toggle label="Has US sites" on={usOnly} set={setUsOnly} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Drug</th>
              <th className="px-3 py-2 font-medium">Target pair</th>
              <th className="px-3 py-2 font-medium">Indication(s)</th>
              <th className="px-3 py-2 font-medium">Phase</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sponsor</th>
              <th className="px-3 py-2 text-center font-medium">Ovarian</th>
              <th className="px-3 py-2 text-center font-medium">US sites</th>
              <th className="px-3 py-2 font-medium">NCT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const isMuc16 = t.tumorTarget === "MUC16";
              return (
                <tr
                  key={t.nctId}
                  className={`border-b border-slate-100 align-top ${
                    isMuc16 ? "bg-amber-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{t.drug ?? "—"}</div>
                    {!t.isTce ? (
                      <span className="text-xs text-slate-400">
                        {t.modality ?? "not a TCE"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.targetPair ? (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          isMuc16
                            ? "bg-amber-200 text-amber-900"
                            : "bg-brand-50 text-brand-700"
                        }`}
                        title={
                          t.classificationSource === "regex"
                            ? "Extracted from trial summary text"
                            : t.confidence
                            ? `LLM confidence: ${t.confidence}`
                            : undefined
                        }
                      >
                        {t.targetPair}
                        {t.confidence === "low" || t.classificationSource === "regex"
                          ? " ?"
                          : ""}
                      </span>
                    ) : t.isTce ? (
                      <span className="text-xs text-slate-400">
                        {t.tCellArm ?? "CD3"} × unknown
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.conditions.slice(0, 2).join("; ") || "—"}
                    {t.conditions.length > 2 ? ` +${t.conditions.length - 2}` : ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {t.phase ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {PHASE_LABEL[t.status ?? ""] ?? statusLabel(t.status)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.sponsor ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <Flag on={t.enrollsOvarian} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Flag on={t.hasUsSites} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <a
                      href={`https://clinicaltrials.gov/study/${t.nctId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      {t.nctId}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-400">
            No trials match these filters.
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Snapshot generated {new Date(stats.generatedAt).toLocaleString()}. Pairs
        marked “?” are low-confidence or text-extracted — verify before relying on
        them.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className={`text-2xl font-semibold ${accent ? "text-brand-600" : "text-slate-900"}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Toggle({
  label,
  on,
  set,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        on
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
