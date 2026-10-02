import http from "node:http";
import { statementPage } from "./page.js";

const contributions = [
  { month: "2026-01", employer: "Acme", amountCents: 41250 },
  { month: "2026-02", employer: "Acme", amountCents: 41250 },
  { month: "2026-03", employer: "Globex", amountCents: 38900 },
];

const port = Number(process.env.PORT ?? 53040);
http
  .createServer((_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(statementPage("alice", 2026, contributions)))
  .listen(port, () => console.log(`statement app ${process.env.APP_VERSION ?? "dev"} on :${port}`));
