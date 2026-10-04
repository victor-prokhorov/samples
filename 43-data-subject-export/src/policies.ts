// The retention schedule, loaded into the retention_policies table by setup. The purge job reads the table.
// Rows are applied in seq order: children before the record they hang off, so a member is anonymised last.
// anchor: when the clock starts (SQL over the row, aliased t); subject: whose row it is, for legal holds.
const leftOn = "(SELECT m.left_on FROM members m WHERE m.id = t.member_id)";
const requestDone = "(SELECT r.completed_at FROM dsar_requests r WHERE r.id = t.request_id)";
const requestOwner = "(SELECT r.member_id FROM dsar_requests r WHERE r.id = t.request_id)";

export type Policy = { seq: number; table: string; keep: string; anchor: string; anchorLabel: string; subject: string; action: "delete" | "anonymise"; anonymise?: string; pending?: string; why: string };

export const policies: Policy[] = [
  { seq: 1, table: "sessions", keep: "30 days", anchor: "t.created_at", anchorLabel: "after the session started", subject: "t.member_id", action: "delete", why: "a session that old has expired anyway" },
  { seq: 2, table: "login_events", keep: "12 months", anchor: "t.at", anchorLabel: "after the sign-in", subject: "t.member_id", action: "delete", why: "long enough to investigate an incident" },
  {
    seq: 3,
    table: "support_tickets",
    keep: "2 years",
    anchor: "t.closed_at",
    anchorLabel: "after the ticket was closed",
    subject: "t.member_id",
    action: "anonymise",
    anonymise: "member_id = NULL, subject = '[removed]', body = NULL, anonymised_at = $1::timestamptz",
    pending: "t.anonymised_at IS NULL",
    why: "anonymised rows still count in support statistics",
  },
  { seq: 4, table: "consents", keep: "5 years", anchor: "t.withdrawn_at", anchorLabel: "after consent was withdrawn", subject: "t.member_id", action: "delete", why: "proof of consent and of its withdrawal (art. 7(1))" },
  { seq: 5, table: "dsar_events", keep: "3 years", anchor: requestDone, anchorLabel: "after the request was answered", subject: requestOwner, action: "delete", why: "accountability (art. 5(2)) for the period complaints are likely" },
  { seq: 6, table: "dsar_requests", keep: "3 years", anchor: "t.completed_at", anchorLabel: "after the request was answered", subject: "t.member_id", action: "delete", why: "accountability (art. 5(2)) for the period complaints are likely" },
  { seq: 7, table: "bank_accounts", keep: "1 year", anchor: leftOn, anchorLabel: "after leaving the scheme", subject: "t.member_id", action: "delete", why: "time to pay the last refunds" },
  { seq: 8, table: "credentials", keep: "1 year", anchor: leftOn, anchorLabel: "after leaving the scheme", subject: "t.member_id", action: "delete", why: "a member who left signs in rarely after a year" },
  { seq: 9, table: "beneficiaries", keep: "10 years", anchor: leftOn, anchorLabel: "after leaving the scheme", subject: "t.member_id", action: "delete", why: "as long as benefits can be claimed" },
  { seq: 10, table: "contributions", keep: "10 years", anchor: leftOn, anchorLabel: "after leaving the scheme", subject: "t.member_id", action: "delete", why: "pension and tax records" },
  { seq: 11, table: "legal_holds", keep: "1 year", anchor: "t.released_at", anchorLabel: "after the hold was released", subject: "NULL::int", action: "delete", why: "a record that the hold existed" },
  {
    seq: 12,
    table: "members",
    keep: "10 years",
    anchor: "t.left_on",
    anchorLabel: "after leaving the scheme",
    subject: "t.id",
    action: "anonymise",
    anonymise: "member_no = 'anon-' || t.id, given_name = NULL, family_name = NULL, email = NULL, phone = NULL, national_id = NULL, address_line = NULL, city = NULL, postcode = left(t.postcode, 2), birth_date = date_trunc('year', t.birth_date)::date, anonymised_at = $1::timestamptz",
    pending: "t.anonymised_at IS NULL",
    why: "keeps year of birth, area and dates for scheme statistics",
  },
];
