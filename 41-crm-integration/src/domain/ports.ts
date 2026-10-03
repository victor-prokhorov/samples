// What the application needs from "the place members come from", in its own terms.
// The anti-corruption layer implements this port; nothing on this side imports the adapter's types.
import type { Employer, Member } from "./model.js";

// Where a record came from and which version of it we hold. The id is opaque: we store it, we never parse it.
export interface SourceRef {
  id: string;
  version: number;
  changedAt: string; // ISO instant, the source's own change time: the high-water mark of incremental sync
}

export type Incoming<T> =
  | { kind: "upsert"; ref: SourceRef; value: T }
  | { kind: "removed"; ref: SourceRef } // deactivated at the source
  | { kind: "rejected"; ref: SourceRef; reasons: string[]; raw: unknown }; // failed translation or validation: quarantined, never applied

export type ChangeOutcome = { outcome: "updated"; version: number; attempts: number; conflicts: number } | { outcome: "conflict"; theirs: string; attempts: number };

export interface MemberDirectory {
  employers(): AsyncIterable<Incoming<Employer>>;
  // every member changed at or after the mark (null = everything), oldest change first
  membersChangedSince(mark: string | null): AsyncIterable<Incoming<Member>>;
  member(sourceId: string): Promise<Incoming<Member> | null>; // null: gone at the source
  activeMembers(): AsyncIterable<Incoming<Member>>; // for reconciliation
  count(): Promise<number>; // active members at the source, valid or not
  // write a member's new email back, based on the version we last saw
  changeEmail(ref: SourceRef, before: Member, email: string): Promise<ChangeOutcome>;
}

// A change notification, already authenticated and translated: just "this record changed, go and look".
export interface SourceEvent {
  eventId: string;
  sourceId: string;
  kind: "member" | "employer" | "other";
  deleted: boolean;
}
