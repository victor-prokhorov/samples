# Migration Patterns: A Research Map

As of 2026-10-03. Every link below was checked on that date; a source that could not be found online is cited by title only.

## How to use this map

The industry default for migrating a live system is incremental replacement behind a routing seam (Strangler Fig), never a big-bang rewrite. Everything below is a building block of that approach.

Each entry gives the pattern, the idea in one or two lines, who named or popularized it, and where to read it. Search terms are the names in **bold**; the people and books are the ones to look up. The last section maps the patterns to the samples in this repo that run them.

## Strategy: rewrite or migrate incrementally

The consensus is to migrate in small, reversible steps that each ship to production. Full rewrites are the classic way migrations fail.

| Idea | What it says | Who | Where to read |
| --- | --- | --- | --- |
| **Second-system effect** | The replacement gets over-designed with everything the first one lacked | Fred Brooks | *The Mythical Man-Month* (1975) |
| **"Never rewrite from scratch"** | Netscape's rewrite threw away years of embedded bug fixes and cost them the market | Joel Spolsky | [Things You Should Never Do, Part I](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) (2000) |
| **Legacy modernization as risk management** | Old systems are rarely the problem; context, incentives and scope are | Marianne Bellotti | *Kill It with Fire* (2021) |
| **Monolith First** | Start with a monolith, extract services once boundaries are known | Martin Fowler | [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) (bliki, 2015) |
| **Microservices** (the term as used today) | Independently deployable services around business capabilities | James Lewis, Martin Fowler | [Microservices](https://martinfowler.com/articles/microservices.html) (2014) |
| **The "R" strategies** | Retire, Retain, Rehost, Relocate, Repurchase, Replatform, Refactor or re-architect | Gartner (5 Rs); extended by AWS (6 Rs, then 7 Rs) | AWS Prescriptive Guidance, [About the migration strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html) |

One more search term: **modular monolith**, the common middle ground where boundaries are enforced inside one deployable before any split.

## Incremental code migration patterns

Strangler Fig is the umbrella; the others are how you cut the seams it needs.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Strangler Fig** (originally "Strangler Application") | Put a routing layer (proxy, gateway, facade) in front of the old system, move one capability at a time to the new one, until the old one can be switched off. Named after figs that grow around a host tree | Martin Fowler | [StranglerFigApplication](https://www.martinfowler.com/bliki/StranglerFigApplication.html) (bliki, 2004, since revised); Sam Newman, [*Monolith to Microservices*](https://samnewman.io/books/monolith-to-microservices/) (2019), chapter 3 |
| **Branch by Abstraction** | Put an abstraction in front of the code to replace, build the new implementation behind it on trunk, switch, delete the old one. No long-lived branch | Paul Hammant named it (crediting Stacy Curl for the idea); Jez Humble, David Farley | [BranchByAbstraction](https://martinfowler.com/bliki/BranchByAbstraction.html) (bliki, 2014); *Continuous Delivery* (2010); [trunkbaseddevelopment.com](https://github.com/paul-hammant/tbd) (its source) |
| **Anti-Corruption Layer** | A translation layer so the new model is not polluted by the legacy model's concepts | Eric Evans | *Domain-Driven Design* (2003) |
| **Bubble Context** | Start DDD in a small, protected new area surrounded by legacy, fed through an ACL | Eric Evans | Paper "Getting Started with DDD When Surrounded by Legacy Systems" (2013) |
| **Bounded Context** | Split along models that mean one thing; the natural extraction boundaries | Eric Evans; Vaughn Vernon | *Domain-Driven Design* (2003); *Implementing Domain-Driven Design* (2013) |
| **Patterns of Legacy Displacement** | A catalogue for replacing legacy: [Transitional Architecture](https://www.martinfowler.com/articles/patterns-legacy-displacement/transitional-architecture.html), [Legacy Mimic](https://martinfowler.com/articles/patterns-legacy-displacement/legacy-mimic.html), [Event Interception](https://martinfowler.com/articles/patterns-legacy-displacement/event-interception.html), [Divert the Flow](https://martinfowler.com/articles/patterns-legacy-displacement/divert-the-flow.html), [Feature Parity](https://martinfowler.com/articles/patterns-legacy-displacement/feature-parity.html), Extract Product Lines, [Critical Aggregator](https://martinfowler.com/articles/patterns-legacy-displacement/critical-aggregator.html), [Revert to Source](https://martinfowler.com/articles/patterns-legacy-displacement/revert-to-source.html), [Canary Release](https://martinfowler.com/articles/patterns-legacy-displacement/canary-release.html) | Ian Cartwright, Rob Horn, James Lewis (Thoughtworks) | martinfowler.com series "Patterns of Legacy Displacement" (from 2021), linked pattern by pattern |
| **Decorating Collaborator** / **UI Composition** | Wrap calls to the old system to trigger new behavior; migrate the UI page by page or widget by widget | Sam Newman | *Monolith to Microservices* (2019) |
| **Seams** and **characterization tests** | A seam is a place to change behavior without editing that code; characterization tests pin down what legacy code actually does before you touch it | Michael Feathers | *Working Effectively with Legacy Code* (2004); [Characterization test](https://en.wikipedia.org/wiki/Characterization_test) |
| **Refactoring** | Small behavior-preserving steps, each kept green | Martin Fowler | *Refactoring* (1999; 2nd ed. 2018, JavaScript) |
| **Mikado Method** | Try the change, note what breaks, revert, fix the prerequisites first; builds a dependency graph of a large refactor | Ola Ellnestam, Daniel Brolund | *The Mikado Method* (2014) |

Newman's *Monolith to Microservices* is the single best book for this section. It covers most of these patterns with migration examples.

## Release and traffic patterns

These separate deploying the new path from trusting it. That is what makes each strangler step reversible.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Feature toggles** (feature flags) | Switch code paths at runtime; release toggles, ops toggles, experiment toggles, permission toggles | Pete Hodgson | [Feature Toggles (aka Feature Flags)](https://www.martinfowler.com/articles/feature-toggles.html) (2017); vendor-neutral API: [OpenFeature](https://openfeature.dev/) |
| **Parallel Run** | Run old and new side by side on the same input, compare results, serve the old result until they match | Sam Newman | *Monolith to Microservices* (2019) |
| **Scientist** (experiment / shadow compare) | Library that runs the candidate code next to the control and reports mismatches | Jesse Toth (GitHub) | [GitHub blog post on Scientist](https://github.blog/developer-skills/application-development/scientist/) (2016); `github/scientist` |
| **Dark launching** / **shadow traffic** | Send real production traffic to the new path without exposing its output to users | Popularized by Facebook (late 2000s) | [DarkLaunching](https://martinfowler.com/bliki/DarkLaunching.html) (bliki); search "traffic shadowing" (Envoy, Istio mirroring) |
| **Canary release** | Route a small share of users to the new version, watch metrics, widen gradually | Danilo Sato | Bliki "CanaryRelease" (2014); [Canary Release](https://martinfowler.com/articles/patterns-legacy-displacement/canary-release.html) in the Legacy Displacement series |
| **Blue-green deployment** | Two identical environments; switch the router; switch back to roll back | Dan North, Jez Humble (credited); written up by Martin Fowler | [BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html) (bliki, 2010); *Continuous Delivery* (2010) |
| **Trunk-based development** | Everyone integrates to trunk daily; pairs with branch by abstraction and toggles | Paul Hammant | trunkbaseddevelopment.com ([source](https://github.com/paul-hammant/tbd)); *Accelerate* by Nicole Forsgren, Jez Humble, Gene Kim (2018) for the evidence |

## Database and schema migration

Data outlives code, so the standard is expand/contract: every schema change ships in backward-compatible steps, and old and new code must both run against the schema at every point.

| Pattern / tool | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Expand / Contract** (Parallel Change) | Expand: add the new column or table alongside the old. Migrate: backfill, write both, move readers. Contract: drop the old | Danilo Sato (bliki name); the practice comes from evolutionary database design | [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) (bliki, 2014) |
| **Refactoring Databases** | A catalogue of small database refactorings, each with a transition period where old and new schema coexist | Scott Ambler, Pramod Sadalage | *Refactoring Databases: Evolutionary Database Design* (2006) |
| **Evolutionary Database Design** | Versioned migrations in source control, applied by every developer and every environment | Pramod Sadalage, Martin Fowler | [Evolutionary Database Design](https://www.martinfowler.com/articles/evodb.html) (2003, revised 2016) |
| **Four-phase online migration** | Dual write to old and new, backfill, read from new, stop writing old. Each phase verified before the next | Jacqueline Xu (Stripe) | [Online migrations at scale](https://stripe.com/blog/online-migrations) (2017) |
| **Online schema change** | Copy the table in the background, stream ongoing changes, swap atomically, no long locks | GitHub ([`gh-ost`](https://github.com/github/gh-ost), 2016); Percona (`pt-online-schema-change`) | Their READMEs; for Postgres, [`pgroll`](https://github.com/xataio/pgroll) (Xata) and `reshape` |
| **Versioned migration tools** | Ordered, recorded migrations | Axel Fontaine (Flyway); Nathan Voxland (Liquibase) | Flyway and Liquibase docs; in Node, Prisma Migrate, Knex, node-pg-migrate |
| **Database per service** / **shared database** (anti) | Each service owns its data; sharing a database couples releases | Chris Richardson | microservices.io; *Microservices Patterns* (2018) |
| **Split the database** patterns | Split table, move foreign-key relationship to code, database view as interim contract, database wrapping service | Sam Newman | *Monolith to Microservices* (2019), chapter 4 |

For data *movement* during a migration (copying from old store to new while both are live), CDC in the next section is the standard alternative to dual writes.

## Data movement and integration patterns

The recurring problem is the **dual write**: updating a database and telling another system are two non-atomic writes. These patterns exist to avoid it, or to keep history while doing it.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Change Data Capture** (CDC) / **transaction log tailing** | Read committed changes from the database's log (Postgres WAL, MySQL binlog) and stream them out | Debezium (Red Hat; Gunnar Morling was a long-time lead) | [Debezium connector for PostgreSQL](https://debezium.io/documentation/reference/stable/connectors/postgresql.html); [Transaction log tailing](https://microservices.io/patterns/data/transaction-log-tailing.html) on microservices.io |
| **The log as unifying abstraction** | An append-only, ordered log is the backbone of data integration; tables are a cache of the log | Jay Kreps (LinkedIn, Kafka co-creator) | [The Log: What every software engineer should know about real-time data's unifying abstraction](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying) (2013); *I Heart Logs* (2014) |
| **Turning the database inside out** | Treat the log as the source of truth and databases, caches, indexes as derived views | Martin Kleppmann | [Turning the database inside-out with Apache Samza](https://martin.kleppmann.com/2015/03/04/turning-the-database-inside-out.html) (talk 2014, written up 2015); *Designing Data-Intensive Applications* |
| **Transactional Outbox** | Write the event to an outbox table in the same transaction as the business change; a relay publishes it | Chris Richardson (popularized the name) | [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html); *Microservices Patterns* (2018); Gunnar Morling, [Reliable Microservices Data Exchange With the Outbox Pattern](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/) (2019) |
| **Polling Publisher** | The simpler outbox relay: poll unpublished rows | Chris Richardson | [Polling publisher](https://microservices.io/patterns/data/polling-publisher.html) |
| **Event Sourcing** | Persist state as an append-only sequence of events; current state is a fold over them | Martin Fowler (early write-up, 2005); Greg Young (popularized it with CQRS from about 2010, founded EventStoreDB) | Fowler, [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html); Greg Young, [CQRS Documents](https://cqrs.wordpress.com/wp-content/uploads/2010/11/cqrs_documents.pdf) (2010) and *Versioning in an Event Sourced System* (Leanpub); Microsoft patterns & practices, *Exploring CQRS and Event Sourcing* (2012) |
| **CQRS** | Separate the write model from read models | Greg Young (coined, about 2010); Udi Dahan (early advocate); rooted in Bertrand Meyer's **CQS** | Meyer, *Object-Oriented Software Construction* (1988) for CQS; [CQRS](https://martinfowler.com/bliki/CQRS.html) (bliki, 2011) |
| **Event Storming** / **Event Modeling** | Workshop techniques to discover the events of a domain before building | Alberto Brandolini; Adam Dymitruk | *Introducing EventStorming* (Leanpub); [eventmodeling.org](https://eventmodeling.org/) |
| **Saga** | A long-running business transaction as a sequence of local transactions with compensating actions, instead of distributed 2PC | Hector Garcia-Molina, Kenneth Salem | Paper [Sagas](https://dl.acm.org/doi/10.1145/38713.38742) (SIGMOD 1987); Richardson, *Microservices Patterns* (2018), choreography vs orchestration |
| **Idempotent Receiver** / **Idempotent Consumer** | Deduplicate by message id so at-least-once delivery is safe | Gregor Hohpe, Bobby Woolf | *Enterprise Integration Patterns* (2003); [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html); for HTTP, Brandur Leach, [Implementing Stripe-like Idempotency Keys in Postgres](https://brandur.org/idempotency-keys) (2017) and the IETF draft [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) |
| **Circuit Breaker**, **Bulkhead**, **timeouts**, **retries with jittered backoff** | Stability patterns for calls between services: bound every call, isolate each dependency's resources, fail fast while it is down, retry only transient failures with randomized backoff | Michael Nygard (circuit breaker, bulkhead); Marc Brooker (full jitter) | *Release It!* (2007; 2nd ed. 2018); [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) (AWS Architecture Blog, 2015) |
| **Crypto-Shredding** / **Forgettable Payloads** | Encrypt each person's data with their own key and delete the key to erase it from immutable logs and backups; or keep the personal data in a deletable side store the events point to | Mathias Verraes (named both for event sourcing) | Verraes, [Crypto-Shredding](https://verraes.net/2019/05/eventsourcing-patterns-throw-away-the-key/) and [Forgettable Payloads](https://verraes.net/2019/05/eventsourcing-patterns-forgettable-payloads/) (2019); Oskar Dudycz, [How to deal with privacy and GDPR in Event-Driven systems](https://event-driven.io/en/gdpr_in_event_driven_architecture/) |
| **Multi-tenant isolation: silo, bridge, pool** | Per tenant, choose a database of its own, a schema of its own, or shared tables with a tenant id and row-level security; move tenants between models as they grow | AWS SaaS Factory (Tod Golding) | AWS whitepapers [SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html) and [SaaS Storage Strategies](https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/multi-tenant-saas-storage-strategies.html); PostgreSQL docs "Row Security Policies" |
| **Leases**, **leader election**, **fencing tokens** | One holder at a time through a time-bounded lease renewed by heartbeat; the storage rejects writes carrying an older term, since no lease alone prevents two leaders | Cary Gray, David Cheriton (leases); Mike Burrows (Chubby); Martin Kleppmann (fencing tokens) | Paper "Leases: An Efficient Fault-Tolerant Mechanism for Distributed File Cache Consistency" (SOSP 1989); paper [The Chubby lock service for loosely-coupled distributed systems](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/) (OSDI 2006); Kleppmann, [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) (2016) |
| **Audit Log** and **temporal patterns** | Record who changed what and when; model time explicitly (effective vs recorded time, bitemporal data) | Martin Fowler; Richard Snodgrass | Fowler's "Temporal Patterns" essays (mid-2000s); Snodgrass, *Developing Time-Oriented Database Applications in SQL* (1999); SQL:2011 temporal tables |
| **Tolerant Reader** | Consumers read only what they need and ignore unknown fields, so producers can evolve | Martin Fowler | [TolerantReader](https://martinfowler.com/bliki/TolerantReader.html) (bliki, 2011) |
| **Consumer-Driven Contracts** | Consumers publish their expectations as tests the provider runs | Ian Robinson | [Consumer-Driven Contracts: A Service Evolution Pattern](https://martinfowler.com/articles/consumerDrivenContracts.html) (2006); tooling: [Pact](https://docs.pact.io/) |

Broader references for this section: *Patterns of Enterprise Application Architecture* (Fowler, 2002) and *Designing Data-Intensive Applications* (Kleppmann), which is the book to read on replication, logs and consistency.

## Migrating with evidence: legacy rules, data, delivery and the plan

A migration also has to prove the new system computes the same answers, carry the data across, ship each step safely and be written down before anyone builds. These are the patterns behind samples 24, 27, 30, 32 and the planned 40.

| Pattern | Idea | Who | Where to read |
| --- | --- | --- | --- |
| **Characterization test** / **golden master** / **approval test** | Run the legacy code on many generated and boundary inputs, store its outputs in an approved file, and make the rewrite match it; every difference is explained by a rule and either kept or fixed on purpose | Michael Feathers (characterization tests); Llewellyn Falco (approval tests) | *Working Effectively with Legacy Code* (2004); [Characterization test](https://en.wikipedia.org/wiki/Characterization_test); [ApprovalTests resources](https://approvaltests.com/resources/) |
| **Feature Parity** (as a trap) and **Legacy Mimic** | Copying every legacy behavior is rarely wanted; decide feature by feature what to keep, and make the new system look like the old one to its neighbors while they still depend on it | Ian Cartwright, Rob Horn, James Lewis | [Feature Parity](https://martinfowler.com/articles/patterns-legacy-displacement/feature-parity.html); [Legacy Mimic](https://martinfowler.com/articles/patterns-legacy-displacement/legacy-mimic.html) |
| **Staged load with rejects and reconciliation** | Bulk-load each file into a staging table, validate it there, record every rejected row with its reason, apply the rest in one transaction, and reconcile counts and totals with what the sender declared | Ralph Kimball, Joe Caserta (error event table, audit dimension) | *The Data Warehouse ETL Toolkit* (2004); PostgreSQL [`COPY`](https://www.postgresql.org/docs/current/sql-copy.html) |
| **Revert to Source** | Feed the new system from where the data originates, not from the legacy system's copy of it | Ian Cartwright, Rob Horn, James Lewis | [Revert to Source](https://martinfowler.com/articles/patterns-legacy-displacement/revert-to-source.html) |
| **Transitional Architecture** | The temporary pieces (adapters, sync jobs, mimics) built only to make the migration possible, planned for removal from the start | Ian Cartwright, Rob Horn, James Lewis | [Transitional Architecture](https://www.martinfowler.com/articles/patterns-legacy-displacement/transitional-architecture.html) |
| **Deployment pipeline** | Every change passes the same automated gates in order, cheap checks first, and the artifact that was tested is the one that is deployed | Jez Humble, David Farley | [*Continuous Delivery*](https://martinfowler.com/books/continuousDelivery.html) (2010) |
| **Release toggle**, **percentage rollout**, **kill switch** | Ship the new path dark, turn it on for a share of users or tenants, switch it off without a deploy, then delete the flag | Pete Hodgson | [Feature Toggles (aka Feature Flags)](https://www.martinfowler.com/articles/feature-toggles.html) (2017); [OpenFeature](https://openfeature.dev/) |
| **Diagrams as code** and **a plan that traces** | Context and container diagrams kept next to the requirements, journeys mapped to requirements, a phased strangler plan with its risks, all checked against each other before building | Simon Brown (C4) | [The C4 model](https://c4model.com/); Karl Wiegers, Joy Beatty, *Software Requirements* (3rd ed., 2013) |

## Organization side

Migrations that ignore team structure tend to recreate the old architecture in the new system.

| Idea | What it says | Who | Where to read |
| --- | --- | --- | --- |
| **Conway's Law** | Systems mirror the communication structure of the organization that builds them | Melvin Conway | Paper [How Do Committees Invent?](https://www.melconway.com/Home/Committees_Paper.html) (1968); Fowler, [ConwaysLaw](https://martinfowler.com/bliki/ConwaysLaw.html) (bliki) |
| **Inverse Conway Maneuver** | Shape the teams first to get the architecture you want | Jonny LeRoy, Matt Simons (Cutter IT Journal, December 2010) | [ConwaysLaw](https://martinfowler.com/bliki/ConwaysLaw.html); *Team Topologies* (2019) |
| **Team Topologies** | Four team types (stream-aligned, platform, enabling, complicated-subsystem), three interaction modes, cognitive load as a design limit | Matthew Skelton, Manuel Pais | [*Team Topologies*](https://teamtopologies.com/book) (2019; 2nd ed. from IT Revolution) |

## Reading list

If you read three: *Monolith to Microservices*, *Designing Data-Intensive Applications*, *Working Effectively with Legacy Code*.

| Book | Author(s) | Year | Read it for |
| --- | --- | --- | --- |
| [*Monolith to Microservices*](https://samnewman.io/books/monolith-to-microservices/) | Sam Newman | 2019 | Strangler fig, branch by abstraction, parallel run, splitting the database |
| [*Designing Data-Intensive Applications*](https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html) | Martin Kleppmann (2nd ed. with Chris Riccomini) | 2017; 2nd ed. 2026 | Logs, replication, CDC, event sourcing, consistency trade-offs |
| *Working Effectively with Legacy Code* | Michael Feathers | 2004 | Seams, characterization tests, getting legacy under test |
| *Microservices Patterns* | Chris Richardson | 2018 | Outbox, saga, CQRS, event sourcing in services, database per service |
| *Refactoring Databases* | Scott Ambler, Pramod Sadalage | 2006 | Expand/contract and transition periods for schema changes |
| *Domain-Driven Design* | Eric Evans | 2003 | Bounded contexts, anti-corruption layer: where to cut |
| *Implementing Domain-Driven Design* | Vaughn Vernon | 2013 | Practical DDD, aggregates, domain events, event sourcing |
| *Enterprise Integration Patterns* | Gregor Hohpe, Bobby Woolf | 2003 | Messaging vocabulary: idempotent receiver, guaranteed delivery, channels |
| *Continuous Delivery* | Jez Humble, David Farley | 2010 | Branch by abstraction, blue-green, deployment pipelines |
| *The Data Warehouse ETL Toolkit* | Ralph Kimball, Joe Caserta | 2004 | Staging, error event tables, audit and reconciliation of loads |
| *Building Microservices* (2nd ed.) | Sam Newman | 2021 | Service boundaries, communication styles, the broader context |
| *Kill It with Fire* | Marianne Bellotti | 2021 | The organizational and risk side of modernization |
| *Refactoring* (2nd ed.) | Martin Fowler | 2018 | Small safe steps as a discipline |
| *Team Topologies* | Matthew Skelton, Manuel Pais | 2019 | Aligning teams with the target architecture |
| *The Mythical Man-Month* | Fred Brooks | 1975 | Second-system effect, why rewrites overrun |
| *I Heart Logs* | Jay Kreps | 2014 | Short and foundational on the log |

Online, keep these open: martinfowler.com (bliki plus the Legacy Displacement series), microservices.io (Chris Richardson), and the debezium.io blog.

## Runnable samples in this repo

Nineteen of these patterns run end to end here, in TypeScript, each with a run script and a proof log, numbered by complexity as in the [README](README.md); 40 is planned. The other samples (07, 13, 14, 16, 20-23, 25, 26, 28, 29, 31) are about APIs, scaling and building the product, outside this map. Each folder's README explains its concepts and quotes its log.

| # | Folder | Pattern from this map | Run | Proof |
| --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | Audit Log (same-transaction before/after rows) | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | Expand / Contract (Parallel Change) with rolling deploys | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | Event Sourcing, optimistic concurrency, projections | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | Parallel Run with a Scientist-style experiment | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | Strangler Fig behind a routing proxy | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| 06 | [`06-service-reliability/`](06-service-reliability/) | Idempotent Receiver over HTTP (idempotency keys), with timeouts, retries with full jitter, a retry budget, circuit breaker and bulkhead | `./run-06-service-reliability.sh` | [`logs/06-service-reliability.log`](logs/06-service-reliability.log) |
| 08 | [`08-saga/`](08-saga/) | Saga (orchestration) with compensations, a recoverable saga log and a durable timer woken by a poller | `./run-08-saga.sh` | [`logs/08-saga.log`](logs/08-saga.log) |
| 09 | [`09-outbox-polling/`](09-outbox-polling/) | Transactional Outbox with a Polling Publisher, Idempotent Consumer | `./run-09-outbox-polling.sh` | [`logs/09-outbox-polling.log`](logs/09-outbox-polling.log) |
| 10 | [`10-cdc-debezium/`](10-cdc-debezium/) | Change Data Capture via Postgres WAL and Debezium | `./run-10-cdc-debezium.sh` | [`logs/10-cdc-debezium.log`](logs/10-cdc-debezium.log) |
| 11 | [`11-outbox-debezium/`](11-outbox-debezium/) | Transactional Outbox relayed by transaction log tailing (Debezium EventRouter) | `./run-11-outbox-debezium.sh` | [`logs/11-outbox-debezium.log`](logs/11-outbox-debezium.log) |
| 12 | [`12-choreographed-saga/`](12-choreographed-saga/) | Saga (choreography) over per-service Transactional Outboxes, Idempotent Consumers, correlation and causation ids | `./run-12-choreographed-saga.sh` | [`logs/12-choreographed-saga.log`](logs/12-choreographed-saga.log) |
| 15 | [`15-multi-tenancy/`](15-multi-tenancy/) | Multi-tenant data isolation (pool with Row-Level Security, bridge, silo) and moving one tenant from the pool to its own database | `./run-15-multi-tenancy.sh` | [`logs/15-multi-tenancy.log`](logs/15-multi-tenancy.log) |
| 17 | [`17-audit-outbox/`](17-audit-outbox/) | Audit Log shipped through per-service Transactional Outboxes to a central append-only store | `./run-17-audit-outbox.sh` | [`logs/17-audit-outbox.log`](logs/17-audit-outbox.log) |
| 18 | [`18-crypto-shredding/`](18-crypto-shredding/) | Crypto-Shredding: per-subject data keys under envelope encryption, erasure by deleting the key | `./run-18-crypto-shredding.sh` | [`logs/18-crypto-shredding.log`](logs/18-crypto-shredding.log) |
| 19 | [`19-leader-election/`](19-leader-election/) | Leader Election with a lease (heartbeat, TTL, terms) and fencing tokens, plus a session advisory lock | `./run-19-leader-election.sh` | [`logs/19-leader-election.log`](logs/19-leader-election.log) |
| 24 | [`24-characterization/`](24-characterization/) | Characterization tests and a golden master on a PL/pgSQL legacy function; Feature Parity decided rule by rule (keep or fix) | `./run-24-characterization.sh` | [`logs/24-characterization.log`](logs/24-characterization.log) |
| 27 | [`27-import/`](27-import/) | Staged load with rejects and reconciliation: `COPY` into staging, SQL validation, upsert on the natural key, control totals | `./run-27-import.sh` | [`logs/27-import.log`](logs/27-import.log) |
| 30 | [`30-pipeline/`](30-pipeline/) | Deployment pipeline: gates in order, scheduled and tagged releases, the tested artifact deployed with an atomic switch | `./run-30-pipeline.sh` | [`logs/30-pipeline.log`](logs/30-pipeline.log) |
| 32 | [`32-casebook/`](32-casebook/) | A strangler migration planned on paper: discovery, C4 and sequence diagrams as code, requirements traced to journeys, phased plan and risks | `./run-32-casebook.sh` | [`logs/32-casebook.log`](logs/32-casebook.log) |
| 40 | `40-feature-flags/` (planned) | Release toggle, percentage rollout with stable hashing, kill switch, per-tenant targeting, flag removal | `./run-40-feature-flags.sh` | `logs/40-feature-flags.log` |

Natural next ones, not built yet: branch by abstraction, and an anti-corruption layer in front of a legacy model (41, planned, puts one in front of a partner CRM API).
