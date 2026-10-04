// Request and response validation against the spec. The server uses both at runtime; the contract test
// uses checkResponse() on what the running provider actually sent.
import { type Doc, type Operation, describe, operations, validators } from "./spec.js";

export interface Issue {
  where: string;
  message: string;
}

export interface Incoming {
  method: string;
  path: string;
  query: URLSearchParams;
  contentType?: string;
  rawBody?: string;
}

export interface Matched {
  op: Operation;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body?: unknown;
}

export interface Outgoing {
  status: number;
  headers: Record<string, string>; // lower-case names
  contentType?: string;
  body?: unknown;
}

// "body/items/0/amount must be number" twelve times reads better as one line with "items/*" and a count.
export function summarise(issues: Issue[]): string[] {
  const counts = new Map<string, number>();
  for (const i of issues) {
    const line = `${i.where.replace(/\/\d+(?=\/|$)/g, "/*")} ${i.message}`;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts].map(([line, n]) => (n > 1 ? `${line} (x${n})` : line));
}

export function contract(doc: Doc) {
  const ops = operations(doc);
  const strict = validators(doc);
  const coercing = validators(doc, { coerceTypes: true }); // query strings are text: "12" must pass as integer 12
  const wrappers = new Map<unknown, object>();

  // Finds the operation; null when no path matches, "method" when the path exists with another method.
  function match(method: string, path: string): { op: Operation; params: Record<string, string> } | null | "method" {
    let pathMatched = false;
    for (const op of ops) {
      const m = op.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (op.method !== method) continue;
      const params: Record<string, string> = {};
      op.pathNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      return { op, params };
    }
    return pathMatched ? "method" : null;
  }

  function checkRequest(op: Operation, params: Record<string, string>, req: Incoming): { matched?: Matched; issues: Issue[] } {
    const issues: Issue[] = [];
    for (const p of op.parameters.filter((p) => p.in === "path")) {
      const v = coercing.compile(p.schema);
      if (!v(params[p.name])) issues.push(...describe(v, `path.${p.name}`));
    }
    const query: Record<string, unknown> = {};
    const declared = new Set(op.parameters.filter((p) => p.in === "query").map((p) => p.name));
    for (const name of new Set(req.query.keys())) if (!declared.has(name)) issues.push({ where: `query.${name}`, message: "is not a parameter of this operation" });
    for (const p of op.parameters.filter((p) => p.in === "query")) {
      const raw = req.query.get(p.name);
      if (raw === null) {
        if (p.required) issues.push({ where: `query.${p.name}`, message: "is required" });
        else if (p.schema?.default !== undefined) query[p.name] = p.schema.default;
        continue;
      }
      // Ajv coerces in place inside an object, so validate a wrapper to get the coerced value back.
      if (!wrappers.has(p.schema)) wrappers.set(p.schema, { type: "object", properties: { value: p.schema } });
      const v = coercing.compile(wrappers.get(p.schema));
      const holder = { value: raw as unknown };
      if (!v(holder)) issues.push(...describe(v, `query.${p.name}`).map((i) => ({ ...i, where: i.where.replace("/value", "") })));
      else query[p.name] = holder.value;
    }
    let body: unknown;
    if (op.requestBody) {
      const media = op.requestBody.content["application/json"];
      if (!req.rawBody) {
        if (op.requestBody.required) issues.push({ where: "body", message: "is required" });
      } else if (!req.contentType?.startsWith("application/json")) {
        issues.push({ where: "header.content-type", message: "must be application/json" });
      } else {
        try {
          body = JSON.parse(req.rawBody);
          const v = strict.compile(media.schema);
          if (!v(body)) issues.push(...describe(v, "body"));
        } catch {
          issues.push({ where: "body", message: "is not valid JSON" });
        }
      }
    }
    return issues.length ? { issues } : { issues, matched: { op, params, query, body } };
  }

  // Everything a consumer may rely on: a documented status, its media type, a body that matches the
  // schema (closed objects reject undocumented fields), and every required header.
  function checkResponse(op: Operation, res: Outgoing): Issue[] {
    const issues: Issue[] = [];
    const doc = op.responses[String(res.status)] ?? op.responses[`${String(res.status)[0]}XX`] ?? op.responses.default;
    if (!doc) return [{ where: "status", message: `${res.status} is not documented for ${op.operationId} (documented: ${Object.keys(op.responses).join(", ")})` }];
    for (const [name, h] of Object.entries(doc.headers ?? {})) {
      const value = res.headers[name.toLowerCase()];
      if (value === undefined) {
        if (h.required) issues.push({ where: `header.${name}`, message: "is required but missing" });
        continue;
      }
      const v = strict.compile(h.schema);
      if (!v(value)) issues.push(...describe(v, `header.${name}`));
    }
    const types = Object.keys(doc.content ?? {});
    if (types.length === 0) {
      if (res.body !== undefined && res.body !== "") issues.push({ where: "body", message: "this response is documented without a body" });
      return issues;
    }
    const type = (res.contentType ?? "").split(";")[0].trim();
    if (!types.includes(type)) return [...issues, { where: "header.content-type", message: `${type || "(none)"} is not one of ${types.join(", ")}` }];
    const v = strict.compile(doc.content![type].schema);
    if (!v(res.body)) issues.push(...describe(v, "body"));
    return issues;
  }

  return { ops, match, checkRequest, checkResponse };
}

export type Contract = ReturnType<typeof contract>;
