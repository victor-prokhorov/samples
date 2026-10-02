import { createHmac, timingSafeEqual } from "node:crypto";

// A stub: a real portal uses its identity provider's session. Signed, so any server instance can verify it without a lookup.
const SECRET = "sample-only-secret";

const sign = (memberId: number) => createHmac("sha256", SECRET).update(String(memberId)).digest("base64url");

export const issue = (memberId: number) => `${memberId}.${sign(memberId)}`;

export function verify(cookie: string | undefined): number | null {
  const m = /(?:^|;\s*)sid=(\d+)\.([\w-]+)/.exec(cookie ?? "");
  if (!m) return null;
  const expected = Buffer.from(sign(Number(m[1])));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? Number(m[1]) : null;
}
