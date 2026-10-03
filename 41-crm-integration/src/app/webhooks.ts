// Change notifications: authenticate, deduplicate by event id, then fetch the current state (the event is only a hint).
import type { MemberDirectory, SourceEvent } from "../domain/ports.js";
import type { Store } from "./store.js";

export type WebhookCheck = { ok: true; event: SourceEvent; signedAt: number } | { ok: false; status: number; reason: string };
export type Verify = (headers: Record<string, string | string[] | undefined>, rawBody: string, nowMs: number) => WebhookCheck;

export async function handleWebhook(raw: string, headers: Record<string, string | string[] | undefined>, deps: { verify: Verify; store: Store; dir: MemberDirectory; now: () => number }) {
  const v = deps.verify(headers, raw, deps.now());
  if (!v.ok) {
    await deps.store.refused(v.reason, null);
    return { status: v.status, body: { error: v.reason } };
  }
  const seen = await deps.store.receive(v.event, v.signedAt);
  if (seen.outcome !== null) return { status: 200, body: { status: "duplicate", deliveries: seen.deliveries, outcome: seen.outcome } };
  let outcome: string;
  if (v.event.kind !== "member") outcome = "ignored";
  else if (v.event.deleted) outcome = await deps.store.removeBySource(v.event.sourceId);
  else {
    // Never apply the payload: re-read the record, so an out-of-order or stale event cannot overwrite newer data.
    const inc = await deps.dir.member(v.event.sourceId);
    outcome = inc ? await deps.store.applyMember(inc) : await deps.store.removeBySource(v.event.sourceId);
  }
  await deps.store.processed(v.event.eventId, outcome);
  return { status: 200, body: { status: "processed", outcome } };
}
