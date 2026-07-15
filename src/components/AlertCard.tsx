import Link from "next/link";
import type { Alert } from "@/lib/types";
import { SeverityBadge, ThreatBadge, TypeBadge } from "./Badge";

export default function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        alert.overlap ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={alert.type} />
        <SeverityBadge severity={alert.severity} />
        {alert.overlap ? <ThreatBadge /> : null}
        {!alert.read ? (
          <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="unread" />
        ) : null}
        <span className="ml-auto text-xs text-slate-400">
          {new Date(alert.createdAt).toLocaleDateString()}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-slate-900">{alert.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{alert.summary}</p>

      {alert.change ? (
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium">{alert.change.field}:</span>{" "}
          <span className="text-slate-400 line-through">{alert.change.from}</span>{" "}
          → <span className="font-medium text-slate-900">{alert.change.to}</span>
        </div>
      ) : null}

      {alert.overlap ? (
        <div className="mt-3 border-l-2 border-red-300 pl-3">
          <div className="text-xs font-medium uppercase tracking-wide text-red-700">
            Competitive overlap — {alert.overlap.matchedAsset}
          </div>
          <p className="mt-0.5 text-sm text-slate-700">{alert.overlap.reason}</p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <span>{alert.sponsor}</span>
        <Link
          href={`/workspaces/${alert.workspaceId}/trials`}
          className="text-brand-600 hover:underline"
        >
          {alert.nctId}
        </Link>
      </div>
    </div>
  );
}
