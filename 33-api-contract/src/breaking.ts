// Compares two revisions of the spec from the consumer's side and lists what would break a client written
// against the old one. Exit code 1 when anything is breaking, so CI can refuse the change.
//   tsx src/breaking.ts openapi/v1.yaml openapi/v2.yaml
// The rules are a small subset of what oasdiff checks; see the README.
import { pathToFileURL } from "node:url";
import { type Doc, type Json, type Operation, deref, loadSpec, operations } from "./spec.js";

export interface Finding {
  level: "breaking" | "ok";
  where: string;
  what: string;
}

const types = (s: Json): string[] => (s.type === undefined ? [] : [s.type].flat().sort());

// direction "response": the provider sends, the consumer reads. Removing or loosening what the consumer reads breaks it.
// direction "request": the consumer sends, the provider reads. Demanding more than before breaks it.
function compareSchema(a: Doc, b: Doc, oldS: Json, newS: Json, where: string, direction: "request" | "response", out: Finding[]) {
  oldS = deref(a, oldS);
  newS = deref(b, newS);
  if (!oldS || !newS) return;
  const [ot, nt] = [types(oldS), types(newS)];
  if (ot.length && nt.length && ot.join("|") !== nt.join("|")) {
    const widened = direction === "request" ? ot.every((t) => nt.includes(t)) : nt.every((t) => ot.includes(t));
    out.push({ level: widened ? "ok" : "breaking", where, what: `type ${ot.join("|")} -> ${nt.join("|")}` });
    if (!widened) return;
  }
  if (direction === "request" && Array.isArray(oldS.enum) && Array.isArray(newS.enum)) {
    const dropped = oldS.enum.filter((v: unknown) => !newS.enum.includes(v));
    if (dropped.length) out.push({ level: "breaking", where, what: `no longer accepts ${dropped.join(", ")}` });
  }
  const oldProps = oldS.properties ?? {};
  const newProps = newS.properties ?? {};
  const oldReq = new Set<string>(oldS.required ?? []);
  const newReq = new Set<string>(newS.required ?? []);
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      if (direction === "response") out.push({ level: "breaking", where: `${where}.${name}`, what: "removed from the response" });
      else if (newS.additionalProperties === false || newS.unevaluatedProperties === false) out.push({ level: "breaking", where: `${where}.${name}`, what: "no longer accepted in the request" });
      continue;
    }
    if (direction === "response" && oldReq.has(name) && !newReq.has(name)) out.push({ level: "breaking", where: `${where}.${name}`, what: "was always sent, now optional" });
    compareSchema(a, b, oldProps[name], newProps[name], `${where}.${name}`, direction, out);
  }
  for (const name of Object.keys(newProps)) {
    if (name in oldProps) continue;
    if (direction === "request" && newReq.has(name)) out.push({ level: "breaking", where: `${where}.${name}`, what: "added and required in the request" });
    else out.push({ level: "ok", where: `${where}.${name}`, what: `added (${direction === "response" ? "tolerant readers ignore it" : "optional"})` });
  }
  if (direction === "request") for (const name of newReq) if (name in oldProps && !oldReq.has(name)) out.push({ level: "breaking", where: `${where}.${name}`, what: "now required in the request" });
  if (oldS.items && newS.items) compareSchema(a, b, oldS.items, newS.items, `${where}[]`, direction, out);
}

export function diff(a: Doc, b: Doc): Finding[] {
  const out: Finding[] = [];
  const key = (o: Operation) => `${o.method} ${o.path}`;
  const before = new Map(operations(a).map((o) => [key(o), o]));
  const after = new Map(operations(b).map((o) => [key(o), o]));
  for (const [k, o] of before) {
    const n = after.get(k);
    if (!n) {
      out.push({ level: "breaking", where: k, what: "operation removed" });
      continue;
    }
    if (n.deprecated && !o.deprecated) out.push({ level: "ok", where: k, what: "deprecated (still served until its Sunset date)" });
    for (const p of n.parameters) {
      const was = o.parameters.find((q) => q.name === p.name && q.in === p.in);
      if (p.required && !was?.required) out.push({ level: "breaking", where: `${k} ${p.in}.${p.name}`, what: was ? "parameter became required" : "new required parameter" });
      else if (!was) out.push({ level: "ok", where: `${k} ${p.in}.${p.name}`, what: "new optional parameter" });
      else compareSchema(a, b, was.schema, p.schema, `${k} ${p.in}.${p.name}`, "request", out);
    }
    const ob = o.requestBody?.content["application/json"]?.schema;
    const nb = n.requestBody?.content["application/json"]?.schema;
    if (ob && nb) compareSchema(a, b, ob, nb, `${k} body`, "request", out);
    for (const [status, r] of Object.entries(o.responses)) {
      const nr = n.responses[status];
      if (!nr) {
        if (status.startsWith("2")) out.push({ level: "breaking", where: `${k} ${status}`, what: "success response removed" });
        continue;
      }
      for (const [type, media] of Object.entries(r.content ?? {})) {
        const nm = nr.content?.[type];
        if (!nm) out.push({ level: "breaking", where: `${k} ${status}`, what: `no longer returns ${type}` });
        else compareSchema(a, b, media.schema, nm.schema, `${k} ${status} body`, "response", out);
      }
    }
  }
  for (const k of after.keys()) if (!before.has(k)) out.push({ level: "ok", where: k, what: "operation added" });
  return out;
}

export function report(oldFile: string, newFile: string): { findings: Finding[]; breaking: number } {
  const findings = diff(loadSpec(oldFile), loadSpec(newFile));
  const breaking = findings.filter((f) => f.level === "breaking").length;
  console.log(`   ${oldFile} (${loadSpec(oldFile).info.version}) -> ${newFile} (${loadSpec(newFile).info.version})`);
  for (const f of [...findings].sort((x, y) => (x.level === y.level ? 0 : x.level === "breaking" ? -1 : 1))) console.log(`     ${f.level === "breaking" ? "BREAKING" : "ok      "}  ${f.where}: ${f.what}`);
  console.log(`   ${breaking} breaking, ${findings.length - breaking} compatible`);
  return { findings, breaking };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [oldFile, newFile] = process.argv.slice(2);
  if (!oldFile || !newFile) {
    console.error("usage: tsx src/breaking.ts <old.yaml> <new.yaml>");
    process.exit(2);
  }
  process.exitCode = report(oldFile, newFile).breaking ? 1 : 0;
}
