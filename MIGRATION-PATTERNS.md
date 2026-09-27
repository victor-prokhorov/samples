# Migration Patterns: A Research Map

As of 2026-09-26.

## How to use this map

The industry default for migrating a live system is incremental replacement behind a routing seam (Strangler Fig), never a big-bang rewrite. Everything below is a building block of that approach.

Each entry gives the pattern, the idea in one or two lines, who named or popularized it, and where to read it. Search terms are the names in **bold**; the people and books are the ones to look up.

**Caveat:** this was compiled from memory, not fetched from sources. Treat years and editions as approximate and confirm them when you research each entry.

## Strategy: rewrite or migrate incrementally

The consensus is to migrate in small, reversible steps that each ship to production. Full rewrites are the classic way migrations fail.

| Idea | What it says | Who | Where to read |
| --- | --- | --- | --- |
| **Second-system effect** | The replacement gets over-designed with everything the first one lacked | Fred Brooks | *The Mythical Man-Month* (1975) |
| **"Never rewrite from scratch"** | Netscape's rewrite threw away years of embedded bug fixes and cost them the market | Joel Spolsky | Essay "Things You Should Never Do, Part I" (2000) |
| **Legacy modernization as risk management** | Old systems are rarely the problem; context, incentives and scope are | Marianne Bellotti | *Kill It with Fire* (2021) |
| **Monolith First** | Start with a monolith, extract services once boundaries are known | Martin Fowler | martinfowler.com bliki "MonolithFirst" (2015) |
| **Microservices** (the term as used today) | Independently deployable services around business capabilities | James Lewis, Martin Fowler | Article "Microservices" (2014) |
| **The "R" strategies** | Retire, Retain, Rehost, Replatform, Repurchase, Refactor/Re-architect, Relocate | Gartner (5 Rs, around 2010); extended by AWS (6 Rs, Stephen Orban, around 2016; later 7 Rs) | AWS Prescriptive Guidance on migration strategies |

One more search term: **modular monolith**, the common middle ground where boundaries are enforced inside one deployable before any split.

## Incremental code migration patterns

Strangler Fig is the umbrella; the others are how you cut the seams it needs.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Strangler Fig** (originally "Strangler Application") | Put a routing layer (proxy, gateway, facade) in front of the old system, move one capability at a time to the new one, until the old one can be switched off. Named after figs that grow around a host tree | Martin Fowler | Bliki "StranglerFigApplication" (2004, renamed 2019); Sam Newman, *Monolith to Microservices* (2019), chapter 3 |
| **Branch by Abstraction** | Put an abstraction in front of the code to replace, build the new implementation behind it on trunk, switch, delete the old one. No long-lived branch | Paul Hammant (named it around 2007); Jez Humble, David Farley | *Continuous Delivery* (2010); Fowler bliki "BranchByAbstraction" |
| **Anti-Corruption Layer** | A translation layer so the new model is not polluted by the legacy model's concepts | Eric Evans | *Domain-Driven Design* (2003) |
| **Bubble Context** | Start DDD in a small, protected new area surrounded by legacy, fed through an ACL | Eric Evans | Paper "Getting Started with DDD When Surrounded by Legacy Systems" (2013) |
| **Bounded Context** | Split along models that mean one thing; the natural extraction boundaries | Eric Evans; Vaughn Vernon | *Domain-Driven Design* (2003); *Implementing Domain-Driven Design* (2013) |
| **Patterns of Legacy Displacement** | A catalogue for replacing legacy: Transitional Architecture, Legacy Mimic, Event Interception, Divert the Flow, Feature Parity, Extract Product Lines, Critical Aggregator, Revert to Source | Ian Cartwright, Rob Horn, James Lewis (Thoughtworks) | martinfowler.com series "Patterns of Legacy Displacement" (from 2021) |
| **Decorating Collaborator** / **UI Composition** | Wrap calls to the old system to trigger new behavior; migrate the UI page by page or widget by widget | Sam Newman | *Monolith to Microservices* (2019) |
| **Seams** and **characterization tests** | A seam is a place to change behavior without editing that code; characterization tests pin down what legacy code actually does before you touch it | Michael Feathers | *Working Effectively with Legacy Code* (2004) |
| **Refactoring** | Small behavior-preserving steps, each kept green | Martin Fowler | *Refactoring* (1999; 2nd ed. 2018, JavaScript) |
| **Mikado Method** | Try the change, note what breaks, revert, fix the prerequisites first; builds a dependency graph of a large refactor | Ola Ellnestam, Daniel Brolund | *The Mikado Method* (2014) |

