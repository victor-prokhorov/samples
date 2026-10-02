# 1. Record architecture decisions

Date: 2026-09-01

## Status

Accepted

## Context

The member portal is run by a small team. People join and leave, and decisions made in meetings (why the schema is migrated this way, why releases go out on Tuesdays) are lost with them. New members of the team cannot tell a deliberate choice from an accident, so they either undo it or are afraid to touch it.

## Decision

We record every decision that is expensive to reverse as an Architecture Decision Record in `docs/adr/`, numbered, in the format described by Michael Nygard: title, date, status, context, decision, consequences. A decision is never edited after it is accepted; a new record supersedes it and the old one's status links to it. `npm run docs-lint` checks the format.

## Consequences

Writing a record takes half an hour. Reviews of a change that contradicts a record point to it. The records explain the system's shape to new team members (see the onboarding checklist), but they are not documentation of how it works today: that is the code and the runbooks.
