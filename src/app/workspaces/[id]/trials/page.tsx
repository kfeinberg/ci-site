import { notFound } from "next/navigation";
import TrialsView from "@/components/TrialsView";
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

  // TODO: filters (phase, status, sponsor, mechanism) + search
  return <TrialsView trials={trials} />;
}
