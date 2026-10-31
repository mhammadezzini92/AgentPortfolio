"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 3000;

// Re-renders the server components on an interval while jobs run in the background,
// then stops on its own once nothing is processing.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  return active ? <p className="text-xs text-zinc-500">Processing… this page refreshes automatically.</p> : null;
}
