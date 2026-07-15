"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/workspaces/${workspaceId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/trials`, label: "Trials" },
    { href: `${base}/alerts`, label: "Alerts" },
  ];

  return (
    <div className="mb-6 border-b border-slate-200">
      <nav className="flex gap-6">
        {tabs.map((tab) => {
          const active =
            tab.href === base
              ? pathname === base
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium ${
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
