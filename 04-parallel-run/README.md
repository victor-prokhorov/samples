# 04-parallel-run

**Pain: blind rewrite.** Tests cannot show that a rewrite matches legacy on every real input, so you find the differences after cutover, through users.

Scientist-style parallel run. `src/scientist.ts` runs legacy (control) and rewrite (candidate) on every input, returns the control result, and records mismatches and candidate exceptions. `src/shipping.ts` holds a legacy shipping calculator, a buggy rewrite (v1) and a fixed one (v2). 1000 seeded orders make the log reproducible. No infra.

```sh
npm i
npm start
```

One-shot run with proof: `../run-04-parallel-run.sh` (log in `../logs/04-parallel-run.log`). Concepts explained in `../README.md`.
