// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "50. DNS service discovery: call a name, not an address")
  .frame("net", 40, 90, 1040, 560, "One Compose network: every service is registered under its name")
  .box("probe", 70, 140, 260, 170, "probe (the client)\nknows only catalog:8080\npinned / fresh /\ncached / resilient", { bold: true })
  .box("dns", 420, 140, 280, 80, "Docker DNS 127.0.0.11\ncatalog: one A per replica, TTL 600 s")
  .box("cache", 420, 340, 280, 110, "In the client, not in DNS:\ncache lifetime, keep-alive,\ntimeout, drop a failed address\nand retry another", { dashed: true })
  .box("coredns", 420, 520, 280, 90, "CoreDNS, svc.internal\nSRV: priority, weight, port")
  .box("c1", 800, 130, 250, 50, "catalog-1 :8080")
  .box("c2", 800, 195, 250, 50, "catalog-2 :8080")
  .box("c3", 800, 260, 250, 50, "catalog-3 :8080")
  .box("c4", 800, 325, 250, 50, "scaled out, then stopped:\ngone from DNS", { dashed: true })
  .box("c5", 800, 390, 250, 50, "paused: still in DNS", { dashed: true })
  .box("la", 800, 495, 250, 50, "ledger-a :8081, weight 3")
  .box("lb", 800, 560, 250, 50, "ledger-b :8082, weight 1")
  .arrow("probe", "dns", { label: "1. lookup", via: [[380, 180]] })
  .arrow("probe", "c3", { label: "2. GET by IP", via: [[560, 285]] })
  .arrow("probe", "cache", { dashed: true, via: [[200, 395]] })
  .arrow("probe", "coredns", { label: "SRV lookup", via: [[110, 565]] })
  .arrow("coredns", "la")
  .arrow("coredns", "lb")
  .text(40, 680, "DNS knows names, not health: a stopped replica leaves DNS at once, a hung one stays until a timeout finds it.\nCaches and keep-alive connections decide when a client sees a change; a short timeout and a retry on another address cover the gap.")
  .write(dirname(fileURLToPath(import.meta.url)));
