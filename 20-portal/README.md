# 20. Full-stack member portal

**Pain: a portal whose pages need JavaScript, an API layer and trust in the client.** A form that only works through a client-side `fetch` does nothing for anyone whose script failed to load. Validation that runs only in the browser is skipped by anyone who posts directly. A query that takes the member id from the URL or a hidden field shows one member another member's data.

**Reach for it when** you build a server-rendered React app that reads its own database: a member, customer or staff portal where most pages are "read my data" and a few forms change it, and where the pages must work for everyone, with or without JavaScript.

**Do not reach for it when** the UI is a long-lived client application (a dashboard that keeps state across hundreds of interactions, offline use), or the data belongs to other services you must call through their APIs anyway. A few static pages need no framework at all: 21 renders React on a bare `node:http` server.

A Next.js 16 App Router app on Postgres: profile, contributions, a change-of-address form and the page of one change request. The run script builds it (`next build`); the demo (`src/demo.ts`) builds nothing itself: it starts `next start` as a separate process and drives it with a client that has JavaScript turned off: plain GETs, form POSTs built from the HTML it received, and a cookie jar. Members `alice` (Acme), `bob` (Globex) and `carol` (Initech) sign in with their username alone, because the session is a stub.

## Run

One shot with proof: `./run-20-portal.sh` from the repo root (log in [`../logs/20-portal.log`](../logs/20-portal.log)).

By hand, from this folder (ports: Postgres 55451, HTTP 53030 portal (next start)):

```sh
docker compose up -d --wait
npm i
npm run setup     # employers, members, addresses, contributions, change_requests
npm run build     # next build
npm run start     # http://localhost:53030, sign in as alice
npm run demo      # starts next start itself (stop the one above first), runs the scenarios, stops it
```

## Files

- `src/app/login/` the sign-in page and its server action, which sets the session cookie and redirects.
- `src/app/profile/page.tsx`, `src/app/contributions/page.tsx` async server components that query Postgres for the signed-in member.
- `src/app/address/` the change-of-address page, the form (a client component with `useActionState`) and the server action that validates with zod, inserts, and redirects.
- `src/app/requests/[id]/page.tsx` one change request, found only among the signed-in member's own.
- `src/lib/session.ts` the signed cookie and `requireMember()`; `src/lib/members.ts` every query, each filtered on the member id; `src/lib/address.ts` the zod schema; `src/lib/db.ts` the pool.
- `src/setup.ts` schema and seed, including the partial unique index that allows one pending change per member.
- `src/demo.ts` the JS-off client and its checks.

## Concepts

- **Server component**: an `async` React component that runs only on the server. `ProfilePage` calls `requireMember()`, awaits a SQL query and returns JSX; React renders the rows into the HTML response. No API endpoint, no client-side fetch, no loading state, and no database code is sent to the browser.
- **Dynamic rendering**: a page that reads `cookies()` cannot be built ahead of time, so `next build` marks it `ƒ` and renders it per request. `/` only redirects, so it is prerendered (`○`).
- **Server action**: a function marked `"use server"` that a `<form action={fn}>` calls. Next gives it an id and renders the form as an ordinary `POST` form with hidden `$ACTION_*` fields, so the browser can submit it with no JavaScript at all. When JS is present, React submits it with `fetch` instead and updates the page in place.
- **Progressive enhancement**: the page works as plain HTML first and JavaScript improves it. The change-of-address form is a client component using `useActionState`; without JS the browser posts it, Next runs the action, and renders the page again with the state the action returned (field errors, the values typed). The demo's client proves it: it never runs a script.
- **Server-side validation**: the action validates with a zod schema (`src/lib/address.ts`) whatever the client did. `z.flattenError` turns the issues into `{ field: [messages] }`, rendered next to each field with `aria-invalid` and `aria-describedby` (21 explains why). The schema also normalises: `ab1 2cd` is stored as `AB1 2CD`. "Not in the past" compares with today's date in UTC (`src/lib/address.ts`); a portal used across time zones would compare in one configured service time zone instead.
- **Post/Redirect/Get**: a successful action calls `redirect()`, which answers `303 See Other` to the new request's page. The browser follows with a GET, so a reload or Back does not post the form again. An invalid submission answers `200` with the form, because there is nothing to redirect to.
- **Session cookie stub**: the cookie holds `memberId.signature`, an HMAC-SHA256 of the id with a server secret, `HttpOnly` (scripts cannot read it) and `SameSite=Lax` (not sent on cross-site POSTs). A changed id without the matching signature is no session. A real portal gets the member from its identity provider (26); everything after `requireMember()` stays the same.
- **Data access scoped to the member**: every function in `src/lib/members.ts` takes the member id from the session and filters on it, including the lookup by request id (`WHERE id = $1 AND member_id = $2`). So bob asking for alice's request gets 404, not 403: the row does not exist for him, and the answer does not reveal that the id exists. The action never reads a member id from the form, so a forged `member_id` field changes nothing. This closes the insecure direct object reference (IDOR) hole.
- **The database holds the rule**: "at most one pending address change per member" is a partial unique index `(member_id, kind) WHERE status = 'pending'`. Two concurrent submissions cannot both pass, which a `SELECT` before the `INSERT` cannot guarantee. The action turns the `23505` unique violation into a form-level error.
- **CSRF protection for actions**: Next compares the `Origin` header of an action request with the host, and aborts a mismatch before the action runs. Together with `SameSite=Lax`, a form on another site cannot submit actions with the member's cookie.
- **Trade-offs**: action ids change with every build, so a page rendered by the old version and submitted after a deploy can post an id the new server does not know, and gets an error; plan deploys with that in mind. Next decides much for you (routing by folder, caching rules, what runs where), and its conventions change between major versions. A rejected cross-origin action answers 500 rather than 403. The session is a stub with no expiry, rotation or logout.

