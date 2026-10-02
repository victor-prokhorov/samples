# 30-pipeline

**Pain: checks that only run when someone remembers, and releases that happen whenever someone pushes.** A lint error, a type error or a broken page reaches the main branch because nobody ran the checks locally. Each job reinstalls the world from the network. A deploy goes out from a laptop on a Friday evening, nobody can say which commit is live, and a vulnerable dependency ships because the audit was "only a warning".

**Reach for it when** more than one person changes the code, or the same person ships more than once: every change goes through the same lint, type, test, accessibility and audit gates, and production only changes on an agreed schedule or a release tag.

**Do not reach for it when** the project is a throwaway script. You deploy many times a day with feature flags: deploy on every green main build instead of on a schedule (continuous deployment). The pipeline needs services (Postgres, a browser): use a runner with the Docker executor and `services:`, which `gitlab-ci-local` also supports.

A tiny TypeScript app (an annual statement page, `src/`) with a `.gitlab-ci.yml` that runs lint (eslint), typecheck (tsc), unit tests (vitest, JUnit report), an accessibility check (axe-core on the rendered page in jsdom), a dependency audit (npm audit), a build, and a deploy that only exists in scheduled or tagged pipelines. `gitlab-ci-local` runs it on this machine with the shell executor, each job in its own copy of the project. `github-actions/ci.yml` is the same pipeline for GitHub Actions, kept outside `.github/` so it does not run.

```sh
npm i
npm run lint && npm run typecheck && npm test && npm run a11y && npm run audit && npm run build   # the checks, by hand
npx gitlab-ci-local --list                                                       # jobs of a push pipeline
npx gitlab-ci-local --list --variable CI_PIPELINE_SOURCE=schedule                # jobs of a scheduled pipeline (with deploy)
npx gitlab-ci-local --shell-isolation                                            # run the push pipeline (needs rsync)
npx gitlab-ci-local --shell-isolation --variable CI_PIPELINE_SOURCE=schedule --variable DEPLOY_DIR=$PWD/.deploy
npm run demo                                                                     # the seven steps below
```

- `.gitlab-ci.yml` stages, workflow rules, npm cache keyed on `package-lock.json`, artifacts (JUnit, a11y report, `dist/`), the audit that only blocks releases, and the deploy job (`rules`, `needs`, `environment`, `resource_group`, symlink switch, smoke check).
- `github-actions/ci.yml` the same jobs for GitHub Actions: `needs`, `if`, `concurrency`, `continue-on-error`, `upload-artifact`.
- `src/statement.ts`, `src/page.ts`, `src/server.ts` the app: a statement total, the HTML page, a node:http server.
- `src/statement.test.ts` the vitest unit tests.
- `scripts/a11y.ts` axe-core on the rendered page in jsdom (WCAG 2.x A and AA rules that do not need layout), report in `reports/a11y.json`.
- `scripts/compare.ts` parses both pipeline files and checks they run the same commands per job.
- `scripts/demo.ts` drives `gitlab-ci-local`: lists jobs per trigger, a pipeline failing on a lint error, the same pipeline green, a scheduled deploy, a tagged deploy.
- `eslint.config.js`, `tsconfig.json`, `tsconfig.build.json` lint rules, the typecheck (no emit) and the build (emits `dist/`).

Needs `rsync` (gitlab-ci-local copies the project per job with it).

One-shot run with proof: `../run-30-pipeline.sh` (log in `../logs/30-pipeline.log`). Concepts explained in `../README.md`.
