# Design exercise: a worked example

A three-hour written design case, solved step by step as a lesson. The case: **rebuild a legacy member portal used by about forty partner organisations**, without stopping the old one, and say how you would find out what users need, what you would build, how you would move from old to new, and how you would know it worked.

Each step has the same shape, so it can be revised fast and recalled under time pressure:

- **A short header** you can remember (the whole method is the list of headers).
- **Remember:** the one sentence to keep if you forget everything else.
- **Worked example:** the step done for this case, at the depth a written answer needs.
- **Do / Don't:** what earns marks and what loses them.
- **Diagram:** a plain box drawing (`diagrams/*.excalidraw` to edit, `*.svg` to read). A dashed line is either a frame (a group of boxes) or a legacy, temporary or failure path.
- **Go deeper:** the runnable samples in this repository and the references behind the step.

[`../32-casebook/`](../32-casebook/) is the same scenario written as a full casebook and checked by a script (diagrams render, the data model applies, every requirement traces to a journey). This folder is the teaching version: why each step, what to write, what to avoid.

![The case on one page](diagrams/00-map.svg)

## Contents

| Phase | Step | Header to remember |
| --- | --- | --- |
| Understand | [0](#0-frame-the-problem-assumptions-before-answers) | Frame the problem: assumptions before answers |
| | [1](#1-gather-information-many-sources-one-synthesis) | Gather information: many sources, one synthesis |
| | [2](#2-map-journeys-as-is-pain-to-be-flow) | Map journeys: as-is pain, to-be flow |
| | [3](#3-write-requirements-testable-traced-sliced) | Write requirements: testable, traced, sliced |
| Design | [4](#4-architecture-boring-on-purpose-every-arrow-a-decision) | Architecture: boring on purpose, every arrow a decision |
| | [5](#5-multi-tenancy-and-data-tenant-from-the-session-isolation-in-the-database) | Multi-tenancy and data: tenant from the session, isolation in the database |
| | [6](#6-security-defence-in-depth-worst-case-first) | Security: defence in depth, worst case first |
| | [7](#7-accessibility-by-design-not-by-audit) | Accessibility: by design, not by audit |
| | [8](#8-documents-a-pdf-pipeline-that-can-crash-and-resume) | Documents: a PDF pipeline that can crash and resume |
| | [9](#9-integrations-core-in-the-middle-adapters-at-the-edge) | Integrations: core in the middle, adapters at the edge |
| Deliver | [10](#10-migration-strangle-never-big-bang) | Migration: strangle, never big-bang |
| | [11](#11-operate-and-measure-runbooks-and-kpis) | Operate and measure: runbooks and KPIs |
| | [12](#12-plan-and-risks-phases-risks-next) | Plan and risks: phases, risks, next |

Then: [time plan](#time-plan), [how an answer is judged](#how-an-answer-is-judged), [final checklist](#final-checklist), [traps](#traps), [walking a team through the design](#walking-a-team-through-the-design), [references](#references), [editing the diagrams](#editing-the-diagrams).

---

## The brief (fictional)

A small IT team runs a member portal for about forty partner organisations ("employers"). Their employees ("members") sign in to see their profile and contribution history, request changes (address, bank details) and download a yearly statement. Each organisation sends a contributions file every month. Staff process change requests in an old back office.

The portal is fifteen years old: an unsupported framework, one shared database, passwords stored by the portal, no automated tests, releases twice a year. Support calls are rising, two organisations complained about accessibility, and the framework's end of support is in 18 months. Members use two languages.

**The task:** plan the rebuild. You have three hours, a text editor and a diagram tool.

## Time plan

| Time | Do | Output |
| --- | --- | --- |
| 0:00-0:20 | Read twice, list assumptions and questions | Step 0 |
| 0:20-1:00 | Discovery plan, stakeholders, personas, journeys | Steps 1-2, two diagrams |
| 1:00-1:20 | Requirements, qualities and acceptance criteria for the MVP | Step 3 |
| 1:20-2:10 | Architecture, multi-tenancy, data model, security, accessibility, documents, integrations | Steps 4-9, two diagrams |
| 2:10-2:40 | Migration, operations, KPIs, plan and risks | Steps 10-12, one diagram |
| 2:40-3:00 | Re-read against the brief, fix gaps, write the summary on top | Final checklist |

**Draw five diagrams in the exam:** the stakeholder map, one journey as swimlanes, the architecture, the data model, the migration phases. This page has more because it teaches every step.

**If late:** at 2:10, finish steps 4-9 as three lines each and move on. A missing migration plan or risk list costs more than a thin integration section.

**Do** put a one-paragraph summary at the very top at the end: the reader may only read that. **Don't** spend an hour on one diagram: five clear diagrams beat one perfect one.

## How an answer is judged

Nobody runs your code. A reader looks for:

1. **Users first.** Did you start from who uses it and what hurts today, or from a tech stack?
2. **Reasoned trade-offs.** Every choice says what was rejected and why ("pool with RLS rather than schema per tenant, because ...").
3. **Risk handled.** Data leaks between organisations, the cutover, the yearly campaign, the people side.
4. **Delivery.** Small slices, early value, a way back if something goes wrong.
5. **Clarity.** Short headers, diagrams that match the text, assumptions stated.
6. **Working with people.** Workshops, sign-off, other teams, external providers: the job is not done alone.

---

## 0. Frame the problem: assumptions before answers

> **Remember:** write what you assume and what you would ask, before you design anything.

**Worked example.**

- **A1 Scale:** about 40,000 members; five organisations hold 60% of them. Peaks: the yearly statement week (about 12,000 sign-ins over five days) and the days after each monthly file.
- **A2 Users:** members (occasional, two languages, some with disabilities, many on phones), employer administrators (monthly, expert, desktop), staff (daily, power users).
- **A3 Membership:** each person is a member through one organisation, and keeps access after leaving that employer.
- **A4 Team:** three developers, one product owner, one operations engineer, who also keep the old portal running. No designer: user research and the accessibility audit are bought in.
- **A5 Time:** the framework's support ends in month 18; the yearly statements go out on a fixed date, in month 13 of the plan.
- **A6 Data:** personal and financial data under GDPR, hosted in the EU; accessibility law applies (step 7).
- **A7 Identity:** the operator already runs an identity provider (OpenID Connect, MFA); the portal's own passwords go.
- **A8 Rule:** a bank detail change above 1,000.00 a month needs two staff approvals (to confirm with the business owner).

*Questions I would ask first,* each with what the answer changes: Who signs off a change to how money is paid (decides the approval rule)? Which organisations have contractual service levels (decides the availability target)? Can bank detail changes be fully online, or does fraud risk require a call-back (a staff task, not a form)? Who owns the data in the old database (decides who signs off the migration)?

**Do**
- Number assumptions (A1, A2...) so later sections can cite them.
- Turn each big unknown into a question and say how the answer would change the design.

**Don't**
- Hide assumptions inside the design ("we will use 3 servers") where the reader cannot challenge them.
- Ask for more information and stop: assume, state it, and carry on.

**Go deeper:** [`32-casebook/casebook/00-brief.md`](../32-casebook/casebook/00-brief.md).

---

## 1. Gather information: many sources, one synthesis

> **Remember:** talk to people, read the old system, look at the data, then put it all in one place before deciding anything.

**Worked example.** Two weeks of discovery, planned in the answer:

| Source | What it gives | How |
| --- | --- | --- |
| Workshops with business units | goals, rules, who decides | 3 workshops of 2 hours: goals, current process walk-through, priorities |
| Interviews: 6 members, 4 employer admins, 3 staff | real tasks, pain, words they use | 45 minutes each, one script, two people (one asks, one notes); members in both languages, at least two who use assistive technology |
| Legacy app: screens, code, database | hidden business rules, real data shapes, data quality | screen inventory, read the calculation code, profile the tables |
| Help desk tickets, user requests | what goes wrong most | tag the last 6 months by journey and cause |
| Logs and analytics | what people actually do, on which devices | top pages, drop-off points, mobile share |
| Rules, policies, regulations | what must be true | list each rule with its source and owner |

Then **synthesise** in one place: an affinity map of everything heard, a glossary (what does "member", "effective date", "contribution period" mean to each group?), a rule list (each rule with its source: interview, code, policy), and open questions. The outputs are personas, as-is journeys with pain points, recovered business rules, data owners, and a **data quality profile**: duplicates, members without a valid email or postal address, invalid bank numbers. It sizes the account linking (step 10) and the postal fallback (step 8).

![From information gathering to journeys](diagrams/01-discovery.svg)

**Who to involve:** a power and interest map tells you how to treat each group. Write for each: what they need, what they fear, what they decide, how often you meet.

![Stakeholder map](diagrams/02-stakeholders.svg)

**Do**
- Read the legacy code and database as a source of truth for rules: users forget the edge cases the code still applies.
- Use the users' words in the glossary and later in the interface.
- Plan the playback: show what you understood to the same people before writing specs.

**Don't**
- Treat the old screens as the requirements ("rebuild it the same, but modern"). They show what was built, not what is needed.
- Only talk to managers. The people who do the task daily know where it breaks.
- Run discovery for three months. Time-box it, then learn by shipping.

**Go deeper:** sample [24 characterization](../24-characterization/) (recovering rules from legacy code with a golden master), [`32-casebook/casebook/01-discovery.md`](../32-casebook/casebook/01-discovery.md).

---

## 2. Map journeys: as-is pain, to-be flow

> **Remember:** one journey per important task, drawn across the people and systems it touches, with what hurts today and how you will measure the fix.

**Worked example.** Four core journeys cover most of the value:

1. Sign in and see my data (member).
2. Change my address or bank details (member, staff).
3. Get my yearly statement (member, campaign).
4. Send the monthly contributions file and fix the rejects (employer admin).

Journey 2, to-be, as swimlanes. The as-is version is a paper form, three weeks, no status and many help desk calls; the to-be adds re-authentication, a notice to the contact details already on file, a status the member can see, a second approver above the threshold, and an audit entry.

![Journey: change my bank details](diagrams/03-journey.svg)

**Do**
- Draw swimlanes (who does what), not just a list of screens.
- Mark the pain on the as-is and the metric on the to-be: "three weeks" becomes "applied within 5 working days, 80% online".
- Include the unhappy paths that matter: rejected request, wrong file, lost email.

**Don't**
- Draw twenty journeys. Four done well show the method.
- Forget staff and employer admins: back-office journeys are where the time goes.

**Go deeper:** [`32-casebook/casebook/02-personas-journeys.md`](../32-casebook/casebook/02-personas-journeys.md); Jeff Patton, *User Story Mapping*.

---

## 3. Write requirements: testable, traced, sliced

> **Remember:** each requirement points to a journey step, has acceptance criteria someone can test, and belongs to a release slice.

**Worked example.** Requirement REQ-05 for journey 2, with the threshold (A8) and its boundary:

```gherkin
@REQ-05 @journey-2
Rule: Above 1,000.00 a month, a bank detail change needs two different staff members

  Scenario Outline: one approval is enough up to the threshold, not above it
    Given alice is paid <amount> a month
    And alice requested a change to her bank details
    When staff member carol approves it
    Then the request is "<status>"

    Examples:
      | amount  | status                   |
      | 1000.00 | approved                 |
      | 1000.01 | awaiting second approval |

  Scenario: the same staff member cannot give both approvals
    Given alice is paid 2400.00 a month
    And alice requested a change to her bank details
    And staff member carol approved it
    When carol approves it again
    Then the approval is refused with "already approved by carol"
    And the request is "awaiting second approval"
```

Sample 23 runs this rule as a test (tagged `@REQ-02` there, in its own numbering).

**Qualities**, with numbers, next to the functional requirements:

- Availability: 99.5% of member requests succeed, each month.
- Speed: p95 page response under 1 s at the statement-week peak (A1).
- Recovery: at most 15 minutes of data lost (RPO), service back within 4 hours (RTO).
- Accessibility: WCAG 2.2 AA (step 7). Security: OWASP ASVS level 2 (step 6).
- Data: hosted in the EU; a retention period per kind of data (step 6).

Then slice: the **MVP** is journeys 1 and 2 for three pilot organisations, read-only contributions, address and bank changes. Statements and imports come later (step 10). Before building it, prototype the two journeys and test each with five users, in both languages, at least two of them using assistive technology.

**Do**
- Use Given/When/Then for rules with boundaries (threshold, dates, roles). Include the boundary values.
- Keep a traceability table: requirement, journey step, acceptance criteria, release. Tags on the scenarios make it checkable.
- Separate functional requirements from qualities, and give the qualities numbers.

**Don't**
- Write "the system shall be user-friendly". Write what a tester can check.
- Specify the user interface in the requirement ("a dropdown"). Specify the need; design solves it.

**Go deeper:** sample [23 specs](../23-specs/) (Gherkin rules run as tests, a traceability matrix), sample [22 playwright](../22-playwright/) (journeys as end-to-end tests); Gojko Adzic, *Specification by Example*.

---

## 4. Architecture: boring on purpose, every arrow a decision

> **Remember:** the simplest architecture that meets the qualities, drawn as containers, with a one-line reason for each choice.

**Worked example.**

- A **routing facade** in front of everything, so each path can go to the new portal or the legacy app (this is what makes step 10 possible).
- A **new portal** in Next.js (React, server-rendered: fast first load, forms work without JavaScript, good for accessibility). One deployable: pages and server actions call the **domain modules** (TypeScript) in-process. A REST API is added only for external callers.
- **PostgreSQL** with Row-Level Security for organisation isolation (step 5), an outbox table for events, and the job queue.
- **Job workers** for imports, PDFs and email, separate from web requests so a campaign cannot slow the portal.
- **Document storage** (an object store) for the PDFs. The **identity provider** the operator runs (A7) for sign-in: no passwords in the portal.
- An **email service** and a **print and post** provider; a **sync** between the legacy database and the new one, only during the migration.

![Target architecture](diagrams/04-architecture.svg)

**Architecture decision records**, one short file per choice: context, decision, consequences. Example: *"ADR-3: one PostgreSQL database with RLS for all organisations. Rejected: one database per organisation (forty databases to patch and back up for a five-person team). Consequence: every table carries org_id and every query runs under a policy."*

**Do**
- Name the qualities that drive the design (step 3) and show where each is handled.
- Prefer one language and one database engine for a small team. Fewer things to know at 2 a.m.

**Don't**
- Draw microservices for a team of five. A modular monolith with clear boundaries is the default.
- Draw boxes with no arrows, or arrows with no meaning. Each arrow is a call, an event or a file.

**Go deeper:** sample [20 portal](../20-portal/) (Next.js server components and server actions), [05 strangler fig](../05-strangler-fig/) (routing facade), [06 service reliability](../06-service-reliability/) (timeouts, retries); Simon Brown, C4 model; Michael Nygard, ADRs.

---

## 5. Multi-tenancy and data: tenant from the session, isolation in the database

> **Remember:** the organisation a request belongs to comes from the signed-in session, and the database refuses to return any other organisation's rows even if the code forgets.

This is the step most likely to be probed: one bug here leaks one organisation's members' salaries to another.

**Three models.** A tenant here is a partner organisation.

| Model | How | Good | Bad | Fits when |
| --- | --- | --- | --- | --- |
| **Pool** | shared tables, `org_id` on every row, Row-Level Security | cheap, one migration, scales to thousands | one table without a policy leaks, noisy neighbours | many tenants, same features |
| **Bridge** | one schema per organisation, same tables in each, one role per organisation | per-organisation export and restore, clear boundary | a migration runs N times, catalog bloat past a few hundred | tens to a few hundred tenants, some need their own restore |
| **Silo** | one database per organisation | strongest isolation, own backup, region, capacity | cost and operations grow per tenant | the few tenants who demand it |

**Worked example decision:** pool with RLS for all forty organisations, with the option to move one large organisation to a silo later if a contract requires it. A silo for each would mean forty migration runs, forty connection pools and a router, for no feature difference.

![Multi-tenancy](diagrams/05-multitenancy.svg)

**How the pool is made safe**, in order of importance:

1. **The tenant comes from the session.** After sign-in, the server finds the member by the token's issuer and subject (`iss`, `sub`) and keeps their organisation and role in the session. Never take `org_id` from the URL, a header or a form field.
2. **The database enforces it.** Every table with tenant data has `org_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and a policy `USING (org_id = NULLIF(current_setting('app.org', true), '')::int)` with the same expression `WITH CHECK`, so writes into another organisation fail too. The app connects as a role that owns no table and is `NOSUPERUSER NOBYPASSRLS`: owners (without `FORCE`), superusers and `BYPASSRLS` roles skip every policy.
3. **Per transaction, not per connection.** Each request runs in one transaction that starts with `SELECT set_config('app.org', $1, true)`: `true` makes it last only until the transaction ends, and unlike `SET LOCAL` it takes a bind parameter. A plain `SET` stays on the pooled connection, and the next request inherits the previous organisation.
4. **Fail closed.** With no organisation set, `current_setting('app.org', true)` returns null, or `''` on a pooled connection where it was set before; `NULLIF` turns both into null and the policy matches nothing. Staff who see all organisations get an explicit role and an audit entry.
5. **Keys lead with `org_id`.** Primary keys, unique constraints, indexes and foreign keys include `org_id`, so a row cannot point into another organisation and queries stay fast per organisation.
6. **Views too.** A view runs with its owner's rights and skips RLS, unless it is created `WITH (security_invoker = true)` (PostgreSQL 15 and later).

**Schema per tenant (bridge), if chosen.** `search_path` only decides where unqualified names are looked up; it does not stop `SELECT * FROM org_globex.members`. Isolation needs one role per organisation with rights on its own schema only, switched per transaction. Migrations run once per schema, so the code must handle both shapes until the last one is done.

![Data model](diagrams/06-data-model.svg)

The data model assumes one membership per person (A3), so `(iss, sub)` is unique on `member`. If a person could belong to two organisations, split it into `person (iss, sub)` and `membership (org_id, person_id)`.

**Do**
- Say which model, why, and what would make you change it.
- Show the request flow from token to query. Readers want to see where the tenant is set.
- Add a CI check that fails when a table with `org_id` has no policy or RLS is not forced.
- Mention the noisy neighbour: one large organisation's import must not slow the others (per-organisation limits, jobs in a queue).

**Don't**
- Rely on every developer remembering `WHERE org_id = ?`.
- Let the application connect as the table owner, a superuser or a `BYPASSRLS` role: RLS filters nothing for them.
- Pick a database per tenant "for security" without counting the operations cost.

**Go deeper:** sample [15 multi-tenancy](../15-multi-tenancy/) shows all three models failing and then fixed (forgotten `WHERE`, owner bypass, `SET` vs `SET LOCAL`, `search_path` is not a boundary, migration loop half done, moving a tenant to its own database); sample [01 CRUD + audit](../01-crud-audit/) and [17 audit outbox](../17-audit-outbox/) for the audit log; AWS *SaaS Tenant Isolation Strategies*; PostgreSQL *Row Security Policies*.

---

## 6. Security: defence in depth, worst case first

> **Remember:** name the worst thing that could leak or be changed, then show two independent layers that stop it.

**Worked example.** The worst cases: one organisation sees another's members; someone changes a member's bank account and diverts a payment; personal data leaks from a backup or an email.

![Security layers](diagrams/07-security.svg)

- **Identity:** sign-in through the identity provider the operator runs (A7), with OpenID Connect (authorisation code with PKCE, `state` and `nonce` checked); MFA for staff and employer admins. Employer admins may sign in with their own organisation's provider, federated into it. The new portal stores no passwords, which removes the old password table, a real risk today.
- **Authorisation:** roles per organisation (member, employer admin, staff), checked on every route and in every query. Another member's request answers 404, not 403, so ids do not reveal what exists.
- **Data isolation:** step 5. RLS does not stop SQL injection: injected SQL runs in the same transaction and can call `set_config` or `SET ROLE` itself. Parameterised queries stay mandatory.
- **Application:** OWASP ASVS 5.0 level 2 as the checklist: server-side validation, CSRF protection, a content security policy, safe redirects (only same-origin relative paths after login), dependency audit in CI.
- **Sensitive changes:** for bank details, re-authentication with MFA (`prompt=login` or `max_age=0`, then check `auth_time`); a notice to the email and phone already on file **when the request is made**, so the real member can stop a fraud; a 48 h hold before it applies; no bank change within 30 days of an email change without a call-back; a second staff approval above the threshold (A8).
- **Personal data:** minimise what is stored. Keep what the law requires (GDPR Art. 17(3)(b) allows refusing erasure for records kept by law) and erase the rest when its purpose ends, including in event logs and backups by crypto-shredding (delete the person's key; agree the method with the data protection officer). A DPIA before launch, a processor agreement with each provider (hosting, email, print), no production data in test.
- **Operations:** secrets in a vault, patching, tested backups, an append-only audit log, alerts on unusual access, an incident runbook.

**Do**
- Start from the threats (who would attack what, and how), then the controls. A short threat list beats a long control list.
- Tie security to journeys: "change bank details" is where fraud happens, so that journey gets the extra controls.

**Don't**
- Write "the system will be secure and GDPR compliant". Say how.
- Put personal data in emails, URLs or logs.

**Go deeper:** sample [26 SSO](../26-sso/) (OIDC with PKCE, state, nonce, safe `returnTo`, role mapping), [15 multi-tenancy](../15-multi-tenancy/), [18 crypto-shredding](../18-crypto-shredding/), [17 audit outbox](../17-audit-outbox/); OWASP ASVS; RFC 9700 (OAuth security best practice).

---

## 7. Accessibility: by design, not by audit

> **Remember:** accessibility is designed, built and tested on every release; the audit at the end only confirms it.

**Worked example.** The legal baseline is EN 301 549, which points to WCAG 2.1 AA, and RGAA 4.1.2 where French law applies. Target WCAG 2.2 AA, for the portal and the PDF statements: it adds focus not hidden behind other content, 24 px targets and accessible authentication.

![Accessibility lifecycle](diagrams/08-accessibility.svg)

- **Design:** contrast checked in the design tool, visible focus, plain language in both languages, components annotated with their accessible names.
- **Build:** semantic HTML first (real buttons, labels, fieldsets), errors in text tied to their field, an error summary that takes focus, forms that work without JavaScript, `lang` on the page and on any part in the other language.
- **Test:** an automated scan (axe) in CI on every page; a keyboard-only journey test for each core journey; a screen reader check of the four journeys before each release; zoom to 200% and reflow at 320 px wide. The identity provider's sign-in pages are part of the journey: they must allow paste and password managers (WCAG 3.3.8, accessible authentication). Assistive technology users take part in the usability tests (step 3).
- **Audit and declare:** an external audit before launch and an accessibility statement with a contact.
- **Listen:** a feedback channel, accessibility issues in the same backlog with a priority.

**Do**
- Say that automated tools find only part of the problems, and plan the manual checks.
- Include documents: tagged PDFs with a language and a reading order.

**Don't**
- Use placeholders as labels, colour alone for errors, or custom controls when native ones exist.
- Leave accessibility to one specialist at the end.

**Go deeper:** sample [21 accessibility](../21-accessibility/) (an inaccessible and an accessible form side by side, axe and a keyboard journey in Chromium), [30 pipeline](../30-pipeline/) (accessibility as a CI gate), [25 bilingual](../25-bilingual/) (two languages, `lang`, formats); WCAG 2.2; EN 301 549; RGAA 4.1.2; GOV.UK Design System error summary.

---

## 8. Documents: a PDF pipeline that can crash and resume

> **Remember:** one job per member and year, claimed with a lease, retried only for temporary errors, and recorded as sent so a rerun skips it; decide the one duplicate you cannot rule out.

**Worked example.** The yearly statement campaign for 40,000 members.

![PDF pipeline](diagrams/09-pdf-pipeline.svg)

1. **Freeze a snapshot** of the data for the year, so a late correction does not change half the statements.
2. **Create one job per (member, year)** with a unique key. Creating the campaign twice adds nothing.
3. **Workers claim jobs** in a short transaction: `UPDATE ... SET locked_by = $me, locked_until = now() + interval '5 minutes' WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, commit, then work. A crashed worker's lease expires and another worker takes the job over. The outcome is recorded only `WHERE locked_by = $me` (fencing), so a slow worker cannot overwrite the new owner's result.
4. **Render the PDF** from a template in the member's language, tagged for accessibility. With a fixed creation date and document ID (from the snapshot, not the clock), the same data gives the same bytes, so a rerun can be checked by hash.
5. **Store it** with its hash; the database keeps the key, not the file.
6. **Email a link,** never the PDF and no personal data in the body. The member signs in to download their own statement only. Members without a valid email (counted in step 1) get it by post.
7. **Retry** temporary errors (SMTP 4xx, HTTP 429 and 5xx, timeouts) with backoff; **dead letters** after N attempts or for permanent errors (SMTP 5xx, bad address), fixed and requeued by staff.
8. **Report:** sent, failed, downloaded, per organisation.

Before the run: a dry run on sample members checked by the business, throttling to the mail provider's limits, and the help desk told the date.

**Do**
- Say what happens if the job crashes halfway: it resumes from the jobs not yet recorded as sent.
- Name the one case you cannot avoid: a crash after the mail provider accepted a message but before it was recorded. Decide it: pass the job id as the provider's idempotency key if it has one; otherwise resend with the same Message-ID (many mail clients then show one message), or mark the job for checking instead.

**Don't**
- Generate 40,000 PDFs inside a web request or one long loop.
- Attach PDFs with personal data to emails.

**Go deeper:** sample [28 campaign](../28-campaign/) (PDF and email batch with `SKIP LOCKED`, a crash and resume, backoff, dead letters, throttling, a report), [19 leader election](../19-leader-election/) (one scheduler), [09 outbox](../09-outbox-polling/).

---

## 9. Integrations: core in the middle, adapters at the edge

> **Remember:** the domain never speaks another system's model; each integration has an owner, a format, a failure mode and someone who gets alerted.

**Worked example.**

![Integrations](diagrams/10-integrations.svg)

| Integration | Direction | Format | When it fails |
| --- | --- | --- | --- |
| Identity provider | in | OIDC | nobody can sign in: status page, help desk script |
| Legacy system | both, during migration | its database or API, through a translation layer | sync stops: reconciliation report flags the gap |
| Employer monthly files | in | CSV upload with a control total | file refused with reasons, the admin fixes and resends |
| Email service | out | SMTP or API | retry with backoff, dead letters |
| Print and post | out | PDF batch file | batch resent, staff alerted |
| Document storage | out | object store | job retried |
| Finance / payroll | out | events from the outbox | events wait in the outbox until delivered |

**The monthly file, in detail** (a common source of trouble): load into a staging table; check the control total (line count and amount sum) first, and refuse the whole file if it does not match, before anything is applied; validate every line against rules (types, member exists, period, amounts) and write rejects with a reason per line; show a dry-run diff (new, changed, unchanged, missing); apply in one transaction with an upsert on the natural key (organisation, member, period); record the file by its hash so the same file twice does nothing. A corrected file for the same period is a new version: its lines replace the same (member, period), and lines it no longer contains are reported to the admin, never deleted silently.

**Do**
- Use an outbox for events: the business change and the event are written in one transaction, then a relay delivers them. Delivery is at least once, so each consumer drops an event id it has already seen.
- Make every inbound load idempotent and every outbound call retryable.

**Don't**
- Let the legacy data model leak into the new domain: translate at the edge (anti-corruption layer).
- Write to two systems in one request and hope both succeed (the dual-write problem).

**Go deeper:** sample [27 import](../27-import/) (staging, rejects, dry run, upsert, file hash, control totals), [09 outbox polling](../09-outbox-polling/), [10 CDC](../10-cdc-debezium/), [08 saga](../08-saga/); Hohpe and Woolf, *Enterprise Integration Patterns*.

---

## 10. Migration: strangle, never big-bang

> **Remember:** put a facade in front of the old system, move one capability at a time to real users, and keep a one-switch way back at every step.

**Worked example.** Dated against the end of support in month 18 (A5):

![Migration phases](diagrams/11-migration.svg)

- **Phase 0, prepare (months 1-3):** the routing facade in front of the legacy app; sign-in through the identity provider for both; characterisation tests that record what the legacy calculations return today. **Account linking** for about 40,000 members: on the first visit, a member signs in with the identity provider and proves once who they are (member number, date of birth and a one-time code sent to the email or phone on file, or a letter when there is none); the portal stores their `(iss, sub)`. The legacy password table is deleted at the switch-off.
- **Phase 1, read-only (months 3-6):** profile and contributions served by the new portal from data synced from legacy. Low risk, immediate value, proves the platform.
- **Phase 2, change requests (months 6-10):** requests and the staff queue move to the new portal, which owns them; approved changes are written back to legacy through the outbox. One owner per entity at any time.
- **Phase 3, statements (months 10-13):** the PDF pipeline runs the campaign in month 13. A go/no-go in month 11: if not ready, legacy runs it once more, still inside its support.
- **Phase 4, employer imports (months 12-16):** the new file format, piloted with three organisations, then the rest in waves of six or seven; both formats accepted for a transition period.
- **Phase 5, switch off (month 17):** legacy becomes a read-only archive, then is deleted, one month before its support ends.

Statements come before imports because the campaign date is fixed and comes once a year: missing it means a year more on legacy. Imports can move in any month. ([`32-casebook`](../32-casebook/casebook/08-migration-plan.md) moves imports first; that works too, as long as the campaign date is met.)

At every phase: a **parallel run** for reads and calculations (old and new answer the same request, differences reported), a **shadow run** for writes and emails (the new side computes what it would write or send, without doing it, and the results are compared), a **feature flag per organisation** (pilot with three first), **rollback in one switch** at the facade, **daily reconciliation** of the synced data, and **exit criteria** (KPIs met, no blocking defect) before the next phase.

**Do**
- Start with read-only and low-risk slices; move writes when the data sync is proven.
- Schedule the switch-off. A migration that never deletes the old system costs double forever.
- Plan the people side: training for staff, a message to members, the help desk ready.

**Don't**
- Freeze the old system and rewrite everything before anyone uses it.
- Change the data model and the business rules and the interface in the same step: one at a time.

**Go deeper:** samples [05 strangler fig](../05-strangler-fig/), [04 parallel run](../04-parallel-run/), [24 characterization](../24-characterization/), [02 expand / contract](../02-expand-contract/), [10 CDC](../10-cdc-debezium/), and [MIGRATION-PATTERNS.md](../MIGRATION-PATTERNS.md); Martin Fowler, *StranglerFigApplication*; *Patterns of Legacy Displacement*.

---

## 11. Operate and measure: runbooks and KPIs

> **Remember:** every recurring operation is a written runbook that can be run step by step, and every goal is a KPI with a target and an owner.

**Worked example.**

![Operate and measure](diagrams/12-operate-measure.svg)

- **Scheduled release** every two weeks: runbook with preconditions, migration, smoke test, one-step rollback.
- **Monthly data update:** dry run, apply, reconcile, report to each organisation.
- **Yearly campaign:** step 8, with its own runbook and a go/no-go.
- **User requests:** triage by type, a service level, a runbook per common type.

Automate the runbooks step by step: first written, then scripted steps with manual confirmations, then fully automated with alerts.

**Run it:** structured logs with a request id and no personal data, metrics and alerts on the qualities of step 3, traces across portal and workers. Point-in-time backups, restored on a test server every month (RPO 15 minutes, RTO 4 hours). Three environments (development, test with generated data, production), deployed by the same pipeline.

**KPIs:**

| KPI | Definition | Target (example) | Owner |
| --- | --- | --- | --- |
| Adoption | members who signed in during the year / eligible members | 50% in year one | product owner |
| Changes done online | changes requested online / all changes | 80% | product owner |
| Time to apply a change, p95 | request to applied, in working days | 2 (address), 5 (bank details, hold included) | staff team lead |
| Availability of member requests (SLI) | successful member requests / all, per month | 99.5% | operations engineer |
| Help desk calls per 1,000 members | calls a month / members x 1,000 | down 40% | help desk lead |
| Files accepted first time | files applied without a resend / files received | 90% | product owner |
| Open blocking accessibility issues | issues that stop a task, from audit and feedback | 0 | product owner |

**Do**
- Measure outcomes (tasks done, time saved, calls avoided), not output (features shipped).
- Use percentiles for time, not averages.

**Don't**
- List KPIs with no definition, target or owner: they will never be looked at.

**Go deeper:** samples [31 runbook](../31-runbook/), [29 KPIs](../29-kpis/), [30 pipeline](../30-pipeline/); Google SRE book, *Service Level Objectives*; Dan Slimmon, *Do-nothing scripting*.

---

## 12. Plan and risks: phases, risks, next

> **Remember:** a plan the reader could start on Monday, the few risks that would kill it, and what you would do with more time.

**Worked example.** The phases and dates are step 10; the team is A4.

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Data leak between organisations | low | very high | RLS forced on every table, CI check, tests that try to read another organisation | technical lead |
| Legacy rules misunderstood | high | high | characterisation tests, parallel run, business sign-off per rule | business owner |
| Data sync drifts during migration | medium | high | one owner per entity, daily reconciliation, alerts | technical lead |
| Campaign fails at scale | medium | high | dry run, throttling, resumable jobs, rehearsal on a copy | operations engineer |
| End of support (month 18) missed, team stretched between old and new | medium | very high | dated phases, campaign go/no-go in month 11 with legacy as fallback, legacy feature freeze, cut scope before quality, audit bought in | product owner |
| Members cannot link their accounts | medium | high | linking flow tested with users, letter fallback, help desk script, legacy sign-in kept until each phase's exit | product owner |

**Next with more time:** run the discovery for real, validate personas, run the prototype tests of step 3, estimate the phases with the team.

**Do**
- Give each risk an owner and an action, not just a colour.
- End with what you would validate first and how.

**Don't**
- List twenty risks. A handful of real ones show judgement.

**Go deeper:** [`32-casebook/casebook/09-risks.md`](../32-casebook/casebook/09-risks.md).

---

## Final checklist

- [ ] One-paragraph summary at the top.
- [ ] Assumptions numbered and cited.
- [ ] Every requirement traces to a journey step and has acceptance criteria; qualities have numbers.
- [ ] Multi-tenancy: model chosen with reasons, tenant from the session, isolation in the database.
- [ ] Security: worst cases named, two layers each.
- [ ] Accessibility: legal baseline and target level, how it is built and tested, documents included.
- [ ] The campaign and the monthly import can crash and resume.
- [ ] Migration: dated phases inside the deadline, a way back at each, a switch-off date.
- [ ] KPIs and risks with owners.
- [ ] Five diagrams that match the text; names are the same everywhere.

## Traps

| Trap | Instead |
| --- | --- |
| Starting with the tech stack | start with users, journeys and constraints |
| Big-bang rewrite | strangler, slice by slice |
| "Secure", "scalable", "user-friendly" with no detail | say how, with a number or a mechanism |
| One huge diagram | one diagram per question, five in total |
| Ignoring the back office | staff and employer admins have journeys too |
| Forgetting the people | workshops, sign-off, training, help desk, external providers |

## Walking a team through the design

The written answer is also the script for presenting it to the team or the business:

- Start from the users and the pain, then the decisions, one diagram per decision.
- Back each choice with evidence: what you heard in discovery, a number from the logs, a rule found in the legacy code, a sample that shows it working.
- Say what you rejected and why, and what would make you change your mind.
- Before leaving each decision, invite the strongest objection ("what would break this?"); answer it, or add it to the risks with an owner.
- End with what you need from the room: a decision, an owner, a date.

## References

Discovery and journeys
- Docs: "How the discovery phase works", GOV.UK Service Manual. https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works
- Book: *Just Enough Research*, Erika Hall, 2nd edition, 2019.
- Book: *Continuous Discovery Habits*, Teresa Torres, 2021.
- Book: *User Story Mapping*, Jeff Patton, 2014.
- Book: *Mapping Experiences*, James Kalbach, 2nd edition, 2020.

Requirements
- Article: "Introducing BDD", Dan North, 2006. https://dannorth.net/introducing-bdd/
- Book: *Specification by Example*, Gojko Adzic, 2011.

Architecture
- Docs: The C4 model, Simon Brown. https://c4model.com/
- Article: "Documenting Architecture Decisions", Michael Nygard, 2011. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

Multi-tenancy
- Whitepaper: *SaaS Tenant Isolation Strategies*, AWS. https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html
- Docs: "Tenancy models for a multitenant solution", Azure Architecture Center. https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models
- Docs: "Row Security Policies", PostgreSQL. https://www.postgresql.org/docs/current/ddl-rowsecurity.html

Security and personal data
- Standard: OWASP Application Security Verification Standard (ASVS) 5.0. https://owasp.org/www-project-application-security-verification-standard/
- Docs: OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/
- Spec: OpenID Connect Core 1.0. https://openid.net/specs/openid-connect-core-1_0.html
- RFC 9700: Best Current Practice for OAuth 2.0 Security, 2025. https://www.rfc-editor.org/rfc/rfc9700
- Regulation: GDPR, Regulation (EU) 2016/679. https://eur-lex.europa.eu/eli/reg/2016/679/oj

Accessibility
- Standard: WCAG 2.2, W3C. https://www.w3.org/TR/WCAG22/
- Standard: EN 301 549 V3.2.1, accessibility requirements for ICT products and services, ETSI. https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
- Standard: RGAA 4.1.2, French government accessibility framework. https://accessibilite.numerique.gouv.fr/
- Docs: Error summary, GOV.UK Design System. https://design-system.service.gov.uk/components/error-summary/

Integration and migration
- Book: *Enterprise Integration Patterns*, Gregor Hohpe and Bobby Woolf, 2003.
- Article: "Pattern: Transactional outbox", Chris Richardson. https://microservices.io/patterns/data/transactional-outbox.html
- Article: "StranglerFigApplication", Martin Fowler. https://martinfowler.com/bliki/StranglerFigApplication.html
- Article series: "Patterns of Legacy Displacement", Ian Cartwright, Rob Horn, James Lewis. https://martinfowler.com/articles/patterns-legacy-displacement/
- Book: *Working Effectively with Legacy Code*, Michael Feathers, 2004.

Operations and measurement
- Book chapter: "Service Level Objectives", *Site Reliability Engineering*, Google. https://sre.google/sre-book/service-level-objectives/
- Article: "Do-nothing scripting: the key to gradual automation", Dan Slimmon, 2019. https://blog.danslimmon.com/2019/07/15/do-nothing-scripting-the-key-to-gradual-automation/
- Research: DORA, software delivery performance metrics. https://dora.dev/

## Editing the diagrams

Each diagram exists twice: `diagrams/NN-name.excalidraw` (open it at https://excalidraw.com with Open, or in the Excalidraw editor plugin of your IDE) and `diagrams/NN-name.svg` (what this page shows). Files are numbered in step order. Both are generated from `diagrams/build.mjs` with `node diagrams/build.mjs` (Node 22, no dependencies), which also warns when an arrow crosses another or runs through a box. Either edit `build.mjs` and regenerate, or edit an `.excalidraw` file by hand and export it to SVG from Excalidraw; regenerating afterwards overwrites hand edits.

In Excalidraw, arrows stay attached where they were drawn when you move a box. The text uses Helvetica (font family 2, which Excalidraw 0.18 still opens but no longer offers); new text defaults to Excalifont, so pick a font to match. Excalidraw has no bold text: titles and frame names are bold only in the SVG, and a bold box has a thicker border in both.
