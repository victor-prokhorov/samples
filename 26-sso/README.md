# 26-sso

**Pain: every app keeps its own passwords, and a hand-rolled login trusts whatever comes back.** Members, employer HR staff and the IT team each have one more password per app, nobody can switch an account off in one place, and roles are set by hand in each app. When an app does delegate login, the first version takes the `code` from the redirect and the claims from the token without checking which browser started the login, whether the code was already used, who the token was minted for, or whether it was altered.

**Reach for it when** people already have an account in an identity provider (Entra ID, Keycloak, Okta, Google Workspace, an organisation's own IdP) and the app should sign them in through it, with roles coming from the groups the IdP manages, and several apps should share one sign-in.

**Do not reach for it when** the caller is a machine, not a person: use the client credentials grant or mTLS. The app is a single-page app or a mobile app with no server side: the same flow applies, but it is a public client (no secret) and the tokens live in the browser, so use a backend-for-frontend instead if you can. The app has a handful of local users and no IdP: a password with a second factor (or passkeys) is simpler than running an IdP.

Two processes and a client: an OpenID Provider (`src/idp.ts`, `oidc-provider` on :53036 as `127.0.0.1`) with four accounts, a member portal (`src/app.ts`, Express on :53037 as `localhost`) using `openid-client` as the relying party with users, role mappings and sessions in Postgres, and a demo (`src/demo.ts`) that plays the browsers with `fetch` and a cookie jar (`src/browser.ts`), following each redirect by hand.

```sh
docker compose up -d --wait
npm i
npm run setup
npm run idp      # :53036
npm run app      # :53037, after the IdP (it reads the discovery document at start)
# then open http://localhost:53037/me in a browser and sign in as alice / alice-pw (also bob, carol, dave)
npm run demo     # starts both itself (stop the two above first)
```

```
GET  /login?returnTo=        state, nonce, PKCE verifier stored in login_transactions -> 302 to the IdP
GET  /callback               one-time transaction, code + verifier -> tokens, ID token checked, user upserted, session cookie
GET  /me                     role member: the member's own record
GET  /employers/:code/members  role employer-admin of :code, or staff
GET  /admin/users            role staff
POST /logout                 session deleted -> 303 to the IdP's end_session_endpoint
```

- `src/app.ts` the relying party: discovery, login transaction, callback with `authorizationCodeGrant` (state, PKCE, nonce, signature), user provisioning, session cookie, role checks, logout.
- `src/idp.ts` the provider: one confidential client, PKCE required, a `portal` scope with `groups` and `member_no`, a login page, no consent screen for this first-party client, RP-initiated logout.
- `src/browser.ts` a cookie jar per host and a redirect follower that logs each hop.
- `src/demo.ts` the 8 steps and their checks; `src/config.ts` ports, URLs, client credentials; `src/setup.ts` the tables.

One-shot run with proof: `../run-26-sso.sh` (log in `../logs/26-sso.log`). Concepts explained in `../README.md`.
