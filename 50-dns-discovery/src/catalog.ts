// One replica of a tiny HTTP service: it answers with its own hostname (the container id) and IP, so a client can count
// which replica served each request. catalog runs as several replicas; ledger-a and ledger-b reuse it on other ports.
import { createServer } from "node:http";
import { hostname, networkInterfaces } from "node:os";

const PORT = Number(process.env.PORT ?? 8080);
const NAME = process.env.NAME ?? "catalog";
const ip = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "?";

createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ service: NAME, replica: hostname(), ip }));
}).listen(PORT, () => console.log(`[${NAME}] ${hostname()} ${ip}:${PORT}`));
