import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";
import { safeAdminRedirect } from "@/lib/auth";

type SearchParams = PageProps<"/admin/login">["searchParams"];

async function LoginFormWithRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <LoginForm redirectTo={safeAdminRedirect(typeof next === "string" ? next : null)} />;
}

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-zinc-500">Sign in to manage the knowledge base.</p>
      </div>
      <Suspense fallback={null}>
        <LoginFormWithRedirect searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
