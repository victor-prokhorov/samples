// Passwords (scrypt) and sessions (opaque token, stored hashed), the minimum to re-authenticate before an export.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const hashPassword = (password: string, salt = randomBytes(16)) => `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"));
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// A sensitive action needs a password typed recently, not just a valid session: the OpenID Connect idea of max_age
// and auth_time (26-sso), applied to a local session. 5 minutes here.
export const MAX_AUTH_AGE_SECONDS = 300;

// The fictional member M0042's password, so the demo can re-authenticate.
export const DEMO_PASSWORD = "correct horse battery staple";
