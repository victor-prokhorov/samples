# Rebuilding a member portal: scenario, time box and assumptions

## The scenario

A self-set design exercise on a fictional organisation, time-boxed to show how far a plan gets in three hours and what checking it catches. A small IT team runs a member portal for about forty partner organisations ("employers"). Their employees ("members") log in to see their profile and contribution history, request changes (address, bank details), and download an annual statement. Employers upload a contributions file every month. The portal is fifteen years old: server-rendered pages on an unsupported framework, one shared database, passwords stored by the portal, no automated tests, releases twice a year. Support calls are rising, two employers have complained about accessibility, and the framework's end of support is in 18 months.

The exercise: plan the rebuild. Find out what users need, decide what the new portal must do and how it is built, move from the old one to the new one without a big-bang cutover, and say how to know it worked.

## Time box: 3 hours

| Time | Block | Output |
| --- | --- | --- |
| 0:00-0:15 | Read the scenario, write assumptions and open questions | this page |
| 0:15-0:45 | Discovery plan, stakeholders, personas | [01-discovery.md](01-discovery.md), [02-personas-journeys.md](02-personas-journeys.md) |
| 0:45-1:30 | Journeys, requirements with acceptance criteria | [02-personas-journeys.md](02-personas-journeys.md), [03-requirements.md](03-requirements.md) |
| 1:30-2:10 | Architecture, data model, change request lifecycle | [04-architecture.md](04-architecture.md), [05-data-model.md](05-data-model.md), [06-change-request-lifecycle.md](06-change-request-lifecycle.md) |
| 2:10-2:30 | Accessibility and security approach | [07-accessibility-security.md](07-accessibility-security.md) |
| 2:30-2:50 | Migration plan, risks, KPIs | [08-migration-plan.md](08-migration-plan.md), [09-risks.md](09-risks.md), [10-kpis.md](10-kpis.md) |
| 2:50-3:00 | Review: traceability check, diagrams render, DDL applies | `../run.sh` |

The last ten minutes are not optional: a plan whose requirements have no acceptance criteria, or whose journeys need data the model cannot answer, is not finished.

## Assumptions (to confirm in discovery)

- A1. About 40,000 members across the employers; 5 employers hold 60% of them.
- A2. Each employer has one or two HR administrators who upload the monthly file; formats differ today.
- A3. Staff (4 people) process change requests by hand, in the old back office.
- A4. Members use two languages, French and English; both are required on every page and document.
- A5. The organisation is subject to GDPR and must meet WCAG 2.2 AA (RGAA 4.1 in France).
- A6. The team is 5 people: 3 developers, 1 product owner, 1 operations engineer. A rewrite cannot stop the old portal from being maintained.
- A7. Members already have an account with an identity provider the organisation runs, or can get one; the portal should not store passwords any more.

## Open questions

- Q1. Which employers have contractual service levels for change requests, and what are they?
- Q2. Can bank detail changes be fully online, or does fraud risk require a call-back?
- Q3. Who owns the data in the old database: the portal team, or the back office team?
- Q4. Is there a budget for an external accessibility audit before launch?

## What I would do with more time

Validate A1-A7 with real numbers from the old portal's logs and the support queue, run the first two weeks of discovery before fixing any requirement, prototype the change request form and test it with five members including screen reader users, and spike the identity provider integration, which is the riskiest technical dependency.
