import type { Trial } from "@/lib/types";
import { Chip } from "./Badge";

export default function TrialTable({
  trials,
  overlapNctIds = new Set<string>(),
}: {
  trials: Trial[];
  overlapNctIds?: Set<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      {/* table-fixed + colgroup makes the table fill its container and truncate
          long cells instead of overflowing (no side-to-side scroll). */}
      <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[9%]" />
          <col className="w-[13%]" />
          <col className="w-[7%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Trial</th>
            <th className="px-4 py-3 font-medium">Sponsor</th>
            <th className="px-4 py-3 font-medium">Intervention</th>
            <th className="px-4 py-3 font-medium">Phase</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Enroll.</th>
            <th className="px-4 py-3 font-medium">Primary completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trials.map((t) => {
            const overlap = overlapNctIds.has(t.nctId);
            const dropped = Boolean(t.droppedAt);
            const rowClass = dropped
              ? "bg-slate-50/60 text-slate-400"
              : overlap
                ? "bg-red-50"
                : "hover:bg-slate-50";
            return (
              <tr key={t.nctId} className={rowClass}>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://clinicaltrials.gov/study/${t.nctId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {t.nctId}
                    </a>
                    {overlap ? (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        overlap
                      </span>
                    ) : null}
                    {dropped ? (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        dropped
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`mt-0.5 truncate text-xs ${
                      dropped ? "text-slate-400 line-through" : "text-slate-500"
                    }`}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                </td>
                <td className="truncate px-4 py-3 align-top" title={t.sponsor}>
                  {t.sponsor}
                </td>
                <td
                  className="truncate px-4 py-3 align-top"
                  title={t.mechanism || t.intervention}
                >
                  {t.mechanism || t.intervention}
                </td>
                <td className="px-4 py-3 align-top">
                  <Chip>{t.phase}</Chip>
                </td>
                <td className="truncate px-4 py-3 align-top" title={t.status}>
                  {t.status}
                </td>
                <td className="px-4 py-3 align-top">{t.enrollmentCount}</td>
                <td className="px-4 py-3 align-top text-xs">
                  {t.primaryCompletionDate ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
