// A small OData v4 query engine for the fake CRM: $filter, $select, $orderby, $top, $count and
// server-driven paging (Prefer: odata.maxpagesize, @odata.nextLink with an opaque $skiptoken).
// The subset is what CRM integrations really use; anything else is answered with 400, as a real server does.

export type Row = Record<string, unknown>;
export class ODataError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ---------- $filter ----------
// expr := and ('or' and)* ; and := unary ('and' unary)* ; unary := 'not' unary | '(' expr ')' | cmp
// cmp := Field op literal | startswith(Field,'x') | contains(Field,'x') ; op := eq ne gt ge lt le
type Node =
  | { t: "or" | "and"; l: Node; r: Node }
  | { t: "not"; e: Node }
  | { t: "cmp"; field: string; op: string; value: unknown }
  | { t: "fn"; fn: string; field: string; value: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") i++;
    else if (c === "(" || c === ")" || c === ",") out.push(s[i++]);
    else if (c === "'") {
      let j = i + 1;
      let v = "";
      for (;;) {
        if (j >= s.length) throw new ODataError(400, "0x80060888", "Syntax error: unterminated string literal");
        if (s[j] === "'" && s[j + 1] === "'") (v += "'"), (j += 2);
        else if (s[j] === "'") break;
        else v += s[j++];
      }
      out.push(`'${v}`); // a leading quote marks a string token
      i = j + 1;
    } else {
      let j = i;
      while (j < s.length && !" (),'".includes(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
    }
  }
  return out;
}

export function parseFilter(src: string, fields: Set<string>): Node {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const next = () => tk[p++];
  const expect = (t: string) => {
    if (next() !== t) throw new ODataError(400, "0x80060888", `Syntax error at position ${p} in '${src}': expected '${t}'`);
  };
  const field = (name: string | undefined) => {
    if (!name || !fields.has(name)) throw new ODataError(400, "0x80060888", `Could not find a property named '${name}' on type 'Microsoft.Dynamics.CRM.entity'.`);
    return name;
  };
  const literal = (t: string | undefined): unknown => {
    if (t === undefined) throw new ODataError(400, "0x80060888", "Syntax error: missing literal");
    if (t.startsWith("'")) return t.slice(1);
    if (t === "null") return null;
    if (t === "true" || t === "false") return t === "true";
    if (ISO.test(t) || GUID.test(t) || DATE.test(t)) return t;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    throw new ODataError(400, "0x80060888", `Syntax error: '${t}' is not a valid literal`);
  };
  const unary = (): Node => {
    const t = peek();
    if (t === "not") return next(), { t: "not", e: unary() };
    if (t === "(") {
      next();
      const e = or();
      expect(")");
      return e;
    }
    if (t === "startswith" || t === "contains") {
      next();
      expect("(");
      const f = field(next());
      expect(",");
      const v = literal(next());
      expect(")");
      return { t: "fn", fn: t, field: f, value: String(v) };
    }
    const f = field(next());
    const op = next();
    if (!op || !["eq", "ne", "gt", "ge", "lt", "le"].includes(op)) throw new ODataError(400, "0x80060888", `Syntax error: unknown operator '${op}'`);
    return { t: "cmp", field: f, op, value: literal(next()) };
  };
  const and = (): Node => {
    let l = unary();
    while (peek() === "and") (next(), (l = { t: "and", l, r: unary() }));
    return l;
  };
  const or = (): Node => {
    let l = and();
    while (peek() === "or") (next(), (l = { t: "or", l, r: and() }));
    return l;
  };
  const tree = or();
  if (p !== tk.length) throw new ODataError(400, "0x80060888", `Syntax error: unexpected '${tk[p]}'`);
  return tree;
}

// Dates compare as instants, GUIDs case-insensitively, the rest as plain values.
export function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "string" && typeof b === "string") {
    if (ISO.test(a) && ISO.test(b)) return Date.parse(a) - Date.parse(b);
    const x = GUID.test(a) ? a.toLowerCase() : a;
    const y = GUID.test(b) ? b.toLowerCase() : b;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}

export function matches(n: Node, row: Row): boolean {
  switch (n.t) {
    case "or":
      return matches(n.l, row) || matches(n.r, row);
    case "and":
      return matches(n.l, row) && matches(n.r, row);
    case "not":
      return !matches(n.e, row);
    case "fn": {
      const v = String(row[n.field] ?? "").toLowerCase();
      return n.fn === "startswith" ? v.startsWith(n.value.toLowerCase()) : v.includes(n.value.toLowerCase());
    }
    case "cmp": {
      const v = row[n.field];
      if (n.value === null) return n.op === "eq" ? v === null || v === undefined : n.op === "ne" ? v !== null && v !== undefined : false;
      if (v === null || v === undefined) return n.op === "ne";
      const c = compare(v, n.value);
      return { eq: c === 0, ne: c !== 0, gt: c > 0, ge: c >= 0, lt: c < 0, le: c <= 0 }[n.op as "eq"];
    }
  }
}

// ---------- $orderby and the paging token ----------
export type Order = { field: string; desc: boolean }[];

export function parseOrderBy(src: string | null, fields: Set<string>, key: string): Order {
  const order: Order = [];
  for (const part of (src ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [f, dir = "asc"] = part.split(/\s+/);
    if (!fields.has(f) || !["asc", "desc"].includes(dir)) throw new ODataError(400, "0x80060888", `Invalid $orderby clause '${part}'`);
    order.push({ field: f, desc: dir === "desc" });
  }
  // the primary key is always the last sort key, so the order is total and a page boundary is exact
  if (!order.some((o) => o.field === key)) order.push({ field: key, desc: false });
  return order;
}

export const sortRows = (rows: Row[], order: Order) =>
  rows.sort((a, b) => {
    for (const o of order) {
      const c = compare(a[o.field], b[o.field]);
      if (c !== 0) return o.desc ? -c : c;
    }
    return 0;
  });

// The skiptoken is a keyset cursor: the sort-key values of the last row served, plus how many rows
// were served so far (for $top). Rows inserted or changed behind the cursor do not shift later pages.
export type Cursor = { after: unknown[]; served: number };
export const encodeToken = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeToken(t: string): Cursor {
  try {
    return JSON.parse(Buffer.from(t, "base64url").toString());
  } catch {
    throw new ODataError(400, "0x80060888", "Invalid $skiptoken");
  }
}
export function isAfter(row: Row, order: Order, after: unknown[]): boolean {
  for (const [i, o] of order.entries()) {
    const c = compare(row[o.field], after[i]);
    if (c !== 0) return o.desc ? c < 0 : c > 0;
  }
  return false;
}
