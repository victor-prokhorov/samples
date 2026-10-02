import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// A stub for the identity provider's session (26 does it with OpenID Connect): a signed member id in an HttpOnly cookie.
const SECRET = process.env.SESSION_SECRET ?? "sample-only-secret";

const sign = (memberId: number) => createHmac("sha256", SECRET).update(String(memberId)).digest("base64url");

export const sessionValue = (memberId: number) => `${memberId}.${sign(memberId)}`;

export function verify(value: string | undefined): number | null {
  const m = /^(\d+)\.([\w-]+)$/.exec(value ?? "");
  if (!m) return null;
  const expected = Buffer.from(sign(Number(m[1])));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? Number(m[1]) : null;
}

export async function startSession(memberId: number) {
  (await cookies()).set("sid", sessionValue(memberId), { httpOnly: true, sameSite: "lax", path: "/" });
}

// Every page and action gets the member from the cookie, never from the URL or the form.
export async function requireMember(): Promise<number> {
  const id = verify((await cookies()).get("sid")?.value);
  if (id === null) redirect("/login");
  return id;
}
