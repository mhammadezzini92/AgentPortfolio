import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/admin/logout-button";
import { UsageSummary } from "@/components/admin/usage-summary";

const NAV = [
  { href: "/admin", label: "Sources" },
  { href: "/admin/knowledge", label: "Knowledge" },
  { href: "/admin/search", label: "Search" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-5 text-sm">
            <span className="font-semibold">Portfolio admin</span>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Suspense fallback={null}>
              <UsageSummary />
            </Suspense>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
