import { notFound } from "next/navigation";
import TrialTable from "@/components/TrialTable";
import { workspaceById } from "@/lib/mockData";
import { getWorkspaceTrials } from "@/lib/db";

export default function WorkspaceTrialsPage({
  params,
}: {
  params: { id: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  const trials = getWorkspaceTrials(workspace.id);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{trials.length} trials from CT.gov</p>
        {/* TODO: filters (phase, status, sponsor, mechanism) + search */}
      </div>
      <TrialTable trials={trials} />
    </>
  );
}
