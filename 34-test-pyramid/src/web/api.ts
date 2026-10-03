// The browser's calls to the API. URLs are resolved against the page, so the same code works in the browser
// and under jsdom, where MSW answers instead of the server.
import type { Member } from "../api/app.js";

export type { Member };

const url = (path: string) => new URL(path, window.location.href);

export async function getMember(id: string): Promise<Member> {
  const res = await fetch(url(`/api/members/${id}`));
  if (!res.ok) throw new Error(`Could not load your details (${res.status})`);
  return res.json();
}

export type SubmitResult =
  | { kind: "created"; rate: number; effectiveFrom: string; monthly: { member: number; employer: number; total: number } }
  | { kind: "invalid"; errors: Record<string, string> }
  | { kind: "refused"; message: string };

export async function submitChange(id: string, rate: string, effectiveFrom: string): Promise<SubmitResult> {
  const res = await fetch(url(`/api/members/${id}/contribution-changes`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rate, effectiveFrom }),
  });
  const body = await res.json();
  if (res.status === 201) return { kind: "created", ...body };
  if (res.status === 422) return { kind: "invalid", errors: body.errors };
  return { kind: "refused", message: body.error ?? `Something went wrong (${res.status})` };
}
