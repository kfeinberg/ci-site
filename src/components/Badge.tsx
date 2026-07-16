import type { AlertSeverity, AlertType } from "@/lib/types";

const severityStyles: Record<AlertSeverity, string> = {
  info: "bg-slate-100 text-slate-600",
  watch: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const typeLabels: Record<AlertType, string> = {
  new_trial: "New trial",
  enrollment_change: "Enrollment change",
  date_change: "Date change",
  phase_status_change: "Phase / status change",
  trial_dropped: "Trial dropped",
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityStyles[severity]}`}
    >
      {severity}
    </span>
  );
}

export function TypeBadge({ type }: { type: AlertType }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
      {typeLabels[type]}
    </span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
      {children}
    </span>
  );
}

export function ThreatBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      ⚠ Portfolio overlap
    </span>
  );
}
