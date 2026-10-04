// The spec is the source of truth: the server's router, the request and response validators,
// the contract test and the breaking-change check all read the same YAML file.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;
export type Doc = Json;

export const METHODS = ["get", "put", "post", "patch", "delete"] as const;

export interface Parameter {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  schema: Json;
}

export interface Operation {
  operationId: string;
  method: string; // upper case
  path: string; // the template, /members/{memberId}
  pattern: RegExp; // matches a concrete path, one group per path parameter
  pathNames: string[];
  parameters: Parameter[];
  requestBody?: { required?: boolean; content: Record<string, { schema: Json }> };
  responses: Record<string, Response>;
  deprecated: boolean;
}

export interface Response {
  description: string;
  headers?: Record<string, { required?: boolean; schema: Json }>;
  content?: Record<string, { schema: Json }>;
}

export function loadSpec(file: string): Doc {
  return parse(readFileSync(file, "utf8"));
}

// Follows a local "#/a/b/c" $ref inside the document (parameters, responses, schemas).
export function deref(doc: Doc, node: Json): Json {
  while (node && typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
    node = node.$ref
      .slice(2)
      .split("/")
      .reduce((n: Json, key: string) => n?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
  }
  return node;
}

export function operations(doc: Doc): Operation[] {
  const ops: Operation[] = [];
  for (const [path, item] of Object.entries<Json>(doc.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const parameters = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p: Json) => deref(doc, p) as Parameter);
      const responses: Record<string, Response> = {};
      for (const [status, r] of Object.entries<Json>(op.responses ?? {})) responses[status] = deref(doc, r);
      const pathNames = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const pattern = new RegExp("^" + path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{[^}]+\\?\}/g, "([^/]+)") + "$");
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        pattern,
        pathNames,
        parameters,
        requestBody: op.requestBody ? deref(doc, op.requestBody) : undefined,
        responses,
        deprecated: op.deprecated === true,
      });
    }
  }
  return ops;
}

// JSON Schema 2020-12 (what OpenAPI 3.1 uses) compiled with Ajv. Component schemas are registered once
// under their own $id, and every "#/components/schemas/X" reference is rewritten to point at it.
const BASE = "https://contract.local/schemas/";

function rewriteRefs(node: Json): Json {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "$ref" && typeof v === "string" && v.startsWith("#/components/schemas/") ? BASE + v.slice("#/components/schemas/".length) : rewriteRefs(v);
  }
  return out;
}

export interface Validators {
  compile(schema: Json): ValidateFunction;
}

export function validators(doc: Doc, opts: { coerceTypes?: boolean } = {}): Validators {
  const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: opts.coerceTypes ?? false });
  addFormats(ajv);
  for (const [name, schema] of Object.entries<Json>(doc.components?.schemas ?? {})) ajv.addSchema({ ...rewriteRefs(schema), $id: BASE + name });
  const cache = new Map<Json, ValidateFunction>();
  return {
    compile(schema) {
      let fn = cache.get(schema);
      if (!fn) cache.set(schema, (fn = ajv.compile(rewriteRefs(schema))));
      return fn;
    },
  };
}

// Ajv errors as "where: message", where is a JSON pointer into the instance (body/items/0/amount).
export function describe(fn: ValidateFunction, prefix: string): { where: string; message: string }[] {
  return (fn.errors ?? []).map((e) => {
    const extra = e.keyword === "unevaluatedProperties" ? ` (${(e.params as { unevaluatedProperty: string }).unevaluatedProperty})` : e.keyword === "additionalProperties" ? ` (${(e.params as { additionalProperty: string }).additionalProperty})` : "";
    return { where: prefix + e.instancePath, message: `${e.message}${extra}` };
  });
}
