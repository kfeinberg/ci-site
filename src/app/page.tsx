import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Chip } from "@/components/Badge";
import { workspaces } from "@/lib/mockData";
import { getWorkspaceAlerts, getWorkspaceTrials } from "@/lib/db";

export default function WorkspacesPage() {
  return (
    <>
      <PageHeader
        title="Workspaces"
        subtitle="Each workspace is one engagement scoped to a disease/indication."
        action={
          <Link
            href="/workspaces/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New workspace
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {workspaces.map((w) => {
          const trials = getWorkspaceTrials(w.id);
          const alerts = getWorkspaceAlerts(w.id);
          const unread = alerts.filter((a) => !a.read).length;
          return (
            <Link
              key={w.id}
              href={`/workspaces/${w.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{w.name}</h3>
                {unread > 0 ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {unread} new
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Last synced {new Date(w.lastSyncedAt).toLocaleDateString()}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip>{w.indication}</Chip>
                <Chip>{trials.length} trials</Chip>
                <Chip>{alerts.length} alerts</Chip>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
