// Webhook authentication: HMAC-SHA256 over "<timestamp>.<raw body>", compared in constant time,
// with a 5-minute window against replays. Then the CRM payload is translated into a neutral SourceEvent.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SourceEvent } from "../domain/ports.js";
import type { CrmWebhook } from "./crm-types.js";

export const TOLERANCE_SECONDS = 300;

export type Verified = { ok: true; event: SourceEvent; signedAt: number } | { ok: false; status: 400 | 401; reason: string };

export function verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string, secrets: string[], nowMs: number): Verified {
  const ts = String(headers["x-crm-timestamp"] ?? "");
  const sigHeader = String(headers["x-crm-signature"] ?? "");
  if (!/^\d{10}$/.test(ts) || !sigHeader) return { ok: false, status: 400, reason: "missing timestamp or signature" };
  // The timestamp is inside the signed content: an attacker cannot refresh it without the secret.
  // Several v1= values, and several secrets, allow rotating the secret without downtime.
  const given = sigHeader.split(",").map((s) => s.trim()).filter((s) => s.startsWith("v1=")).map((s) => Buffer.from(s.slice(3), "hex"));
  const valid = secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest();
    // timingSafeEqual throws on different lengths; check the length first (it is not secret)
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
  if (!valid) return { ok: false, status: 401, reason: "signature does not match" };
  const age = Math.round(nowMs / 1000) - Number(ts);
  if (Math.abs(age) > TOLERANCE_SECONDS) return { ok: false, status: 401, reason: `timestamp outside the ${TOLERANCE_SECONDS}s window (age ${age}s)` };
  let body: CrmWebhook;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, reason: "body is not JSON" };
  }
  // the event id is taken from the signed body, not from a header anyone could change
  const kind = body.PrimaryEntityName === "contact" ? "member" : body.PrimaryEntityName === "account" ? "employer" : "other";
  return { ok: true, signedAt: Number(ts), event: { eventId: body.EventId, sourceId: body.PrimaryEntityId.toLowerCase(), kind, deleted: body.MessageName === "Delete" } };
}
