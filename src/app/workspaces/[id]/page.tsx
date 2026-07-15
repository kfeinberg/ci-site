import Link from "next/link";
import { notFound } from "next/navigation";
import StatCard from "@/components/StatCard";
import AlertCard from "@/components/AlertCard";
import { workspaceById } from "@/lib/mockData";
import { getWorkspaceAlerts, getWorkspaceTrials } from "@/lib/db";
import { computeLandscape } from "@/lib/landscape";

export default function WorkspaceOverviewPage({
  params,
}: {
  params: { id: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  const trials = getWorkspaceTrials(workspace.id);
  const alerts = getWorkspaceAlerts(workspace.id);
  const landscape = computeLandscape(workspace.indication, trials);

  const unread = alerts.filter((a) => !a.read).length;
  const recruiting = trials.filter((t) => t.status === "Recruiting").length;
  const recent = alerts.slice(0, 3);

  return (
    <>
      {/* Baseline landscape summary */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Current landscape
        </div>
        <p className="mt-1 text-base font-medium text-slate-900">
          {landscape.headline}
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {landscape.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-brand-500">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Trials tracked" value={trials.length} />
        <StatCard label="Phase 3" value={landscape.phase3Count} />
        <StatCard label="Recruiting" value={recruiting} />
        <StatCard label="Unread alerts" value={unread} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Recent alerts
        </h2>
        <Link
          href={`/workspaces/${workspace.id}/alerts`}
          className="text-sm text-brand-600 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="mt-3 space-y-4">
        {recent.length ? (
          recent.map((a) => <AlertCard key={a.id} alert={a} />)
        ) : (
          <p className="text-sm text-slate-500">No alerts yet.</p>
        )}
      </div>
    </>
  );
}
