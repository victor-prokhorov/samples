# Architecture

A deliberately boring stack the team of five can run: one server-rendered web application (progressive enhancement, works without JavaScript), one Postgres database, a worker for batch jobs, and the organisation's identity provider for sign-in. No microservices: the domain is small and the team is smaller. The old portal stays behind the same routing facade until each capability has moved (see [08-migration-plan.md](08-migration-plan.md)).

## System context (C4 level 1)

<!-- diagram: c4-context -->
```mermaid
C4Context
    title Member portal: system context
    Person(member, "Member", "Employee of a partner organisation")
    Person(hr, "Employer administrator", "HR at one of 26 employers")
    Person(staff, "Support staff", "Processes change requests")
    System(portal, "Member portal", "Profile, contributions, change requests, statements, monthly uploads")
    System_Ext(idp, "Identity provider", "OpenID Connect, MFA")
    System_Ext(mail, "Email service", "Notifications")
    System_Ext(legacy, "Legacy portal", "Until decommissioned")
    System_Ext(payroll, "Employer payroll", "Produces the monthly file")
    Rel(member, portal, "Uses", "HTTPS")
    Rel(hr, portal, "Uploads files, views members", "HTTPS")
    Rel(staff, portal, "Works the queue", "HTTPS")
    Rel(portal, idp, "Authenticates users", "OIDC")
    Rel(portal, mail, "Sends notifications", "SMTP")
    Rel(portal, legacy, "Syncs data during migration", "CDC / outbox")
    Rel(payroll, hr, "Exports file")
```

## Containers (C4 level 2)

Drawn as a flowchart: Mermaid's own C4 layout cannot place the external systems around the boundary.

<!-- diagram: c4-container -->
```mermaid
flowchart TB
    member(["Member<br/><small>Person</small>"])
    staff(["Support staff<br/><small>Person</small>"])
    subgraph portal["Member portal"]
        facade["Routing facade<br/><small>Reverse proxy: routes each path to the new app or the legacy portal</small>"]
        web["Web application<br/><small>Node.js, server-rendered React: pages, forms, validation, sessions</small>"]
        worker["Worker<br/><small>Node.js: imports, statements, notifications, retention</small>"]
        db[("Database<br/><small>PostgreSQL: members, contributions, requests, audit, outbox</small>")]
    end
    legacy["Legacy portal<br/><small>until decommissioned</small>"]
    idp["Identity provider<br/><small>OIDC, MFA</small>"]
    mail["Email service"]
    member -- HTTPS --> facade
    staff -- HTTPS --> facade
    facade -- "new capabilities" --> web
    facade -- "not yet moved" --> legacy
    web -- "OIDC code flow + PKCE" --> idp
    web -- SQL --> db
    worker -- "SQL, SKIP LOCKED jobs" --> db
    worker -- SMTP --> mail
    worker -. "outbox / CDC sync" .-> legacy
    classDef ext fill:#eeeeee,stroke:#888888,color:#222222
    class legacy,idp,mail ext
```

## Sign-in (OpenID Connect, authorization code with PKCE)

<!-- diagram: sequence-login -->
```mermaid
sequenceDiagram
    autonumber
    actor M as Member
    participant W as Web application
    participant I as Identity provider
    participant D as Database
    M->>W: GET /contributions (no session)
    W->>W: create state, nonce, PKCE verifier
    W-->>M: 302 to IdP /authorize (state, nonce, code_challenge)
    M->>I: sign in (password + MFA when required)
    I-->>M: 302 to /callback?code&state
    M->>W: GET /callback?code&state
    W->>W: check state matches the one in the pre-login cookie
    W->>I: POST /token (code, code_verifier)
    I-->>W: ID token + access token
    W->>W: validate ID token (signature, issuer, audience, expiry, nonce)
    W->>D: find user by subject, load roles and employer
    W-->>M: 302 to /contributions, session cookie (HttpOnly, Secure, SameSite=Lax)
```

## Change request (address)

<!-- diagram: sequence-change-request -->
```mermaid
sequenceDiagram
    autonumber
    actor M as Member
    participant W as Web application
    participant D as Database
    participant K as Worker
    actor S as Support staff
    M->>W: POST /changes/address (form, works without JavaScript)
    W->>W: validate server-side
    alt invalid
        W-->>M: 422 page with error summary, values kept
    else valid
        W->>D: one transaction: INSERT change_requests (submitted) and outbox
        W-->>M: 303 to /requests/CR-1042
    end
    K->>D: claim outbox rows (FOR UPDATE SKIP LOCKED)
    K-->>S: request appears in the queue
    S->>W: approve CR-1042
    W->>D: one transaction: UPDATE members, INSERT audit_log, UPDATE change_requests (approved), INSERT outbox
    K->>D: claim outbox row
    K-->>M: email "your request CR-1042 is approved"
```

## Decisions worth recording as ADRs

- Server-rendered pages with progressive enhancement, not a single-page app: accessibility, mobile performance, one deployable.
- No passwords in the portal: OpenID Connect against the organisation's identity provider, MFA step-up for bank details.
- One Postgres database with an outbox for side effects (emails, sync to legacy), not a message broker: the volumes are small.
- Employer scoping enforced in the database (row-level security keyed on the employer), not only in the application.
