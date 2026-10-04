# Multi-stage build: deps -> build -> prod-deps -> runtime. Only the last stage becomes the image.
#
# BASE is pinned by digest, not only by tag. "node:22-slim" moves every time a Node patch or a Debian
# security fix ships; the digest names one exact image, so a rebuild next month produces the same bytes
# and a reviewer can see when the base changes (a pull request bumps the digest, CI rebuilds and rescans).
# The tag stays in front of the digest for humans; Docker uses the digest. Find it with
#   docker buildx imagetools inspect node:22-slim      (the multi-arch index digest, below)
# and let Renovate or Dependabot open the bump pull requests.
# The run script overrides BASE only when this image cannot be pulled (see ./run.sh).
ARG BASE=node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

# 1. deps: every dependency, dev ones included, because the build needs TypeScript.
#    Only the manifests are copied first, so this layer is reused until package*.json changes.
#    Build-time secrets (a private registry token, a corporate CA) come in as secret mounts:
#    they exist for this one RUN and are never written to a layer or to the image history.
FROM ${BASE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=secret,id=npm_ca,required=false \
    --mount=type=cache,target=/root/.npm \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --no-audit --no-fund

# 2. build: compile TypeScript to dist/.
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# 3. prod-deps: a clean install without devDependencies (no TypeScript, no tsx, no @types).
FROM ${BASE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=secret,id=npm_ca,required=false \
    --mount=type=cache,target=/root/.npm \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --omit=dev --no-audit --no-fund

# 4. runtime: the base, the production node_modules, the compiled JS. No source, no compiler, no package manager.
FROM ${BASE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=${APP_VERSION} PORT=8080
# npm and corepack are not needed to run the app; removing them removes their CVEs from scanner reports.
# (The bytes stay in the base layer: a distroless base is the next step if size matters more.)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
# Files stay owned by root: the app user can read its code but cannot change it.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# The base image's "node" user, numeric so Kubernetes runAsNonRoot can verify it without reading /etc/passwd.
USER 1000:1000
EXPOSE 8080
# Liveness only: a database outage must not make Docker or an orchestrator restart a healthy process.
HEALTHCHECK --interval=2s --timeout=2s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Exec form: node is PID 1 and receives SIGTERM itself. The shell form (CMD node dist/app.js) runs
# /bin/sh -c, which does not forward the signal, so docker stop waits its timeout and then SIGKILLs.
CMD ["node", "dist/app.js"]
