import { readFileSync } from "node:fs";

type Tag = { name: string };
type Row = { id: string; cells: { value: string }[] };
type Child = { rule?: { name: string; tags: Tag[]; children: Child[] }; scenario?: { id: string; examples: { tableBody: Row[] }[] } };
type Envelope = {
  gherkinDocument?: { feature: { children: Child[] } };
  pickle?: { id: string; name: string; tags: Tag[]; astNodeIds: string[] };
  testCase?: { id: string; pickleId: string };
  testCaseStarted?: { id: string; testCaseId: string };
  testStepFinished?: { testCaseStartedId: string; testStepResult: { status: string } };
};

export type Requirement = { id: string; text: string };
export type Result = { requirements: string[]; scenario: string; status: string };

const WORST = ["PASSED", "SKIPPED", "PENDING", "UNDEFINED", "AMBIGUOUS", "FAILED"];
const isReq = (t: Tag) => /^@REQ-\d+$/.test(t.name);

// Reads a Cucumber messages file (--format message:FILE): the rules tagged @REQ-xx and every scenario's worst step status.
export function readRun(file: string) {
  const envelopes: Envelope[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const requirements: Requirement[] = [];
  const rows = new Map<string, string>();
  const pickles = new Map<string, NonNullable<Envelope["pickle"]>>();
  const testCases = new Map<string, string>();
  const started = new Map<string, string>();
  const status = new Map<string, string>();
  for (const e of envelopes) {
    if (e.gherkinDocument) {
      for (const child of e.gherkinDocument.feature.children) {
        if (!child.rule) continue;
        for (const t of child.rule.tags.filter(isReq)) requirements.push({ id: t.name.slice(1), text: child.rule.name });
        for (const c of child.rule.children)
          for (const ex of c.scenario?.examples ?? []) for (const r of ex.tableBody) rows.set(r.id, r.cells.map((x) => x.value).join(", "));
      }
    }
    if (e.pickle) pickles.set(e.pickle.id, e.pickle);
    if (e.testCase) testCases.set(e.testCase.id, e.testCase.pickleId);
    if (e.testCaseStarted) started.set(e.testCaseStarted.id, testCases.get(e.testCaseStarted.testCaseId)!);
    if (e.testStepFinished) {
      const pickleId = started.get(e.testStepFinished.testCaseStartedId)!;
      const s = e.testStepFinished.testStepResult.status;
      const prev = status.get(pickleId) ?? "PASSED";
      status.set(pickleId, WORST.indexOf(s) > WORST.indexOf(prev) ? s : prev);
    }
  }
  const results: Result[] = [...pickles.values()].map((p) => {
    const example = p.astNodeIds.slice(1).map((id) => rows.get(id)).filter(Boolean);
    return {
      requirements: p.tags.filter(isReq).map((t) => t.name.slice(1)),
      scenario: example.length ? `${p.name} [${example.join("; ")}]` : p.name,
      status: (status.get(p.id) ?? "NOT RUN").toLowerCase(),
    };
  });
  return { requirements, results };
}

export function matrix(requirements: Requirement[], results: Result[]) {
  return requirements.map((r) => {
    const mine = results.filter((x) => x.requirements.includes(r.id));
    const failed = mine.filter((x) => x.status !== "passed").length;
    return { ...r, scenarios: mine, verdict: mine.length === 0 ? "NOT COVERED" : failed ? `FAILING (${failed}/${mine.length})` : `passing (${mine.length})` };
  });
}

export function printMatrix(rows: ReturnType<typeof matrix>) {
  const w = Math.max(...rows.flatMap((r) => r.scenarios.map((s) => s.scenario.length)));
  console.log(`   ${"req".padEnd(7)}| ${"scenario".padEnd(w)} | result`);
  console.log(`   ${"-".repeat(7)}+-${"-".repeat(w)}-+-------`);
  for (const r of rows) {
    console.log(`   ${r.id.padEnd(7)}| ${r.text}  => ${r.verdict}`);
    for (const s of r.scenarios) console.log(`   ${"".padEnd(7)}| ${s.scenario.padEnd(w)} | ${s.status}`);
  }
}