Newman's *Monolith to Microservices* is the single best book for this section. It covers most of these patterns with migration examples.

## Release and traffic patterns

These separate deploying the new path from trusting it. That is what makes each strangler step reversible.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Feature toggles** (feature flags) | Switch code paths at runtime; release toggles, ops toggles, experiment toggles, permission toggles | Pete Hodgson | Article "Feature Toggles (aka Feature Flags)" on martinfowler.com (2017) |
| **Parallel Run** | Run old and new side by side on the same input, compare results, serve the old result until they match | Sam Newman | *Monolith to Microservices* (2019) |
| **Scientist** (experiment / shadow compare) | Library that runs the candidate code next to the control and reports mismatches | Jesse Toth (GitHub) | GitHub blog "Scientist: Measure Twice, Cut Over Once" (2016); `github/scientist` |
| **Dark launching** / **shadow traffic** | Send real production traffic to the new path without exposing its output to users | Popularized by Facebook (Gatekeeper, late 2000s) | Search "dark launch" and "traffic shadowing" (Envoy, Istio mirroring) |
| **Canary release** | Route a small share of users to the new version, watch metrics, widen gradually | Danilo Sato | Bliki "CanaryRelease" (2014) |
| **Blue-green deployment** | Two identical environments; switch the router; switch back to roll back | Dan North, Jez Humble (credited); written up by Martin Fowler | Bliki "BlueGreenDeployment" (2010); *Continuous Delivery* (2010) |
| **Trunk-based development** | Everyone integrates to trunk daily; pairs with branch by abstraction and toggles | Paul Hammant (trunkbaseddevelopment.com) | *Accelerate* by Nicole Forsgren, Jez Humble, Gene Kim (2018) for the evidence |

## Database and schema migration

Data outlives code, so the standard is expand/contract: every schema change ships in backward-compatible steps, and old and new code must both run against the schema at every point.

| Pattern / tool | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Expand / Contract** (Parallel Change) | Expand: add the new column or table alongside the old. Migrate: backfill, write both, move readers. Contract: drop the old | Danilo Sato (bliki name); the practice comes from evolutionary database design | Bliki "ParallelChange" (2014) |
| **Refactoring Databases** | A catalogue of small database refactorings, each with a transition period where old and new schema coexist | Scott Ambler, Pramod Sadalage | *Refactoring Databases: Evolutionary Database Design* (2006) |
| **Evolutionary Database Design** | Versioned migrations in source control, applied by every developer and every environment | Pramod Sadalage, Martin Fowler | Article "Evolutionary Database Design" on martinfowler.com (2003, updated 2016) |
| **Four-phase online migration** | Dual write to old and new, backfill, read from new, stop writing old. Each phase verified before the next | Jacqueline Xu (Stripe) | Stripe engineering blog "Online migrations at scale" (2017) |
| **Online schema change** | Copy the table in the background, stream ongoing changes, swap atomically, no long locks | GitHub (`gh-ost`, 2016); Percona (`pt-online-schema-change`) | Their READMEs; for Postgres, search `pgroll` (Xata) and `reshape` |
| **Versioned migration tools** | Ordered, recorded migrations | Axel Fontaine (Flyway); Nathan Voxland (Liquibase) | Flyway and Liquibase docs; in Node, Prisma Migrate, Knex, node-pg-migrate |
| **Database per service** / **shared database** (anti) | Each service owns its data; sharing a database couples releases | Chris Richardson | microservices.io; *Microservices Patterns* (2018) |
| **Split the database** patterns | Split table, move foreign-key relationship to code, database view as interim contract, database wrapping service | Sam Newman | *Monolith to Microservices* (2019), chapter 4 |

For data *movement* during a migration (copying from old store to new while both are live), CDC in the next section is the standard alternative to dual writes.

## Data movement and integration patterns

