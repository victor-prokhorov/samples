# 20-portal

**Pain: a portal whose pages need JavaScript, an API layer and trust in the client.** A form that only works through a client-side `fetch` is dead for anyone whose script failed to load. Validation that runs only in the browser is skipped by anyone who posts directly. A query that takes the member id from the URL or a hidden field shows one member another member's data.

**Reach for it when** you build a server-rendered web app in React that reads its own database: a member, customer or staff portal where most pages are "read my data" and a few forms change it, and where the pages must work for everyone, with or without JavaScript.

**Do not reach for it when** the UI is a long-lived client application (a dashboard that keeps state across hundreds of interactions, offline use) or the data belongs to other services you must call through their APIs anyway. A few static pages need no framework at all (21 renders React on a bare `node:http` server).

A Next.js 16 App Router app on Postgres, and a client (`src/demo.ts`) that builds nothing itself: it starts `next start`, then acts like a browser with JavaScript turned off (plain GETs, form POSTs and a cookie jar). Members `alice` (Acme), `bob` (Globex) and `carol` (Initech) sign in with their username alone: the session is a stub.

```sh
docker compose up -d --wait
npm i
npm run setup     # employers, members, addresses, contributions, change_requests
npm run build     # next build
npm run start     # http://localhost:53030, sign in as alice
npm run demo      # starts next start itself (stop the one above first), runs the scenarios, stops it
```

- `src/app/login/` the sign-in page and its server action, which sets the session cookie and redirects.
- `src/app/profile/page.tsx`, `src/app/contributions/page.tsx` async server components that query Postgres for the signed-in member.
- `src/app/address/` the change-of-address page, the form (a client component with `useActionState`) and the server action that validates with zod, inserts, and redirects.
- `src/app/requests/[id]/page.tsx` one change request, found only among the signed-in member's own.
- `src/lib/session.ts` the signed cookie and `requireMember()`; `src/lib/members.ts` every query, each filtered on the member id; `src/lib/address.ts` the zod schema; `src/lib/db.ts` the pool.
- `src/setup.ts` schema and seed, including the partial unique index that allows one pending change per member.
- `src/demo.ts` the JS-off client and its checks.

One-shot run with proof: `../run-20-portal.sh` (log in `../logs/20-portal.log`). Concepts explained in `../README.md`.
