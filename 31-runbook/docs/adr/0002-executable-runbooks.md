# 2. Keep operating procedures as executable runbooks

Date: 2026-09-08

## Status

Accepted

## Context

Releases, the monthly data load and member requests were done from memory or from a wiki page that drifted from what people actually typed. A step skipped under pressure (the backup before a release) is found out only when it is needed. Fully automated pipelines are the goal, but some steps need a human (calling a member back to verify their identity), and automating everything at once was not affordable.

## Decision

Each procedure is a Markdown file in `runbooks/` with four required sections: Preconditions, Steps, Verification, Rollback. Steps that a machine can do are fenced `sh` blocks; steps only a person can do are fenced `manual` blocks. `src/runner.ts` runs a runbook top to bottom, stops at the first failure, prints the rollback, and can run it. Every run and step is recorded in `ops.runs` and `ops.steps`.

## Consequences

The document and the automation cannot drift apart, because they are the same file. Manual steps stay visible and get automated one at a time ("do-nothing scripting"). A runbook is code: it is reviewed, and `npm run docs-lint` fails the build when a section is missing. Shell in Markdown is harder to test than a script, so anything longer than a few lines moves to `ops/` and the runbook calls it.
