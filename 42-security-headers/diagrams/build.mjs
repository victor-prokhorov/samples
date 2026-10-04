// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "42. Security headers: the same three attacks, before and after")
  .box("att", 40, 110, 240, 110, "attacker site :53252\nforged form POST /bank\nportal in a hidden iframe\ncollects stolen cookies", { dashed: true })
  .box("notice", 40, 300, 240, 70, "employer notice with an\ninjected <script> (stored XSS)", { dashed: true })
  .box("browser", 420, 190, 200, 100, "Chromium (Playwright)\nmember signed in", { bold: true })
  .box("insecure", 780, 90, 320, 110, "insecure :53052\nno security headers, plain cookie:\nscript runs, POST accepted,\nframe renders", { dashed: true })
  .box("hardened", 780, 250, 320, 150, "hardened :53152\nCSP: nonce + strict-dynamic,\nframe-ancestors 'none', object-src,\nbase-uri; HSTS, nosniff, Referrer-,\nPermissions-Policy; __Host- cookie;\nOrigin check + CSRF token", { bold: true })
  .box("reports", 780, 450, 320, 60, "POST /csp-report\nviolations collected")
  .box("env", 410, 450, 220, 60, "SESSION_KEYS from env\n(secret store, rotated)")
  .arrow("att", "browser", { label: "lures" })
  .arrow("notice", "browser", { label: "rendered raw" })
  .arrow("browser", "insecure", { dashed: true, label: "attacks work" })
  .arrow("browser", "hardened", { label: "all blocked" })
  .arrow("hardened", "reports", { label: "browser sends violations" })
  .arrow("env", "hardened", { label: "signs" })
  .text(40, 560, "Scan: insecure 0/100 (F), hardened 100/100 (A+). The XSS bug is still there in both builds:\nCSP makes the injected script inert and reports it; escaping the notice is the fix.")
  .write(dirname(fileURLToPath(import.meta.url)));
