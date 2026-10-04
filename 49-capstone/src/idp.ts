// The identity provider: oidc-provider, as in 26-sso, with its own directory of accounts. The portal never sees a
// password: it gets an ID token with the user's name, email, groups and member number. The sign-in page reuses the
// portal's tokens.css and components.css so the journey looks like one product.
import { scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { exportJWK, generateKeyPair } from "jose";
import Provider, { type KoaContextWithOIDC } from "oidc-provider";
import { APP, CLIENT_ID, CLIENT_SECRET, IDP, IDP_PORT } from "./config";

const salt = Buffer.from("demo-salt");
const hash = (pw: string) => scryptSync(pw, salt, 32);
// Groups are what a real IdP sends; the portal maps them to its roles (role_mappings).
const ACCOUNTS: Record<string, { password: Buffer; name: string; email: string; groups: string[]; member_no?: string }> = {
  ana: { password: hash("ana-pw"), name: "Ana Martin", email: "ana@acme.example", groups: ["portal-members"], member_no: "M0001" },
  ben: { password: hash("ben-pw"), name: "Ben Dubois", email: "ben@acme.example", groups: ["portal-members"], member_no: "M0002" },
  erin: { password: hash("erin-pw"), name: "Erin Walsh", email: "erin@acme.example", groups: ["acme-hr"] },
  sam: { password: hash("sam-pw"), name: "Sam Okafor", email: "sam@portal.example", groups: ["portal-staff"] },
};

const css = ["tokens.css", "components.css"].map((f) => readFileSync(new URL(`./styles/${f}`, import.meta.url), "utf8")).join("\n");
const layout = `.idp{max-width:26rem;margin:var(--space-xl) auto;padding:0 var(--space-md)}.idp form{display:grid;gap:var(--space-md)}.idp-brand{color:var(--color-text-muted);font-size:var(--text-small-size);margin:0 0 var(--space-sm)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Identity provider</title><style>${css}${layout}</style></head>
<body><main class="idp"><p class="idp-brand">Identity provider · ${esc(new URL(IDP).host)}</p><div class="ds-card"><div class="ds-card__header"><h1 class="ds-card__title">${esc(title)}</h1><p class="ds-card__meta">to continue to the member portal</p></div><div class="ds-card__body">${body}</div></div></main></body></html>`;

const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...(await exportJWK(privateKey)), kid: "idp-key-1", use: "sig", alg: "RS256" };

const provider = new Provider(IDP, {
  clients: [
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uris: [`${APP}/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
  ],
  pkce: { required: () => true },
  scopes: ["openid", "email", "profile", "portal"],
  claims: { email: ["email"], profile: ["name"], portal: ["groups", "member_no"] },
  conformIdTokenClaims: false,
  jwks: { keys: [jwk] },
  cookies: { keys: ["idp-cookie-key-1"] },
  ttl: { AuthorizationCode: 60, IdToken: 300, AccessToken: 300, Interaction: 600, Session: 3600, Grant: 3600 },
  features: { devInteractions: { enabled: false } },
  interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  // A first-party client: grant the requested scopes without a consent screen.
  loadExistingGrant: async (ctx: KoaContextWithOIDC) => {
    const id = ctx.oidc.result?.consent?.grantId || ctx.oidc.session!.grantIdFor(ctx.oidc.client!.clientId);
    const existing = id ? await ctx.oidc.provider.Grant.find(id) : undefined;
    if (existing) return existing;
    const grant = new ctx.oidc.provider.Grant({ clientId: ctx.oidc.client!.clientId, accountId: ctx.oidc.session!.accountId });
    grant.addOIDCScope("openid email profile portal");
    await grant.save();
    return grant;
  },
  findAccount: async (_ctx, sub) => {
    const a = ACCOUNTS[sub];
    if (!a) return undefined;
    return { accountId: sub, claims: async () => ({ sub, name: a.name, email: a.email, groups: a.groups, ...(a.member_no ? { member_no: a.member_no } : {}) }) };
  },
});

const form = (uid: string, error?: string) =>
  `${error ? `<div class="ds-alert ds-alert--danger" role="alert"><div><p class="ds-alert__title">${esc(error)}</p></div></div>` : ""}
  <form method="post" action="/interaction/${uid}/login">
    <div class="ds-field"><label class="ds-field__label" for="login">Username</label><input class="ds-field__input" id="login" name="login" autocomplete="username" required></div>
    <div class="ds-field"><label class="ds-field__label" for="password">Password</label><input class="ds-field__input" id="password" name="password" type="password" autocomplete="current-password" required></div>
    <div><button class="ds-button ds-button--primary" type="submit">Sign in</button></div>
  </form>`;

const app = express();
app.get("/interaction/:uid", async (req, res) => {
  const details = await provider.interactionDetails(req, res);
  res.type("html").send(page("Sign in", form(details.uid)));
});
app.post("/interaction/:uid/login", express.urlencoded({ extended: false }), async (req, res) => {
  const a = ACCOUNTS[req.body.login];
  if (!a || !timingSafeEqual(a.password, hash(String(req.body.password ?? "")))) {
    res.status(401).type("html").send(page("Sign in", form(String(req.params.uid), "Unknown username or wrong password")));
    return;
  }
  await provider.interactionFinished(req, res, { login: { accountId: req.body.login } }, { mergeWithLastSubmission: false });
});
app.use(provider.callback());
app.listen(IDP_PORT, () => console.log(`   [idp pid ${process.pid}] OpenID Provider (oidc-provider) at ${IDP}`));
