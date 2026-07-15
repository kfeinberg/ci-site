import { notFound } from "next/navigation";
import WorkspaceNav from "@/components/WorkspaceNav";
import { workspaceById } from "@/lib/mockData";

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {workspace.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {workspace.indication} · last synced{" "}
            {new Date(workspace.lastSyncedAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Re-sync CT.gov
        </button>
      </div>

      <WorkspaceNav workspaceId={workspace.id} />
      {children}
    </>
  );
}
