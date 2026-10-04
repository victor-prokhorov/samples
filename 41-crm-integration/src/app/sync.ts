// Incremental sync with a high-water mark: ask for what changed since the last change we saw, apply, move the mark.
import type { MemberDirectory } from "../domain/ports.js";
import type { Applied, Store } from "./store.js";

export type SyncResult = { markBefore: string | null; markAfter: string | null; fetched: number } & Record<Applied, number>;

export async function syncEmployers(dir: MemberDirectory, store: Store) {
  const n = { applied: 0, unchanged: 0, removed: 0, rejected: 0 };
  for await (const e of dir.employers()) n[await store.applyEmployer(e)]++;
  return n;
}

export async function syncMembers(dir: MemberDirectory, store: Store): Promise<SyncResult> {
  const markBefore = await store.mark("members");
  const r: SyncResult = { markBefore, markAfter: markBefore, fetched: 0, applied: 0, unchanged: 0, removed: 0, rejected: 0 };
  for await (const inc of dir.membersChangedSince(markBefore)) {
    r.fetched++;
    r[await store.applyMember(inc)]++;
    if (!r.markAfter || inc.ref.changedAt > r.markAfter) r.markAfter = inc.ref.changedAt;
  }
  // The mark moves only after the whole run: a run that dies half-way starts again from the old mark,
  // and the version guard turns what it already applied into no-ops.
  await store.setMark("members", r.markAfter);
  await store.db.query("INSERT INTO sync_runs (stream, mark_before, mark_after, fetched, applied, unchanged, removed, rejected) VALUES ('members', $1, $2, $3, $4, $5, $6, $7)", [
    r.markBefore,
    r.markAfter,
    r.fetched,
    r.applied,
    r.unchanged,
    r.removed,
    r.rejected,
  ]);
  return r;
}
