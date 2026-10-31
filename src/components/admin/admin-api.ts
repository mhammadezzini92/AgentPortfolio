// Client-side calls to the admin API routes. Returns an error message for the UI,
// or null on success; the routes already return { error } bodies for every failure.
// No redirect on 401: the next navigation or refresh passes through proxy.ts,
// which sends an expired session to the login page.
export async function callAdminApi(path: string, init: RequestInit = {}): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return "Network error — is the dev server running?";
  }
  if (response.ok) return null;

  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (response.status === 401 && path !== "/api/admin/session") return "Session expired — reload to sign in again";
  return body?.error ?? `Request failed (HTTP ${response.status})`;
}

export function postJson(path: string, body: unknown): Promise<string | null> {
  return callAdminApi(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
