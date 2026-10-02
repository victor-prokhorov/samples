import { scryptSync } from "node:crypto";
import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { KINDS, checkRequest } from "./rules.js";
import { issue, verify } from "./session.js";

export type Options = { pool: pg.Pool; apiDelayMs?: number; markup?: "v1" | "v2"; today?: () => string };

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2 });

function page(title: string, body: string, signedIn = true) {
  const nav = signedIn
    ? `<nav aria-label="Main"><a href="/contributions">Contributions</a> <a href="/requests/new">Request a change</a> <a href="/requests">Your requests</a>
       <form method="post" action="/logout" style="display:inline"><button>Sign out</button></form></nav>`
    : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} - Member portal</title></head>
<body><header>Member portal ${nav}</header><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
}

function loginForm(markup: "v1" | "v2", error?: string) {
  const alert = error ? `<p role="alert">${esc(error)}</p>` : "";
  if (markup === "v1") {
    return `${alert}<form id="login-form" method="post" action="/login">
      <div><label for="username">Username</label><input id="username" name="username" autocomplete="username"></div>
      <div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn-primary">Sign in</button></form>`;
  }
  // The same form after a design-system refactor: same labels and button text, different structure and classes.
  return `${alert}<form class="stack" method="post" action="/login">
      <p class="intro">Use the account your employer registered for you.</p>
      <div class="field"><label>Username <input name="username" autocomplete="username"></label></div>
      <div class="field"><label>Password <input name="password" type="password" autocomplete="current-password"></label></div>
      <div class="actions"><button class="button button--primary">Sign in</button></div></form>`;
}

async function readForm(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}

const hash = (password: string) => scryptSync(password, "sample-salt", 32).toString("hex");

export function createApp(o: Options) {
  const { pool } = o;
  const markup = o.markup ?? "v1";
  const today = o.today ?? (() => new Date().toISOString().slice(0, 10));

  async function requestForm(memberId: number, values: Record<string, string>, errors: string[]) {
    const alert = errors.length ? `<div role="alert"><h2>There is a problem</h2><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
    const options = KINDS.map((k) => `<option value="${k}"${values.kind === k ? " selected" : ""}>${k === "address" ? "Postal address" : "Email address"}</option>`).join("");
    return page(
      "Request a change",
      `${alert}<form method="post" action="/requests">
        <label for="kind">What do you want to change?</label><select id="kind" name="kind">${options}</select>
        <label for="value">New value</label><input id="value" name="value" value="${esc(values.value ?? "")}">
        <label for="effective">Effective from</label><input id="effective" name="effectiveFrom" type="date" value="${esc(values.effectiveFrom ?? today())}">
        <button>Submit request</button></form>`,
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const html = (status: number, body: string) => res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
    const redirect = (location: string, headers: Record<string, string> = {}) => res.writeHead(303, { location, ...headers }).end();
    const key = `${req.method} ${path}`;

    if (key === "GET /login") return html(200, page("Sign in", loginForm(markup), false));
    if (key === "POST /login") {
      const f = await readForm(req);
      const { rows } = await pool.query("SELECT id FROM members WHERE username = $1 AND password_hash = $2", [f.get("username"), hash(f.get("password") ?? "")]);
      if (!rows.length) return html(401, page("Sign in", loginForm(markup, "Wrong username or password"), false));
      return redirect("/contributions", { "set-cookie": `sid=${issue(rows[0].id)}; HttpOnly; SameSite=Lax; Path=/` });
    }

    const memberId = verify(req.headers.cookie);
    if (memberId === null) return path.startsWith("/api/") ? res.writeHead(401).end() : redirect("/login");

    if (key === "POST /logout") return redirect("/login", { "set-cookie": "sid=; Max-Age=0; Path=/" });
    if (key === "GET /" || key === "GET /contributions") {
      const { rows: who } = await pool.query("SELECT m.full_name, e.name AS employer FROM members m JOIN employers e ON e.id = m.employer_id WHERE m.id = $1", [memberId]);
      const { rows } = await pool.query("SELECT to_char(month, 'Mon YYYY') AS month, amount FROM contributions WHERE member_id = $1 ORDER BY contributions.month", [memberId]);
      const trs = rows.map((r) => `<tr><td>${esc(r.month)}</td><td>${esc(money(Number(r.amount)))}</td></tr>`).join("");
      return html(
        200,
        page(
          "Your contributions",
          `<p>${esc(who[0].full_name)}, employed by ${esc(who[0].employer)}</p>
          <table><caption>Monthly contributions</caption><thead><tr><th scope="col">Month</th><th scope="col">Amount</th></tr></thead><tbody>${trs}</tbody></table>
          <p role="status" id="total">Loading total...</p>
          <script>fetch('/api/contributions/total').then((r) => r.json()).then((d) => { document.getElementById('total').textContent = 'Total: ' + d.total; });</script>`,
        ),
      );
    }
    if (key === "GET /api/contributions/total") {
      await sleep(o.apiDelayMs ?? 0);
      const { rows } = await pool.query("SELECT coalesce(sum(amount), 0) AS total FROM contributions WHERE member_id = $1", [memberId]);
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ total: money(Number(rows[0].total)) }));
    }
    if (key === "GET /requests/new") return html(200, await requestForm(memberId, {}, []));
    if (key === "POST /requests") {
      const f = await readForm(req);
      const values = { kind: f.get("kind") ?? "", value: f.get("value") ?? "", effectiveFrom: f.get("effectiveFrom") ?? "" };
      const { rows } = await pool.query("SELECT kind FROM change_requests WHERE member_id = $1 AND status = 'pending'", [memberId]);
      const errors = checkRequest(values, { today: today(), pending: rows.map((r) => r.kind) });
      if (errors.length) return html(422, await requestForm(memberId, values, errors));
      await pool.query("INSERT INTO change_requests (member_id, kind, value, effective_from) VALUES ($1, $2, $3, $4)", [memberId, values.kind, values.value.trim(), values.effectiveFrom]);
      return redirect("/requests");
    }
    if (key === "GET /requests") {
      const { rows } = await pool.query("SELECT kind, value, to_char(effective_from, 'YYYY-MM-DD') AS effective_from, status FROM change_requests WHERE member_id = $1 ORDER BY id", [memberId]);
      const body = rows.length
        ? `<table><caption>Change requests</caption><thead><tr><th scope="col">Change</th><th scope="col">New value</th><th scope="col">From</th><th scope="col">Status</th></tr></thead><tbody>${rows
            .map((r) => `<tr><td>${esc(r.kind)}</td><td>${esc(r.value)}</td><td>${esc(r.effective_from)}</td><td>${r.status === "pending" ? "Pending" : esc(r.status)}</td></tr>`)
            .join("")}</tbody></table>`
        : "<p>You have no requests.</p>";
      return html(200, page("Your requests", body));
    }
    html(404, page("Page not found", ""));
  }

  const inFlight = new Set<Promise<void>>();
  const server = createServer((req, res) => {
    const p: Promise<void> = handle(req, res)
      .then(
        () => undefined,
        (err) => {
          console.error(err);
          if (!res.headersSent) res.writeHead(500).end("internal error");
        },
      )
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
  });
  // Lets a test fixture wait for requests the browser left behind (the delayed total) before it closes the pool.
  return Object.assign(server, { drain: () => Promise.all(inFlight) });
}
