// Validates the three pipeline files: YAML syntax (no duplicate keys, no YAML warnings) and each platform's published JSON schema.
// usage: tsx scripts/validate.ts   (downloads the schemas with curl into .cache/schemas the first time)
import { Ajv, type ErrorObject } from "ajv";
import addFormatsModule from "ajv-formats";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { parseDocument } from "yaml";

const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

export const SCHEMAS = {
  gitlab: { file: ".gitlab-ci.yml", url: "https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/assets/javascripts/editor/schema/ci.json", name: "GitLab ci.json" },
  github: { file: "github-actions/ci.yml", url: "https://json.schemastore.org/github-workflow.json", name: "SchemaStore github-workflow.json" },
  azure: { file: "azure-pipelines.yml", url: "https://raw.githubusercontent.com/microsoft/azure-pipelines-vscode/main/service-schema.json", name: "azure-pipelines-vscode service-schema.json" },
} as const;
export type Platform = keyof typeof SCHEMAS;

function schema(platform: Platform) {
  const path = `.cache/schemas/${platform}.json`;
  if (!existsSync(path)) {
    mkdirSync(".cache/schemas", { recursive: true });
    const r = spawnSync("curl", ["-fsSL", "-o", path, SCHEMAS[platform].url], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`could not download ${SCHEMAS[platform].url}: ${r.stderr}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

// Azure Pipelines reads every scalar as a string (true, 22.x and 1 alike), and its schema says so: booleans are the strings
// "true"/"false"/"yes"/"no" and so on. The other two platforms keep YAML types.
const stringify = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stringify) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stringify(x)])) : v === null ? v : String(v);

// The published Azure schema (v1.261.1) lists PublishCodeCoverageResults@2 as a task name but only carries the inputs of @1,
// which Microsoft deprecated; without this patch every @2 step fails. The inputs are those of the task's documentation.
export const AZURE_PATCH = "PublishCodeCoverageResults@2 inputs added (summaryFileLocation, pathToSources, failIfCoverageEmpty)";
function patchAzure(s: { definitions: { task: { anyOf: unknown[] } } }) {
  s.definitions.task.anyOf.push({
    properties: {
      task: { pattern: "^PublishCodeCoverageResults@2$" },
      inputs: { properties: { summaryFileLocation: { type: "string" }, pathToSources: { type: "string" }, failIfCoverageEmpty: { type: "string" } }, additionalProperties: false, required: ["summaryFileLocation"] },
    },
    required: ["task", "inputs"],
  });
}

const validators = new Map<Platform, ReturnType<Ajv["compile"]>>();
function validator(platform: Platform) {
  if (!validators.has(platform)) {
    // strict: false so ajv ignores the schemas' own keywords (Azure: ignoreCase, firstProperty, deprecationMessage; GitLab: markdownDescription);
    // unicodeRegExp: false because the Azure schema's patterns escape characters (\:) that a /u regex rejects
    const ajv = addFormats(new Ajv({ strict: false, allErrors: true, unicodeRegExp: false }));
    const s = schema(platform);
    delete s.$schema;
    if (platform === "azure") patchAzure(s);
    validators.set(platform, ajv.compile(s));
  }
  return validators.get(platform)!;
}

// anyOf/oneOf schemas report every branch that failed; the useful error is the most specific one, such as an unknown key.
const best = (errors: ErrorObject[]) =>
  [...errors].sort((a, b) => Number(b.keyword === "additionalProperties") - Number(a.keyword === "additionalProperties") || b.instancePath.length - a.instancePath.length)[0];
const describe = (e: ErrorObject) => `${e.instancePath || "/"} ${e.message}${e.keyword === "additionalProperties" ? ` '${(e.params as { additionalProperty: string }).additionalProperty}'` : ""}`;

export function validate(platform: Platform, text = readFileSync(SCHEMAS[platform].file, "utf8")) {
  const doc = parseDocument(text, { uniqueKeys: true });
  const yaml = [...doc.errors, ...doc.warnings].map((e) => e.message.split("\n")[0]);
  if (yaml.length) return { yaml, errors: [] as string[], version: "" };
  const s = schema(platform);
  const data = platform === "azure" ? stringify(doc.toJS()) : doc.toJS();
  const check = validator(platform);
  const ok = check(data);
  const errors = ok ? [] : (check.errors ?? []);
  return { yaml, errors: errors.length ? [describe(best(errors)), ...errors.map(describe)] : [], count: errors.length, version: /^v\d/.test(s.$comment ?? "") ? s.$comment : "" };
}

if (process.argv[1]?.endsWith("validate.ts")) {
  let failed = false;
  for (const platform of Object.keys(SCHEMAS) as Platform[]) {
    const r = validate(platform);
    failed ||= r.yaml.length > 0 || r.errors.length > 0;
    console.log(`${SCHEMAS[platform].file.padEnd(22)} yaml ${r.yaml.length ? r.yaml.join("; ") : "ok"}, ${SCHEMAS[platform].name} ${r.version} ${r.errors.length ? `${r.count} error(s), e.g. ${r.errors[0]}` : "valid"}`);
  }
  process.exitCode = failed ? 1 : 0;
}
