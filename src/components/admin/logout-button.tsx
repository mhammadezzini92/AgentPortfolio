"use client";

import { useRouter } from "next/navigation";
import { callAdminApi } from "@/components/admin/admin-api";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await callAdminApi("/api/admin/session", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
      Log out
    </button>
  );
}
