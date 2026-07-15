import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-slate-200 bg-white">
      <Link href="/" className="block px-5 py-5">
        <div className="text-lg font-semibold tracking-tight text-slate-900">
          Clarion
        </div>
        <div className="text-xs text-slate-400">Competitive Intelligence</div>
      </Link>
      <nav className="flex-1 space-y-1 px-3">
        <Link
          href="/"
          className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          Workspaces
        </Link>
        <Link
          href="/workspaces/new"
          className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          + New workspace
        </Link>
      </nav>
      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-400">
        P0 — Core MVP
      </div>
    </aside>
  );
}
