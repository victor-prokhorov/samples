// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "51. mTLS between services: in the app, then in sidecars")
  .frame("app", 40, 90, 1040, 170, "Steps 2-4: mTLS in each app")
  .box("oa", 70, 140, 300, 90, "orders\nloads its key, cert and the CA\ngrpc.credentials.createSsl(...)")
  .box("pa", 720, 140, 330, 90, "payments\nrequires a client certificate,\nreads the SPIFFE id, allowlist", { bold: true })
  .arrow("oa", "pa", { label: "gRPC over mTLS", both: true })
  .box("ca", 340, 285, 420, 60, "Mesh CA signs spiffe://mesh.local/ns/shop/sa/<name>,\nvalid for one day")
  .frame("mesh", 40, 370, 1040, 330, "Steps 5-7: the apps speak plaintext, sidecars do mTLS (the service mesh idea)")
  .frame("pod1", 60, 420, 330, 140, "orders: one network namespace")
  .box("oapp", 75, 465, 145, 75, "orders app\nno TLS code,\nplaintext")
  .box("oenv", 235, 465, 140, 75, "Envoy\n127.0.0.1:15001", { bold: true })
  .box("tap", 455, 465, 150, 75, "tap\nsees ciphertext", { dashed: true })
  .frame("pod2", 680, 420, 380, 140, "payments: one network namespace")
  .box("penv", 695, 465, 170, 75, "Envoy :15443\nmTLS, RBAC, XFCC", { bold: true })
  .box("papp", 880, 465, 165, 75, "payments app\nplaintext on\n127.0.0.1:50051")
  .arrow("oapp", "oenv")
  .arrow("oenv", "tap", { label: "mTLS" })
  .arrow("tap", "penv", { label: "mTLS" })
  .arrow("penv", "papp")
  .box("bad", 290, 600, 450, 80, "no cert, rogue CA, expired: refused at handshake\nreports (trusted CA): RBAC, PERMISSION_DENIED", { dashed: true })
  .arrow("bad", "penv", { dashed: true, via: [[780, 640]] })
  .text(40, 720, "Same result both ways: only orders gets through, and payments knows it is orders. In the app, every service carries TLS code;\nwith sidecars, the apps stay plaintext on localhost and the platform issues, checks and rotates identities for all of them.")
  .write(dirname(fileURLToPath(import.meta.url)));
