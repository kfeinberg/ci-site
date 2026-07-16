import { notFound } from "next/navigation";
import TrialsView from "@/components/TrialsView";
import { workspaceById } from "@/lib/mockData";
import { getCommCounts, getWorkspaceTrials } from "@/lib/db";

export default function WorkspaceTrialsPage({
  params,
}: {
  params: { id: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  const trials = getWorkspaceTrials(workspace.id);
  const commCounts = getCommCounts();

  // TODO: filters (phase, status, sponsor, mechanism) + search
  return <TrialsView trials={trials} commCounts={commCounts} />;
}
