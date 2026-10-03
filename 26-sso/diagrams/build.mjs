// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "26. Single sign-on with OpenID Connect (code flow + PKCE)")
  .box("browser", 40, 150, 220, 120, "Browser\none cookie jar\nper host")
  .box("app", 460, 100, 360, 190, "Portal app :53037 (relying party)\n1 /login: state, nonce, PKCE\nverifier in login_transactions\n3 /callback: used once, code +\nverifier -> tokens; ID token:\nsignature, iss, aud, nonce", { bold: true })
  .box("idp", 980, 100, 240, 190, "IdP :53036\n(OpenID Provider)\noidc-provider,\nPKCE required;\nits own session\n= single sign-on")
  .box("pg", 460, 360, 360, 120, "Postgres\nusers by (issuer, sub), sessions\n(only the cookie's sha256),\nrole_mappings: groups -> roles")
  .arrow("browser", "app", { label: "1, 3, 4 /me", via: [[360, 210]] })
  .arrow("app", "idp", { label: "code ->\ntokens", via: [[900, 195]] })
  .arrow("app", "pg")
  .arrow("browser", "idp", { label: "2 sign in at the IdP (password once), 302 back with ?code&state", via: [[150, 530], [1100, 530]] })
  .box("refused", 40, 580, 1180, 60, "Refused: a state this app did not issue, a callback replayed, a token minted for another client or login,\nreturnTo pointing off the app (open redirect); a signed-in user with no mapped role gets 403", { dashed: true })
  .text(40, 660, "The app never sees a password. Roles come from the IdP's groups through role_mappings, checked on every request.\nLogout deletes the app session and ends the IdP session, so the next login asks for the password again.")
  .write(dirname(fileURLToPath(import.meta.url)));
