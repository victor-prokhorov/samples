# 1. Postgres is the only database

Date: 2026-10-03

## Status

Accepted

## Context

The samples cover audit trails, schema changes, event sourcing, outboxes, sagas, partitioning, sharding, multi-tenancy, isolation levels, leases, imports, batch jobs and KPIs. Each topic has a specialised store that a production system might pick: an event store, a document database, Redis for locks, a queue, a warehouse. Using each would multiply the images to pull, the ports to manage and the APIs a reader must learn, and would hide the idea behind a product's feature list. A reader should be able to run any sample with Docker and Node and nothing else.

## Decision

Every sample that needs storage uses PostgreSQL 16 (`postgres:16`), one compose file per sample with its own port (`55430 + NN` for the samples from 21 on; the ports of the earlier ones are listed in the README). Locks, leases, queues, outboxes, event streams, audit stores, key stores and tenants are tables, constraints, transactions and the features Postgres already has (`SKIP LOCKED`, advisory locks, row-level security, logical decoding, partitioning, streaming replication). Other services run as npm processes or small fakes written in TypeScript (the OpenID provider in 26, the SMTP sink in 28). Kafka and Kafka Connect appear only in 09 to 12, where the broker and the WAL relay are the subject.

## Consequences

One image covers almost every sample, and the mechanism is visible in SQL that the run script dumps as proof. A reader learns one database deeply rather than five shallowly. The samples do not show the operational side of dedicated stores (Redis eviction, Kafka retention tuning), and some patterns are less efficient than on a purpose-built store; each folder README says when to reach for one instead.
