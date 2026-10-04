// The hardened portal's defences, in one place: the response headers, the CSP with a fresh nonce per request,
// the cookies, signed session ids, CSRF tokens and the Origin check.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type http from "node:http";

// ---- secrets: a key ring from the environment ------------------------------------------------------------
// SESSION_KEYS="newest,previous": the first key signs, every key verifies. Rotation is: add a new key in front,
// deploy, wait for the longest session to expire, drop the old key, deploy. No key is ever in the repo or the image:
// the platform injects the variable from its secret store at start.
export function keyRing(env = process.env.SESSION_KEYS): Buffer[] {
  if (!env) throw new Error("SESSION_KEYS is not set");
  return env.split(",").map((k) => Buffer.from(k.trim(), "base64url"));
}

const mac = (key: Buffer, data: string) => createHmac("sha256", key).update(data).digest("base64url");

function verifyMac(keys: Buffer[], data: string, sig: string): boolean {
  const given = Buffer.from(sig);
  return keys.some((k) => {
    const want = Buffer.from(mac(k, data));
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

// Session cookie value: "<random id>.<HMAC(id)>". A forged or tampered id fails the MAC.
export const signSession = (keys: Buffer[], id: string) => `${id}.${mac(keys[0], id)}`;
export function verifySession(keys: Buffer[], value: string | undefined): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  return id && sig && verifyMac(keys, id, sig) ? id : null;
}

// CSRF token bound to the session (a stateless synchronizer token): HMAC("csrf:" + session id).
// The page embeds it in every form; a page on another origin cannot read it, so it cannot send it.
export const csrfToken = (keys: Buffer[], sessionId: string) => mac(keys[0], `csrf:${sessionId}`);
export const verifyCsrf = (keys: Buffer[], sessionId: string, token: string | undefined) => !!token && verifyMac(keys, `csrf:${sessionId}`, token);

// ---- Origin check ----------------------------------------------------------------------------------------
// Browsers send Origin on every cross-origin POST (and on same-origin POSTs too, in current browsers).
// Fall back to Referer; reject when neither proves the request came from our own pages.
export function sameOrigin(req: http.IncomingMessage, origin: string): { ok: boolean; seen: string } {
  const o = req.headers.origin;
  if (o) return { ok: o === origin, seen: `Origin ${o}` };
  const r = req.headers.referer;
  if (r) return { ok: r.startsWith(origin + "/"), seen: `Referer ${r}` };
  return { ok: false, seen: "no Origin or Referer" };
}

// ---- headers ---------------------------------------------------------------------------------------------
export const newNonce = () => randomBytes(16).toString("base64");

export function csp(nonce: string): string {
  return [
    "default-src 'self'",
    // Only scripts carrying this response's nonce run, plus whatever they load ('strict-dynamic');
    // host allowlists and 'unsafe-inline' are ignored by browsers that understand strict-dynamic.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /csp-report",
  ].join("; ");
}

export function hardenedHeaders(nonce: string): Record<string, string> {
  return {
    "content-security-policy": csp(nonce),
    // Only honoured over HTTPS (the proxy that terminates TLS must send it); ignored on plain http://localhost.
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "x-frame-options": "DENY", // for browsers without frame-ancestors
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "no-store",
  };
}

// __Host- prefix: the browser accepts the cookie only with Secure, Path=/ and no Domain, so a sibling
// subdomain cannot set or overwrite it. Chromium treats http://localhost as a secure context, so Secure works here.
export const sessionCookie = (value: string) => `__Host-session=${value}; Path=/; Secure; HttpOnly; SameSite=Lax`;

export function cookies(req: http.IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, v.join("=")]),
  );
}
