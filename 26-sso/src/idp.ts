import { scryptSync, timingSafeEqual } from "node:crypto";
import express from "express";
import { exportJWK, generateKeyPair } from "jose";
import Provider, { KoaContextWithOIDC } from "oidc-provider";
import { APP, CLIENT_ID, CLIENT_SECRET, IDP, IDP_PORT } from "./config.js";

// The identity provider's own directory. Groups are what a real IdP (Entra ID, Keycloak, Okta) would send; the app maps them to its roles.
const salt = Buffer.from("demo-salt");
const hash = (pw: string) => scryptSync(pw, salt, 32);
const ACCOUNTS: Record<string, { password: Buffer; name: string; email: string; groups: string[]; member_no?: string }> = {
  alice: { password: hash("alice-pw"), name: "Alice Martin", email: "alice@acme.example", groups: ["portal-members"], member_no: "M0001" },
  bob: { password: hash("bob-pw"), name: "Bob Durand", email: "bob@acme.example", groups: ["acme-hr"] },
  carol: { password: hash("carol-pw"), name: "Carol Petit", email: "carol@portal.example", groups: ["it-staff"] },
  dave: { password: hash("dave-pw"), name: "Dave Moreau", email: "dave@acme.example", groups: ["marketing"] },
};

const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...(await exportJWK(privateKey)), kid: "idp-key-1", use: "sig", alg: "RS256" };

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;

const provider = new Provider(IDP, {
  clients: [
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uris: [`${APP}/callback`],
      post_logout_redirect_uris: [`${APP}/logged-out`],
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
  features: {
    devInteractions: { enabled: false },
    rpInitiatedLogout: {
      enabled: true,
      logoutSource: async (ctx: KoaContextWithOIDC, form: string) => {
        ctx.body = page("Sign out of the identity provider?", `${form}<button type="submit" form="op.logoutForm" name="logout" value="yes">Yes, sign me out</button>`);
      },
      postLogoutSuccessSource: async (ctx: KoaContextWithOIDC) => {
        ctx.body = page("Signed out", "");
      },
    },
  },
  interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  // A first-party client: grant the requested scopes without a consent screen.
  loadExistingGrant: async (ctx) => {
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

const app = express();
app.get("/interaction/:uid", async (req, res) => {
  const details = await provider.interactionDetails(req, res);
  res.type("html").send(
    page(
      "Sign in",
      `<form method="post" action="/interaction/${details.uid}/login">
        <label for="login">Username</label><input id="login" name="login" autocomplete="username">
        <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
        <button type="submit">Sign in</button></form>`,
    ),
  );
});
app.post("/interaction/:uid/login", express.urlencoded({ extended: false }), async (req, res) => {
  const a = ACCOUNTS[req.body.login];
  if (!a || !timingSafeEqual(a.password, hash(String(req.body.password ?? "")))) {
    res.status(401).type("html").send(page("Sign in", "<p>Unknown username or wrong password.</p>"));
    return;
  }
  await provider.interactionFinished(req, res, { login: { accountId: req.body.login } }, { mergeWithLastSubmission: false });
});
app.use(provider.callback());
app.listen(IDP_PORT, () => console.log(`   [idp pid ${process.pid}] OpenID Provider (oidc-provider) at ${IDP}`));
