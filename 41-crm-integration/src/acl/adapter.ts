// The adapter: implements the domain's MemberDirectory port on top of the CRM client and the translator.
import type { Employer, Member } from "../domain/model.js";
import type { ChangeOutcome, Incoming, MemberDirectory, SourceRef } from "../domain/ports.js";
import { CrmClient, CrmHttpError } from "./client.js";
import { ACCOUNT_FIELDS, CONTACT_FIELDS, type CrmAccount, type CrmContact } from "./crm-types.js";
import { emailPatch, etagOf, toEmployer, toMember } from "./translator.js";

const ref = (r: { ContactId?: string; AccountId?: string; VersionNumber: number; ModifiedOn: string }): SourceRef => ({ id: (r.ContactId ?? r.AccountId)!.toLowerCase(), version: r.VersionNumber, changedAt: r.ModifiedOn });

export class CrmMemberDirectory implements MemberDirectory {
  private employerByAccount = new Map<string, string>();
  constructor(private client: CrmClient, private today: () => string) {}

  private async accounts() {
    if (this.employerByAccount.size) return;
    for await (const e of this.employers()) void e;
  }

  async *employers(): AsyncIterable<Incoming<Employer>> {
    for await (const page of this.client.pages<CrmAccount>("Accounts", { $select: ACCOUNT_FIELDS.join(","), $filter: "StateCode eq 0", $orderby: "AccountId asc" })) {
      for (const a of page.value) {
        const t = toEmployer(a);
        if (t.ok) this.employerByAccount.set(a.AccountId.toLowerCase(), t.value.ref);
        yield t.ok ? { kind: "upsert", ref: ref(a), value: t.value } : { kind: "rejected", ref: ref(a), reasons: t.reasons, raw: a };
      }
    }
  }

  private translate(c: CrmContact): Incoming<Member> {
    if (c.StateCode !== 0) return { kind: "removed", ref: ref(c) };
    const t = toMember(c, this.employerByAccount, this.today());
    return t.ok ? { kind: "upsert", ref: ref(c), value: t.value } : { kind: "rejected", ref: ref(c), reasons: t.reasons, raw: c };
  }

  private async *contacts(q: { $filter?: string; $orderby: string }) {
    await this.accounts();
    for await (const page of this.client.pages<CrmContact>("Contacts", { $select: CONTACT_FIELDS.join(","), ...q })) for (const c of page.value) yield this.translate(c);
  }

  // ge, not gt: ModifiedOn has second precision, so a row written later in the same second as the mark
  // has the same ModifiedOn. Rows already applied come back too; the version check makes them no-ops.
  membersChangedSince(mark: string | null) {
    return this.contacts({ $filter: mark ? `ModifiedOn ge ${mark}` : undefined, $orderby: "ModifiedOn asc,ContactId asc" });
  }

  activeMembers() {
    return this.contacts({ $filter: "StateCode eq 0", $orderby: "ContactId asc" });
  }

  async count() {
    for await (const page of this.client.pages<CrmContact>("Contacts", { $select: "ContactId", $filter: "StateCode eq 0", $count: "true", $top: "1" })) return page["@odata.count"]!;
    return 0;
  }

  async member(sourceId: string) {
    await this.accounts();
    const c = await this.client.get<CrmContact>("Contacts", sourceId, CONTACT_FIELDS);
    return c && this.translate(c);
  }

  // PATCH with If-Match on the version we hold. On 412 someone changed the contact since: re-read it; if they did not
  // touch the email, our change still applies on top of theirs, so retry on the new ETag. If they did, it is a real
  // conflict: report it, never overwrite.
  async changeEmail(r: SourceRef, before: Member, email: string): Promise<ChangeOutcome> {
    let etag = etagOf(r.version);
    let conflicts = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const newEtag = await this.client.patch("Contacts", r.id, emailPatch(email), etag);
        return { outcome: "updated", version: Number(/\d+/.exec(newEtag)?.[0]), attempts: attempt, conflicts };
      } catch (e) {
        if (!(e instanceof CrmHttpError) || e.status !== 412) throw e;
        conflicts++;
        const now = await this.client.get<CrmContact>("Contacts", r.id, CONTACT_FIELDS);
        if (!now) throw new Error("contact deleted at the source");
        if ((now.EMailAddress1 ?? "").toLowerCase() !== before.email) return { outcome: "conflict", theirs: now.EMailAddress1 ?? "", attempts: attempt };
        etag = now["@odata.etag"];
      }
    }
    throw new Error("gave up after 3 precondition failures");
  }
}