## Proof (`logs/20-portal.log`)

`next build` renders the pages that read the session per request:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /address
├ ƒ /contributions
├ ƒ /login
├ ƒ /profile
└ ƒ /requests/[id]
```

Signing in with JS off: the form carries a hidden action id, the action sets the cookie and redirects:

```
   POST /login username=alice (no JS)           -> 303 Location: /profile Set-Cookie: sid=1.DyFq...; Path=/; HttpOnly; SameSite=lax
   hidden fields the server rendered into the form: $ACTION_ID_<id>
```

An invalid change, posted without JS, comes back with the zod errors rendered by the server and the typed value kept; nothing is written:

```
   hidden fields: $ACTION_REF_1, $ACTION_1:0, $ACTION_1:1, $ACTION_KEY
   POST /address (blank line 1, bad postcode, past date) -> 200
     line1: Error: Enter the first line of the address
     postcode: Error: Enter a real postcode, like AB1 2CD
     effectiveFrom: Error: The date cannot be in the past
     aria-invalid on: line1, postcode, effectiveFrom; city kept as typed: true
```

A valid one redirects to the new request (Post/Redirect/Get); the forged `member_id=2` is ignored:

```
   POST /address (valid, plus member_id=2)      -> 303 Location: /requests/1
   GET /requests/1 -> 200: Address change request 1 | Status: Pending | New address: 1 High Street, Springfield, AB1 2CD, from 2026-10-09. Requested 2026-10-02 17:10. |
```

Scoping: bob cannot see alice's request (nor an id too large for the column), a cookie with a borrowed signature is no session, and Next refuses an action posted from another origin, here for carol, who has no pending request, so a write would have shown:

```
   GET /requests/1 as bob                       -> 404
   GET /requests/99999999999 as bob             -> 404
   GET /profile with sid=2.<alice's signature>  -> 307 Location: /login
`x-forwarded-host` header with value `localhost:53030` does not match `origin` header with value `attacker.example` from a forwarded Server Actions request. Aborting the action.
   POST /address as carol, Origin: http://attacker.example -> 500
   Next aborted the action before it ran (its log line above); change_requests rows: 1
```

One row survives four address submissions (invalid, valid, duplicate, cross-origin), owned by alice, postcode normalised:

```
 id | member_id |  kind   |                                 payload                                  | effective_from | status
----+-----------+---------+--------------------------------------------------------------------------+----------------+---------
  1 |         1 | address | {"city": "Springfield", "line1": "1 High Street", "postcode": "AB1 2CD"} | 2026-10-09     | pending
```

## Origins and further reading

- Docs: "Server and Client Components", Next.js. https://nextjs.org/docs/app/getting-started/server-and-client-components
- Docs: "Forms" (server actions, `useActionState`, validation, progressive enhancement), Next.js. https://nextjs.org/docs/app/guides/forms
- Docs: "Data Security" (data access layer, action security, `Origin` checks), Next.js. https://nextjs.org/docs/app/guides/data-security
- Docs: `useActionState`, React. https://react.dev/reference/react/useActionState
- Article: "Understanding Progressive Enhancement", Aaron Gustafson, A List Apart, 2008. https://alistapart.com/article/understandingprogressiveenhancement/
- Article: "Redirect After Post", Michael Jouravlev, TheServerSide, 2004 (Post/Redirect/Get). https://www.theserverside.com/news/1365146/Redirect-After-Post
- Docs: OWASP "Insecure Direct Object Reference Prevention Cheat Sheet". https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html
- Docs: OWASP "Cross-Site Request Forgery Prevention Cheat Sheet" (origin checks, SameSite). https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Docs: Zod. https://zod.dev