The recurring problem is the **dual write**: updating a database and telling another system are two non-atomic writes. These patterns exist to avoid it, or to keep history while doing it.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Change Data Capture** (CDC) / **transaction log tailing** | Read committed changes from the database's log (Postgres WAL, MySQL binlog) and stream them out | Debezium (Red Hat; Gunnar Morling was a long-time lead) | debezium.io docs; Chris Richardson's "Transaction log tailing" on microservices.io |
| **The log as unifying abstraction** | An append-only, ordered log is the backbone of data integration; tables are a cache of the log | Jay Kreps (LinkedIn, Kafka co-creator) | Essay "The Log: What every software engineer should know..." (2013); *I Heart Logs* (2014) |
| **Turning the database inside out** | Treat the log as the source of truth and databases, caches, indexes as derived views | Martin Kleppmann | Talk (2014); *Making Sense of Stream Processing* (2016); *Designing Data-Intensive Applications* (2017) |
| **Transactional Outbox** | Write the event to an outbox table in the same transaction as the business change; a relay publishes it | Chris Richardson (popularized the name) | microservices.io; *Microservices Patterns* (2018); Gunnar Morling, Debezium blog "Reliable Microservices Data Exchange With the Outbox Pattern" (2019) |
| **Polling Publisher** | The simpler outbox relay: poll unpublished rows | Chris Richardson | microservices.io |
| **Event Sourcing** | Persist state as an append-only sequence of events; current state is a fold over them | Martin Fowler (early write-up, 2005); Greg Young (popularized it with CQRS from about 2010, founded EventStoreDB) | Fowler article "Event Sourcing"; Greg Young, "CQRS Documents" (2010) and *Versioning in an Event Sourced System* (Leanpub); Microsoft p&p, *Exploring CQRS and Event Sourcing* (2012) |
| **CQRS** | Separate the write model from read models | Greg Young (coined, about 2010); Udi Dahan (early advocate); rooted in Bertrand Meyer's **CQS** | Meyer, *Object-Oriented Software Construction* (1988) for CQS; Fowler bliki "CQRS" (2011) |
| **Event Storming** / **Event Modeling** | Workshop techniques to discover the events of a domain before building | Alberto Brandolini; Adam Dymitruk | *Introducing EventStorming* (Leanpub); eventmodeling.org |
| **Saga** | A long-running business transaction as a sequence of local transactions with compensating actions, instead of distributed 2PC | Hector Garcia-Molina, Kenneth Salem | Paper "Sagas" (SIGMOD 1987); Richardson, *Microservices Patterns* (2018), choreography vs orchestration |
| **Idempotent Receiver** / **Idempotent Consumer** | Deduplicate by message id so at-least-once delivery is safe | Gregor Hohpe, Bobby Woolf | *Enterprise Integration Patterns* (2003); microservices.io "Idempotent Consumer" |
| **Audit Log** and **temporal patterns** | Record who changed what and when; model time explicitly (effective vs recorded time, bitemporal data) | Martin Fowler; Richard Snodgrass | Fowler's "Temporal Patterns" essays (around 2005); Snodgrass, *Developing Time-Oriented Database Applications in SQL* (1999); SQL:2011 temporal tables |
| **Tolerant Reader** | Consumers read only what they need and ignore unknown fields, so producers can evolve | Martin Fowler | Bliki "TolerantReader" (2011) |
| **Consumer-Driven Contracts** | Consumers publish their expectations as tests the provider runs | Ian Robinson | Article on martinfowler.com (2006); tooling: Pact |

Broader references for this section: *Patterns of Enterprise Application Architecture* (Fowler, 2002) and *Designing Data-Intensive Applications* (Kleppmann), which is the book to read on replication, logs and consistency.

## Organization side

Migrations that ignore team structure tend to recreate the old architecture in the new system.

| Idea | What it says | Who | Where to read |
| --- | --- | --- | --- |
| **Conway's Law** | Systems mirror the communication structure of the organization that builds them | Melvin Conway | Paper "How Do Committees Invent?" (1968) |
| **Inverse Conway Maneuver** | Shape the teams first to get the architecture you want | Term from Thoughtworks (Jonny LeRoy, Matt Simons, around 2010) | *Team Topologies* (2019) |
| **Team Topologies** | Four team types (stream-aligned, platform, enabling, complicated-subsystem), three interaction modes, cognitive load as a design limit | Matthew Skelton, Manuel Pais | *Team Topologies* (2019) |

