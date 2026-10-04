// CRM shapes in, domain types out. Every rename, code and quirk of the CRM is handled here and only here.
import { type Employer, type Member, type MemberStatus, type Sector, type Valid, validEmployer, validMember } from "../domain/model.js";
import type { CrmAccount, CrmContact } from "./crm-types.js";

// Option sets are integers whose meaning lives in the CRM's metadata. An unknown code is a reason to stop,
// not to guess: the day someone adds "Transferred out" (100000003) it must not silently become "retired".
const SCHEME_STATUS: Record<number, MemberStatus> = { 100000000: "active", 100000001: "deferred", 100000002: "retired" };
const INDUSTRY: Record<number, Sector> = { 1: "manufacturing", 2: "services", 3: "retail" };
const EMAIL_FIELD = "EMailAddress1";

export function toEmployer(a: CrmAccount): Valid<Employer> {
  const sector = a.IndustryCode === null ? undefined : INDUSTRY[a.IndustryCode];
  if (!sector) return { ok: false, reasons: [`IndustryCode ${a.IndustryCode} has no sector mapping`] };
  return validEmployer({ ref: (a.AccountNumber ?? "").trim().toUpperCase(), name: (a.Name ?? "").trim(), sector });
}

export function toMember(c: CrmContact, employerRefByAccount: Map<string, string>, today: string): Valid<Member> {
  const reasons: string[] = [];
  const status = c.New_SchemeStatus === null ? undefined : SCHEME_STATUS[c.New_SchemeStatus];
  if (!status) reasons.push(`New_SchemeStatus ${c.New_SchemeStatus} is not a known scheme status`);
  if (!c.New_MemberNo) reasons.push("New_MemberNo is empty");
  const employerRef = c._ParentCustomerId_Value ? employerRefByAccount.get(c._ParentCustomerId_Value.toLowerCase()) : undefined;
  if (!employerRef) reasons.push(`parent account ${c._ParentCustomerId_Value} is not a known employer`);
  if (reasons.length) return { ok: false, reasons };
  return validMember(
    {
      memberNo: c.New_MemberNo!.trim(),
      givenName: (c.FirstName ?? "").trim(),
      familyName: (c.LastName ?? "").trim(),
      email: (c.EMailAddress1 ?? "").trim(),
      birthDate: (c.BirthDate ?? "").slice(0, 10),
      status: status!,
      employerRef: employerRef!,
    },
    today,
  );
}

// The way back: a domain change expressed as a CRM patch.
export const emailPatch = (email: string) => ({ [EMAIL_FIELD]: email });
export const etagOf = (version: number) => `W/"${version}"`;
