// Deterministic CRM data: 3 accounts (the employers) and 120 contacts (the members), in the CRM's own shape.
// Four contacts carry the kind of data real CRMs hold and a domain must not accept.
import type { Row } from "./odata.js";

const FIRST = ["Alex", "Sam", "Jordan", "Camille", "Robin", "Charlie", "Dominique", "Morgan", "Lou", "Noa", "Sacha", "Eden", "Maxime", "Ali", "Claude", "Jamie"];
const LAST = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux"];

export const ACCOUNTS = [
  { AccountId: "a0000000-0000-4000-8000-000000000001", Name: "Acme Ltd", AccountNumber: "ACME", IndustryCode: 1 },
  { AccountId: "a0000000-0000-4000-8000-000000000002", Name: "Globex Corporation", AccountNumber: "GLOBEX", IndustryCode: 2 },
  { AccountId: "a0000000-0000-4000-8000-000000000003", Name: "Initech", AccountNumber: "INITECH", IndustryCode: 3 },
];

export const contactId = (i: number) => `c0000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
export const memberNo = (i: number) => `M${String(i).padStart(4, "0")}`;

export function seed(): { accounts: Row[]; contacts: Row[]; version: number } {
  let version = 1000;
  const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 8, 0, 0) + minutes * 60_000).toISOString().replace(".000Z", "Z");
  const accounts: Row[] = ACCOUNTS.map((a, k) => ({ ...a, Telephone1: `+33 1 00 00 00 0${k}`, StateCode: 0, StatusCode: 1, CreatedOn: at(0), ModifiedOn: at(k), VersionNumber: ++version }));
  const contacts: Row[] = [];
  for (let i = 1; i <= 120; i++) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 11) % LAST.length];
    const account = i <= 60 ? ACCOUNTS[0] : i <= 100 ? ACCOUNTS[1] : ACCOUNTS[2];
    const status = i % 9 === 0 ? 100000002 : i % 5 === 0 ? 100000001 : 100000000;
    const birth = `${1960 + ((i * 13) % 40)}-${String(1 + ((i * 5) % 12)).padStart(2, "0")}-${String(1 + ((i * 3) % 28)).padStart(2, "0")}`;
    contacts.push({
      ContactId: contactId(i),
      FirstName: first,
      LastName: last,
      FullName: `${first} ${last}`,
      EMailAddress1: `${first}.${last}.${i}@example.org`.toLowerCase(),
      Telephone1: `+33 6 ${String(10_000_000 + i * 7919).slice(-8)}`,
      BirthDate: birth,
      Address1_PostalCode: String(75001 + (i % 20)),
      New_MemberNo: memberNo(i),
      New_SchemeStatus: status,
      _ParentCustomerId_Value: account.AccountId,
      New_InternalNotes: i % 4 === 0 ? "Called the help desk about a transfer, see ticket" : null,
      StateCode: 0,
      StatusCode: 1,
      CreatedOn: at(10 + i),
      ModifiedOn: at(10 + i * 37),
      VersionNumber: ++version,
    });
  }
  // what a CRM accumulates over the years, and a domain must refuse
  contacts[16].EMailAddress1 = "jamie.dupont.at.example.org"; // typed by hand, no @
  contacts[32].New_MemberNo = null; // a prospect created before the member number existed
  contacts[57].New_SchemeStatus = 100000003; // a new option ("Transferred out") added in the CRM last month
  contacts[90].BirthDate = "2031-02-01"; // a typo in the year
  return { accounts, contacts, version };
}
