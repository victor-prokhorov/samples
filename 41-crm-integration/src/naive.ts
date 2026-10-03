// The leaky version, kept to show the pain: CRM shapes straight into the app, no paging, no retry, no validation.
// Every line below would have to change the day the CRM renames a field or adds an option.
import type pg from "pg";
import { CRM_BASE } from "./db.js";

type AnyContact = Record<string, any>;

export async function naiveImport(db: pg.Pool) {
  const res = await fetch(`${CRM_BASE}/Contacts`); // no $select: notes and phone numbers come along
  if (!res.ok) throw new Error(`CRM answered ${res.status}`); // a 429 is a crash
  const page = await res.json();
  for (const c of page.value as AnyContact[]) {
    // option-set codes and lookup GUIDs leak into the app's logic
    const status = c.New_SchemeStatus === 100000000 ? "active" : c.New_SchemeStatus === 100000001 ? "deferred" : "retired";
    const employer = c._ParentCustomerId_Value === "a0000000-0000-4000-8000-000000000001" ? "Acme" : c._ParentCustomerId_Value === "a0000000-0000-4000-8000-000000000002" ? "Globex" : "Initech";
    await db.query("INSERT INTO naive_members VALUES ($1, $2, $3, $4, $5, $6, $7)", [c.ContactId, c.New_MemberNo, c.FullName, c.EMailAddress1, c.BirthDate, status, employer]);
  }
  // @odata.nextLink is ignored: the first page is taken for the whole list
  return { rows: page.value.length, nextLinkIgnored: Boolean(page["@odata.nextLink"]), fields: Object.keys(page.value[0]).length };
}
