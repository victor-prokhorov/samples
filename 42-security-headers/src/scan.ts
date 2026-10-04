// A header scanner in the spirit of Mozilla's HTTP Observatory and securityheaders.com: sign in, fetch the
// account page, and score the response headers and the session cookie out of 100.
export type Finding = { check: string; points: number; max: number; seen: string };

export async function fetchSignedIn(origin: string) {
  const login = await fetch(`${origin}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    body: "name=Scanner",
  });
  const setCookie = login.headers.get("set-cookie") ?? "";
  const page = await fetch(`${origin}/`, { headers: { cookie: setCookie.split(";")[0] } });
  return { headers: page.headers, setCookie };
}

function directive(policy: string, name: string): string | null {
  const d = policy.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "));
  return d ? d.slice(name.length + 1) : null;
}

export function grade(headers: Headers, setCookie: string): { score: number; letter: string; findings: Finding[] } {
  const csp = headers.get("content-security-policy") ?? "";
  const script = directive(csp, "script-src") ?? directive(csp, "default-src") ?? "";
  const hsts = headers.get("strict-transport-security") ?? "";
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
  const cookie = setCookie.toLowerCase();
  const rp = headers.get("referrer-policy") ?? "";
  const f = (check: string, max: number, ok: boolean, seen: string | null): Finding => ({ check, max, points: ok ? max : 0, seen: seen || "(missing)" });
  const findings = [
    f("CSP present", 10, !!csp, csp ? `${csp.length} chars` : null),
    f("CSP script-src: nonce or hash, no 'unsafe-inline'", 15, /'(nonce|sha\d+)-/.test(script) && (!script.includes("'unsafe-inline'") || script.includes("'strict-dynamic'")), script),
    f("CSP script-src: 'strict-dynamic'", 5, script.includes("'strict-dynamic'"), script.includes("'strict-dynamic'") ? "'strict-dynamic'" : null),
    f("CSP object-src 'none'", 5, directive(csp, "object-src") === "'none'", directive(csp, "object-src")),
    f("CSP base-uri restricted", 5, ["'none'", "'self'"].includes(directive(csp, "base-uri") ?? ""), directive(csp, "base-uri")),
    f("CSP frame-ancestors (clickjacking)", 10, ["'none'", "'self'"].includes(directive(csp, "frame-ancestors") ?? ""), directive(csp, "frame-ancestors")),
    f("CSP violation reporting", 5, /report-(uri|to) /.test(csp), directive(csp, "report-uri") ?? directive(csp, "report-to")),
    f("HSTS max-age >= 1 year", 10, maxAge >= 31_536_000, hsts),
    f("X-Content-Type-Options: nosniff", 5, headers.get("x-content-type-options") === "nosniff", headers.get("x-content-type-options")),
    f("Referrer-Policy strict", 5, /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/.test(rp), rp),
    f("Permissions-Policy", 5, !!headers.get("permissions-policy"), headers.get("permissions-policy")),
    f("Session cookie __Host- prefix", 5, cookie.startsWith("__host-"), setCookie.split("=")[0]),
    f("Session cookie Secure", 5, /;\s*secure/.test(cookie), /;\s*secure/.test(cookie) ? "Secure" : null),
    f("Session cookie HttpOnly", 5, /;\s*httponly/.test(cookie), /;\s*httponly/.test(cookie) ? "HttpOnly" : null),
    f("Session cookie SameSite", 5, /;\s*samesite=(lax|strict)/.test(cookie), /samesite=\w+/.exec(cookie)?.[0] ?? null),
  ];
  const score = findings.reduce((n, x) => n + x.points, 0);
  const letter = score >= 100 ? "A+" : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : score >= 30 ? "E" : "F";
  return { score, letter, findings };
}
