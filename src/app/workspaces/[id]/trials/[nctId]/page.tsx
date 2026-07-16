import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip } from "@/components/Badge";
import { workspaceById } from "@/lib/mockData";
import { getTrialComms, getWorkspaceTrials } from "@/lib/db";

export default function TrialDetailPage({
  params,
}: {
  params: { id: string; nctId: string };
}) {
  const workspace = workspaceById(params.id);
  if (!workspace) notFound();

  const trial = getWorkspaceTrials(workspace.id).find(
    (t) => t.nctId === params.nctId
  );
  if (!trial) notFound();

  const comms = getTrialComms(trial.nctId);

  return (
    <>
      <Link
        href={`/workspaces/${workspace.id}/trials`}
        className="text-sm text-brand-600 hover:underline"
      >
        ← All trials
      </Link>

      {/* Trial header */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 hover:underline"
          >
            {trial.nctId}
          </a>
          <Chip>{trial.phase}</Chip>
          <Chip>{trial.status}</Chip>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">{trial.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            <span className="text-slate-400">Sponsor:</span> {trial.sponsor}
          </span>
          <span>
            <span className="text-slate-400">Intervention:</span> {trial.intervention}
          </span>
          <span>
            <span className="text-slate-400">Enrollment:</span> {trial.enrollmentCount}
          </span>
          {trial.primaryCompletionDate ? (
            <span>
              <span className="text-slate-400">Primary completion:</span>{" "}
              {trial.primaryCompletionDate}
            </span>
          ) : null}
        </div>

        {/* Mechanism classification (from classify.mjs) */}
        {trial.mechanism || trial.target || trial.modality || trial.lineOfTherapy ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Mechanism
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {trial.mechanism ? <Chip>{trial.mechanism}</Chip> : null}
              {trial.target ? <Chip>Target: {trial.target}</Chip> : null}
              {trial.modality ? <Chip>{trial.modality}</Chip> : null}
              {trial.lineOfTherapy ? <Chip>{trial.lineOfTherapy}</Chip> : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Company communications */}
      <div id="comms" className="mt-6 flex items-baseline justify-between scroll-mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Company communications
        </h2>
        <span className="text-xs text-slate-400">
          {comms.length} SEC filing{comms.length === 1 ? "" : "s"} · via EDGAR
        </span>
      </div>

      {comms.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No SEC filings found mentioning this trial&apos;s drug(s). The sponsor may
          be private or file outside the SEC.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comms.map((c) => (
            <li
              key={`${c.accession}-${c.docUrl}`}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {c.form}
                </span>
                <span className="text-sm font-medium text-slate-900">{c.company}</span>
                <span className="ml-auto text-xs text-slate-400">{c.filedDate}</span>
              </div>
              {c.summary ? (
                <p className="mt-2 text-sm text-slate-700">{c.summary}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                {c.description || "Filing"}
                {c.itemCodes ? <span> · items {c.itemCodes}</span> : null}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                  matched: {c.matchedTerm}
                </span>
                <a
                  href={c.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  View filing on SEC.gov →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
