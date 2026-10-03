// The data inventory: every table, every column, what it is, why we hold it and on which lawful basis.
// The export is generated from this map and nothing else, and src/inventory-check.ts fails when the database holds a
// table or column the map does not know. A new column cannot be forgotten in an export: the check stops it first.

export type Basis = "contract" | "consent" | "legal obligation" | "legitimate interests";
export type Category =
  | "identity"
  | "contact details"
  | "government identifier"
  | "employment"
  | "financial"
  | "third parties"
  | "online identifiers"
  | "security"
  | "communications"
  | "consent records"
  | "request history"
  | "legal"
  | "technical";

export interface Column {
  about: string;
  category: Category;
  withheld?: string; // why this column is not given to the member (technical keys are left out without a reason)
}

export interface Table {
  table: string;
  title: string;
  purpose: string;
  basis: Basis;
  basisText: string;
  source: string;
  recipients: string;
  subject: string; // SQL predicate selecting the member's rows, $1 = members.id, the table aliased as t
  orderBy: string;
  withheld?: string; // the whole table is withheld, with the reason
  columns: Record<string, Column>;
}

const key = (about: string): Column => ({ about, category: "technical" });

export const inventory: Table[] = [
  {
    table: "members",
    title: "Membership record",
    purpose: "Run your membership of the scheme: identify you, contact you, compute your rights.",
    basis: "contract",
    basisText: "Contract (art. 6(1)(b)): your membership of the scheme.",
    source: "You, and your employer when you joined.",
    recipients: "Your employer (membership status and dates only).",
    subject: "t.id = $1",
    orderBy: "t.id",
    columns: {
      id: key("internal key"),
      member_no: { about: "your member number", category: "identity" },
      given_name: { about: "given name", category: "identity" },
      family_name: { about: "family name", category: "identity" },
      email: { about: "email address", category: "contact details" },
      phone: { about: "phone number", category: "contact details" },
      birth_date: { about: "date of birth", category: "identity" },
      national_id: { about: "social security number", category: "government identifier" },
      address_line: { about: "street address", category: "contact details" },
      postcode: { about: "postcode", category: "contact details" },
      city: { about: "city", category: "contact details" },
      employer_id: { about: "the employer you joined through", category: "employment" },
      joined_on: { about: "date you joined the scheme", category: "employment" },
      left_on: { about: "date you left the scheme, if you have", category: "employment" },
      anonymised_at: key("when the record was anonymised by the retention job"),
    },
  },
  {
    table: "contributions",
    title: "Contributions",
    purpose: "Record the contributions paid for you, which your benefits are computed from.",
    basis: "contract",
    basisText: "Contract (art. 6(1)(b)); kept afterwards under a legal obligation (art. 6(1)(c)) for pension and tax records.",
    source: "Your employer's monthly contribution files.",
    recipients: "Your employer (reconciliation); the tax authority (yearly statement).",
    subject: "t.member_id = $1",
    orderBy: "t.period",
    columns: {
      id: key("internal key"),
      member_id: key("link to the membership record"),
      period: { about: "month the contribution is for", category: "financial" },
      employer_id: { about: "employer who paid it", category: "employment" },
      amount: { about: "amount in euros", category: "financial" },
      recorded_at: { about: "when we recorded it", category: "financial" },
    },
  },
  {
    table: "bank_accounts",
    title: "Bank account",
    purpose: "Pay your benefits and refunds.",
    basis: "contract",
    basisText: "Contract (art. 6(1)(b)).",
    source: "You.",
    recipients: "Our bank, when a payment is made.",
    subject: "t.member_id = $1",
    orderBy: "t.member_id",
    columns: {
      member_id: key("link to the membership record"),
      iban: { about: "IBAN", category: "financial" },
      holder_name: { about: "account holder's name", category: "financial" },
      updated_at: { about: "when you last changed it", category: "financial" },
    },
  },
  {
    table: "beneficiaries",
    title: "Beneficiaries",
    purpose: "Pay a death benefit to the people you designated.",
    basis: "contract",
    basisText: "Contract (art. 6(1)(b)).",
    source: "You.",
    recipients: "None outside the scheme until a benefit is paid.",
    subject: "t.member_id = $1",
    orderBy: "t.id",
    columns: {
      id: key("internal key"),
      member_id: key("link to the membership record"),
      full_name: { about: "name of the person you designated", category: "third parties" },
      relationship: { about: "their relationship to you", category: "third parties" },
      share_pct: { about: "their share of the benefit, in percent", category: "third parties" },
      birth_date: { about: "their date of birth", category: "third parties", withheld: "Personal data of another person (art. 15(4)): you designated them, so their name and share are shown, but not their date of birth." },
    },
  },
  {
    table: "consents",
    title: "Consents",
    purpose: "Prove what you agreed to and when you withdrew it.",
    basis: "legal obligation",
    basisText: "Legal obligation (art. 6(1)(c) with art. 7(1)): we must be able to show your consent.",
    source: "You, through the portal.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.purpose",
    columns: {
      member_id: key("link to the membership record"),
      purpose: { about: "what the consent is for", category: "consent records" },
      given_at: { about: "when you gave it", category: "consent records" },
      withdrawn_at: { about: "when you withdrew it, if you did", category: "consent records" },
    },
  },
  {
    table: "support_tickets",
    title: "Support requests",
    purpose: "Answer your questions and requests.",
    basis: "contract",
    basisText: "Contract (art. 6(1)(b)).",
    source: "You, and our support staff's answers.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.opened_at",
    columns: {
      id: { about: "ticket number", category: "communications" },
      member_id: key("link to the membership record"),
      opened_at: { about: "when you opened it", category: "communications" },
      closed_at: { about: "when it was closed", category: "communications" },
      subject: { about: "subject", category: "communications" },
      body: { about: "your message", category: "communications" },
      anonymised_at: key("when the ticket was anonymised by the retention job"),
    },
  },
  {
    table: "credentials",
    title: "Sign-in credentials",
    purpose: "Let you sign in securely.",
    basis: "legitimate interests",
    basisText: "Legitimate interests (art. 6(1)(f)): securing your account.",
    source: "You (your password), the portal.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.member_id",
    columns: {
      member_id: key("link to the membership record"),
      password_hash: { about: "a one-way hash of your password", category: "security", withheld: "A secret derived from your password: giving it out would weaken your account's security, and it says nothing about you." },
      updated_at: { about: "when you last changed your password", category: "security" },
    },
  },
  {
    table: "sessions",
    title: "Sign-in sessions",
    purpose: "Keep you signed in, and ask for your password again before sensitive actions.",
    basis: "legitimate interests",
    basisText: "Legitimate interests (art. 6(1)(f)): securing your account.",
    source: "Recorded by the portal when you sign in.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.created_at",
    columns: {
      id_hash: { about: "hash of the session cookie", category: "security", withheld: "A hash of a live credential: it is left out for your account's security." },
      member_id: key("link to the membership record"),
      created_at: { about: "when the session started", category: "online identifiers" },
      auth_time: { about: "when you last typed your password in it", category: "online identifiers" },
      user_agent: { about: "your browser, as it described itself", category: "online identifiers" },
    },
  },
  {
    table: "login_events",
    title: "Sign-in history",
    purpose: "Detect and investigate unauthorised access to your account.",
    basis: "legitimate interests",
    basisText: "Legitimate interests (art. 6(1)(f)): security of the portal.",
    source: "Recorded by the portal when you sign in.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.at",
    columns: {
      id: key("internal key"),
      member_id: key("link to the membership record"),
      at: { about: "when", category: "online identifiers" },
      ip: { about: "the IP address the request came from", category: "online identifiers" },
      user_agent: { about: "your browser, as it described itself", category: "online identifiers" },
      outcome: { about: "success or failure", category: "online identifiers" },
    },
  },
  {
    table: "dsar_requests",
    title: "Your data requests",
    purpose: "Answer your requests about your data, within the legal deadline, and show that we did.",
    basis: "legal obligation",
    basisText: "Legal obligation (art. 6(1)(c) with art. 12 and art. 5(2)).",
    source: "Recorded when you make a request.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.received_at",
    columns: {
      id: { about: "request number", category: "request history" },
      member_id: key("link to the membership record"),
      kind: { about: "what you asked for", category: "request history" },
      received_at: { about: "when we received it", category: "request history" },
      due_on: { about: "the date we must answer by", category: "request history" },
      verified_by: { about: "how we checked it was you", category: "request history" },
      status: { about: "where it stands", category: "request history" },
      completed_at: { about: "when we answered", category: "request history" },
      export_sha256: { about: "SHA-256 of the export we gave you", category: "request history" },
    },
  },
  {
    table: "dsar_events",
    title: "Your data requests: timeline",
    purpose: "Show each step of handling your requests.",
    basis: "legal obligation",
    basisText: "Legal obligation (art. 6(1)(c) with art. 5(2)).",
    source: "Recorded while your request is handled.",
    recipients: "None.",
    subject: "t.request_id IN (SELECT r.id FROM dsar_requests r WHERE r.member_id = $1)",
    orderBy: "t.at, t.id",
    columns: {
      id: key("internal key"),
      request_id: { about: "request number", category: "request history" },
      at: { about: "when", category: "request history" },
      event: { about: "what happened", category: "request history" },
      detail: { about: "details", category: "request history" },
    },
  },
  {
    table: "legal_holds",
    title: "Legal holds",
    purpose: "Keep data beyond its retention period while a legal claim is pending.",
    basis: "legal obligation",
    basisText: "Legal obligation and legal claims (art. 6(1)(c), art. 17(3)(e)).",
    source: "Our legal team.",
    recipients: "None.",
    subject: "t.member_id = $1",
    orderBy: "t.id",
    withheld: "May be restricted while a claim is pending where disclosure would prejudice it (art. 23 and national law); reviewed by the data protection officer case by case.",
    columns: {
      id: key("internal key"),
      member_id: key("link to the membership record"),
      reason: { about: "the claim the hold is for", category: "legal" },
      placed_at: { about: "when the hold was placed", category: "legal" },
      released_at: { about: "when it was released", category: "legal" },
    },
  },
];

// Tables that hold no personal data, each with the reason. The check still scans their columns for names that look personal.
export const notPersonal: Record<string, string> = {
  employers: "organisations, not natural persons",
  retention_policies: "configuration",
  purge_runs: "counts only, no row-level data",
};

export const portable = (t: Table) => t.basis === "contract" || t.basis === "consent";
