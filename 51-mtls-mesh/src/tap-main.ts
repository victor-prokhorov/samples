// The tap in the mesh: orders' sidecar is pointed at tap:15443, which relays to payments' sidecar and keeps a copy.
// GET :8080/stats returns what it saw; POST :8080/reset clears it.
import { createServer } from "node:http";
import { CARD } from "./grpc.js";
import { Tap } from "./tap.js";

const tap = new Tap({ host: "payments-app", port: 15443 }, CARD);
await tap.listen(15443, "0.0.0.0");
createServer((req, res) => {
  if (req.method === "POST" && req.url === "/reset") tap.reset();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(tap.stats()));
}).listen(8080, () => console.log("[tap] relaying :15443 -> payments-app:15443, stats on :8080"));
