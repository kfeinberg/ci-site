import { notFound } from "next/navigation";
import AlertCard from "@/components/AlertCard";
import { workspaceById } from "@/lib/mockData";
import { getWorkspaceAlerts } from "@/lib/db";

export default function WorkspaceAlertsPage({
  params,
}: {
  params: { id: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  const alerts = getWorkspaceAlerts(workspace.id);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{alerts.length} alerts</p>
        {/* TODO: filter by type / severity / overlap-only */}
      </div>

      <div className="space-y-4">
        {alerts.length ? (
          alerts.map((a) => <AlertCard key={a.id} alert={a} />)
        ) : (
          <p className="text-sm text-slate-500">No alerts yet.</p>
        )}
      </div>
    </>
  );
}
