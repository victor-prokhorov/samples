# 04-parallel-run

**Pain: blind rewrite.** Tests cannot show that a rewrite matches legacy on every real input, so you find the differences after cutover, through users.

Scientist-style parallel run. `src/scientist.ts` runs legacy (control) and rewrite (candidate) on every input, returns the control result, and records mismatches and candidate exceptions. `src/shipping.ts` holds a legacy shipping calculator, a buggy rewrite (v1) and a fixed one (v2). 1000 seeded orders make the log reproducible. No infra.

```sh
npm i
npm start
```

Reach for it when replacing logic whose exact behavior nobody fully knows (pricing, tax, permissions), when outputs can be compared, before the rewrite serves anyone.

Do not reach for it when the code has side effects that must not happen twice (charging, emailing) and the candidate cannot be stubbed. Outputs are nondeterministic (timestamps, random ids) and you will not normalize them. The rewrite changes behavior on purpose: every mismatch is noise.

One-shot run with proof: `../run-04-parallel-run.sh` (log in `../logs/04-parallel-run.log`). Concepts explained in `../README.md`.
