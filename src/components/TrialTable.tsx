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
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Trial</th>
            <th className="px-4 py-3 font-medium">Sponsor</th>
            <th className="px-4 py-3 font-medium">Intervention</th>
            <th className="px-4 py-3 font-medium">Phase</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Enrollment</th>
            <th className="px-4 py-3 font-medium">Primary completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trials.map((t) => {
            const overlap = overlapNctIds.has(t.nctId);
            return (
              <tr key={t.nctId} className={overlap ? "bg-red-50" : "hover:bg-slate-50"}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{t.nctId}</span>
                    {overlap ? (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                        overlap
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                    {t.title}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{t.sponsor}</td>
                <td className="px-4 py-3 max-w-xs truncate text-slate-600">
                  {t.mechanism || t.intervention}
                </td>
                <td className="px-4 py-3">
                  <Chip>{t.phase}</Chip>
                </td>
                <td className="px-4 py-3 text-slate-600">{t.status}</td>
                <td className="px-4 py-3 text-slate-600">{t.enrollmentCount}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
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