## Reading list

If you read three: *Monolith to Microservices*, *Designing Data-Intensive Applications*, *Working Effectively with Legacy Code*.

| Book | Author(s) | Year (approx.) | Read it for |
| --- | --- | --- | --- |
| *Monolith to Microservices* | Sam Newman | 2019 | Strangler fig, branch by abstraction, parallel run, splitting the database |
| *Designing Data-Intensive Applications* | Martin Kleppmann | 2017 | Logs, replication, CDC, event sourcing, consistency trade-offs |
| *Working Effectively with Legacy Code* | Michael Feathers | 2004 | Seams, characterization tests, getting legacy under test |
| *Microservices Patterns* | Chris Richardson | 2018 | Outbox, saga, CQRS, event sourcing in services, database per service |
| *Refactoring Databases* | Scott Ambler, Pramod Sadalage | 2006 | Expand/contract and transition periods for schema changes |
| *Domain-Driven Design* | Eric Evans | 2003 | Bounded contexts, anti-corruption layer: where to cut |
| *Implementing Domain-Driven Design* | Vaughn Vernon | 2013 | Practical DDD, aggregates, domain events, event sourcing |
| *Enterprise Integration Patterns* | Gregor Hohpe, Bobby Woolf | 2003 | Messaging vocabulary: idempotent receiver, guaranteed delivery, channels |
| *Continuous Delivery* | Jez Humble, David Farley | 2010 | Branch by abstraction, blue-green, deployment pipelines |
| *Building Microservices* (2nd ed.) | Sam Newman | 2021 | Service boundaries, communication styles, the broader context |
| *Kill It with Fire* | Marianne Bellotti | 2021 | The organizational and risk side of modernization |
| *Refactoring* (2nd ed.) | Martin Fowler | 2018 | Small safe steps as a discipline |
| *Team Topologies* | Matthew Skelton, Manuel Pais | 2019 | Aligning teams with the target architecture |
| *The Mythical Man-Month* | Fred Brooks | 1975 | Second-system effect, why rewrites overrun |
| *I Heart Logs* | Jay Kreps | 2014 | Short and foundational on the log |

Online, keep these open: martinfowler.com (bliki plus the Legacy Displacement series), microservices.io (Chris Richardson), and the debezium.io blog.

## Runnable samples in this repo

Nine of these patterns run end to end here, in TypeScript, numbered by complexity, each with a run script and a proof log. Concepts for each are explained in [README.md](README.md).

| # | Folder | Pattern from this map | Run | Proof |
| --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | Audit Log (same-transaction before/after rows) | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | Expand / Contract (Parallel Change) with rolling deploys | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | Event Sourcing, optimistic concurrency, projections | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | Parallel Run with a Scientist-style experiment | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | Strangler Fig behind a routing proxy | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| 06 | [`06-saga/`](06-saga/) | Saga (orchestration) with compensations, a recoverable saga log and a durable timer woken by a poller | `./run-06-saga.sh` | [`logs/06-saga.log`](logs/06-saga.log) |
| 07 | [`07-outbox-polling/`](07-outbox-polling/) | Transactional Outbox with a Polling Publisher, Idempotent Consumer | `./run-07-outbox-polling.sh` | [`logs/07-outbox-polling.log`](logs/07-outbox-polling.log) |
| 08 | [`08-cdc-debezium/`](08-cdc-debezium/) | Change Data Capture via Postgres WAL and Debezium | `./run-08-cdc-debezium.sh` | [`logs/08-cdc-debezium.log`](logs/08-cdc-debezium.log) |
| 09 | [`09-outbox-debezium/`](09-outbox-debezium/) | Transactional Outbox relayed by transaction log tailing (Debezium EventRouter) | `./run-09-outbox-debezium.sh` | [`logs/09-outbox-debezium.log`](logs/09-outbox-debezium.log) |
| 13 | [`13-audit-outbox/`](13-audit-outbox/) | Audit Log shipped through per-service Transactional Outboxes to a central append-only store | `./run-13-audit-outbox.sh` | [`logs/13-audit-outbox.log`](logs/13-audit-outbox.log) |

Natural next ones, not built yet: choreographed saga over the outbox, branch by abstraction, feature-toggle cutover, and an anti-corruption layer in front of the legacy model.
