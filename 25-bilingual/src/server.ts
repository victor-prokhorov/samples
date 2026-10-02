import http from "node:http";
import { DEFAULT, PSEUDO, SUPPORTED, translator } from "./i18n.js";
import { negotiate } from "./negotiate.js";
import { Member, naivePage, page } from "./pages.js";

export const PORT = 53035;

const noon = (d: string) => new Date(`${d}T12:00:00Z`);
const MEMBERS: Record<string, Member> = {
  alice: {
    name: "Alice",
    role: "member",
    pending: 0,
    lastLogin: noon("2026-09-28"),
    rate: 0.07,
    contributions: [
      { date: noon("2026-01-31"), employer: "Acme", amount: 1234.56 },
      { date: noon("2026-02-28"), employer: "Acme", amount: 1234.56 },
      { date: noon("2026-03-31"), employer: "Globex", amount: 1641.94 },
    ],
  },
  bob: { name: "Bob", role: "employer", pending: 1, lastLogin: noon("2026-09-30"), rate: 0.05, contributions: [{ date: noon("2026-01-31"), employer: "Initech", amount: 98.5 }] },
  carol: { name: "Carol", role: "staff", pending: 2, lastLogin: noon("2026-10-01"), rate: 0.09, contributions: [] },
};

// An explicit choice (?lang=, a link or a saved preference) wins over the browser's Accept-Language; the pseudo-locale is only reachable explicitly.
function chooseLocale(url: URL, acceptLanguage: string | undefined) {
  const asked = url.searchParams.get("lang");
  if (asked && (SUPPORTED.includes(asked) || asked === PSEUDO)) return asked;
  return negotiate(acceptLanguage, SUPPORTED, DEFAULT);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const id = url.searchParams.get("member") ?? "alice";
    const member = MEMBERS[id];
    if (!member || (url.pathname !== "/" && url.pathname !== "/naive")) {
      res.writeHead(404).end();
      return;
    }
    const tr = translator(chooseLocale(url, req.headers["accept-language"]));
    const body = url.pathname === "/naive" ? naivePage(tr, member) : page(tr, member, id);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-language": tr.locale, vary: "Accept-Language" });
    res.end(body);
  })
  .listen(PORT, () => console.log(`server: member page on http://localhost:${PORT} (/, /naive; ?lang=en|fr|${PSEUDO}; ?member=alice|bob|carol)`));
