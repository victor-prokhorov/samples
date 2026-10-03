// One or more calls per operation. The test refuses to pass if an operation in the spec has no success case,
// so adding an endpoint to the spec without a case here fails the build.
export interface Case {
  operationId: string;
  name: string;
  path: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  token?: string | null; // null: no Authorization header
  expect: number;
}

export const cases: Case[] = [
  { operationId: "listEmployerMembers", name: "Acme's members", path: { employerId: "acme" }, expect: 200 },
  { operationId: "listEmployerMembers", name: "only the retired ones", path: { employerId: "globex" }, query: { status: "retired" }, expect: 200 },
  { operationId: "listEmployerMembers", name: "an employer the spec does not list", path: { employerId: "umbrella" }, expect: 400 },
  { operationId: "getMember", name: "a member", path: { memberId: "M0001" }, expect: 200 },
  { operationId: "getMember", name: "without a token", path: { memberId: "M0001" }, token: null, expect: 401 },
  { operationId: "getMember", name: "an id with the wrong shape", path: { memberId: "1" }, expect: 400 },
  { operationId: "getMember", name: "a member who does not exist", path: { memberId: "M0999" }, expect: 404 },
  { operationId: "listMemberContributions", name: "the deprecated endpoint still answers, with its sunset", path: { memberId: "M0001" }, expect: 200 },
  { operationId: "listContributions", name: "first page", path: {}, query: { memberId: "M0001", limit: "5" }, expect: 200 },
  { operationId: "listContributions", name: "a limit above the maximum", path: {}, query: { memberId: "M0001", limit: "99" }, expect: 400 },
  { operationId: "listContributions", name: "a parameter the spec does not have", path: {}, query: { memberId: "M0001", year: "2026" }, expect: 400 },
  { operationId: "createChangeRequest", name: "a new email", path: { memberId: "M0002" }, body: { kind: "email", value: "bruno.petit@example.net", effectiveDate: "2026-11-01" }, expect: 201 },
  { operationId: "createChangeRequest", name: "the same kind again while pending", path: { memberId: "M0002" }, body: { kind: "email", value: "b.petit@example.net", effectiveDate: "2026-11-01" }, expect: 409 },
  { operationId: "createChangeRequest", name: "a kind the spec does not allow, and an extra field", path: { memberId: "M0002" }, body: { kind: "phone", value: "+33 1 23 45 67 89", effectiveDate: "2026-11-01", urgent: true }, expect: 400 },
  { operationId: "getChangeRequest", name: "the request just created", path: { changeRequestId: "CR0001" }, expect: 200 },
  { operationId: "getChangeRequest", name: "one that does not exist", path: { changeRequestId: "CR9999" }, expect: 404 },
];
